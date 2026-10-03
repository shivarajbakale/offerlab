// Runtime target of the instrumented code (`__rt`). Keeps a live call stack and
// records a Step snapshot for every traced statement.

import { Identity, Snapshot, shortLabel } from "./serialize.ts";
import type { Run, Step, StepEvent, Trace } from "./types.ts";

type Getters = Record<string, () => unknown>;
type Kind = "entry" | "inner" | "mute" | "quiet";

type LiveFrame = {
  name: string;
  muted: boolean;
  /** A quiet helper's frame: everything called beneath it runs silently (scenario mode only). */
  quiet: boolean;
  getters: Getters;
  params: string[];
  returned?: { value: unknown };
};

type RunBuilder = Run & {
  instance: object | null;
  className: string | null;
  ops: string[];
  totalSteps: number;
  /** One run per test() (scenario mode): the label is the test name and is never extended. */
  scenario: boolean;
  /** Source range of the statement behind the last "line" step, to decide whether to merge. */
  lastAt?: [number, number];
  /** Set when the run began in a derived constructor, whose `this` is unknown until super() runs. */
  ctorArgs?: string[];
};

export type TraceOptions = {
  /** Systems primitives: each test() is one run, and quiet helpers run silently. */
  scenarios?: boolean;
};

export type Limits = {
  maxStepsPerRun: number;
  maxTotalSteps: number;
  maxHeapObjects: number;
  maxItems: number;
};

export const DEFAULT_LIMITS: Limits = {
  maxStepsPerRun: 5000,
  maxTotalSteps: 60000,
  maxHeapObjects: 2000,
  maxItems: 100,
};

/** Systems views draw whole structures (ring tokens, bit arrays), so they may show more items. */
export const SYSTEMS_LIMITS: Limits = { ...DEFAULT_LIMITS, maxItems: 256 };

export class Recorder {
  private runs: RunBuilder[] = [];
  private current: RunBuilder | null = null;
  private stack: LiveFrame[] = [];
  private identity = new Identity();
  private totalSteps = 0;
  private skippedRuns = 0;
  private error: string | undefined;
  private limits: Limits;
  private scenarios: boolean;
  private scenarioRun: RunBuilder | null = null;

  constructor(limits: Limits = DEFAULT_LIMITS, options: TraceOptions = {}) {
    this.limits = limits;
    this.scenarios = Boolean(options.scenarios);
  }

  /** Object handed to instrumented code as `__rt`. */
  readonly api = {
    enter: (name: string, kind: Kind, line: number, getters: Getters, self: object | null) =>
      this.enter(name, kind, line, getters, self),
    exit: () => this.exit(),
    thrown: (err: unknown) => {
      // Only an error escaping the outermost traced frame ends the run.
      const traced = this.stack.filter((f) => !f.muted);
      const top = this.stack.at(-1);
      if (this.current && top && !top.muted && traced.length === 1 && !this.current.error) {
        this.current.error = errorMessage(err);
      }
    },
    step: (line: number, getters: Getters, event: StepEvent, at?: [number, number]) => {
      const top = this.stack.at(-1);
      if (!top || top.muted) return;
      top.getters = getters;
      this.record(line, event, at);
    },
    ret: (line: number, value: unknown, getters: Getters) => {
      const top = this.stack.at(-1);
      if (!top || top.muted) return value;
      if (Object.keys(getters).length) top.getters = getters;
      top.returned = { value };
      this.record(line, "return");
      return value;
    },
  };

  private enter(name: string, kind: Kind, line: number, getters: Getters, self: object | null) {
    const top = this.stack.at(-1);
    const tracing = this.stack.some((f) => !f.muted);
    const quietAbove = this.scenarios && this.stack.some((f) => f.quiet);
    const quiet = this.scenarios && kind === "quiet";
    const muted =
      quietAbove ||
      quiet ||
      kind === "mute" ||
      ((kind === "inner" || kind === "quiet") && (!tracing || (top?.muted ?? true)));
    if (!muted && !tracing) this.beginRun(name, getters, self);
    this.stack.push({ name, muted, quiet, getters, params: Object.keys(getters) });
    if (!muted) this.record(line, "call");
  }

  private exit() {
    const frame = this.stack.pop();
    if (!frame || frame.muted) return;
    const run = this.current;
    // A run begun by a derived constructor becomes a class run once its instance exists, so
    // later calls on that instance join it.
    if (run?.ctorArgs && !run.instance && !this.stack.some((f) => !f.muted)) {
      let self: unknown;
      try {
        self = frame.getters.this?.();
      } catch {
        self = undefined;
      }
      if (self && typeof self === "object") {
        run.instance = self;
        run.className = self.constructor?.name ?? frame.name.slice(4);
        run.ops = [`new(${run.ctorArgs.join(", ")})`];
        run.label = classLabel(run);
      }
      delete run.ctorArgs;
    }
    if (run && !run.className && !run.scenario && !this.stack.some((f) => !f.muted) && frame.returned) {
      run.label += ` → ${shortLabel(frame.returned.value)}`;
    }
  }

  private beginRun(name: string, getters: Getters, self: object | null) {
    if (this.scenarios) {
      this.current = this.scenarioRun; // null once the step budget is spent
      return;
    }
    const method = name.includes(".") ? name.split(".").pop()! : name;
    if (self && this.current?.instance === self) {
      this.current.ops.push(method);
      this.current.label = classLabel(this.current);
      return;
    }
    if (this.totalSteps >= this.limits.maxTotalSteps) {
      this.skippedRuns++;
      this.current = null;
      return;
    }
    const args = Object.entries(getters)
      .filter(([k]) => k !== "this")
      .map(([, g]) => {
        try {
          return shortLabel(g());
        } catch {
          return "?";
        }
      });
    const isClass = self !== null;
    const run: RunBuilder = {
      label: "",
      passed: null,
      steps: [],
      truncated: false,
      instance: self,
      className: isClass ? (self.constructor?.name ?? name) : null,
      ops: isClass ? [name.startsWith("new ") ? `new(${args.join(", ")})` : method] : [],
      totalSteps: 0,
      scenario: false,
    };
    run.label = isClass ? classLabel(run) : `${name}(${args.join(", ")})`;
    if (!isClass && name.startsWith("new ")) run.ctorArgs = args;
    this.runs.push(run);
    this.current = run;
  }

  private record(line: number, event: StepEvent, at?: [number, number]) {
    const run = this.current;
    if (!run) return;
    run.totalSteps++;
    if (run.steps.length >= this.limits.maxStepsPerRun || this.totalSteps >= this.limits.maxTotalSteps) {
      run.truncated = true;
      return;
    }
    this.totalSteps++;
    const snap = new Snapshot(this.identity, this.limits);
    const stack = this.stack
      .filter((f) => !f.muted)
      .map((f) => {
        const vars: [string, ReturnType<Snapshot["value"]>][] = [];
        for (const [key, get] of Object.entries(f.getters)) {
          let v: unknown;
          try {
            v = get();
          } catch {
            continue; // temporal dead zone: declared later in the block
          }
          vars.push([key, snap.value(v)]);
        }
        return {
          fn: f.name,
          params: f.params,
          vars,
          ...(f.returned ? { returned: snap.value(f.returned.value) } : {}),
        };
      });
    snap.drain();
    const step: Step = { line, event, stack, heap: snap.heap };
    // `if (c) x = 1;` yields two steps on one line with nothing executed between them: the
    // second statement sits inside the first. The next pass of `for (...) x += 1;` does not.
    const prev = run.steps.at(-1);
    const last = run.lastAt;
    run.lastAt = event === "line" ? at : undefined;
    const nested = !at || !last || (last[0] <= at[0] && at[1] <= last[1] && (last[0] !== at[0] || last[1] !== at[1]));
    if (prev && event === "line" && prev.event === "line" && prev.line === line && nested) {
      run.steps[run.steps.length - 1] = step;
      return;
    }
    run.steps.push(step);
  }

  /** Called by the test shim (scenario mode): every traced call until endScenario joins this run. */
  beginScenario(name: string) {
    if (!this.scenarios) return;
    if (this.totalSteps >= this.limits.maxTotalSteps) {
      this.skippedRuns++;
      this.scenarioRun = null;
      return;
    }
    const run: RunBuilder = {
      label: name,
      passed: null,
      steps: [],
      truncated: false,
      instance: null,
      className: null,
      ops: [],
      totalSteps: 0,
      scenario: true,
    };
    this.runs.push(run);
    this.scenarioRun = run;
    this.current = run;
  }

  endScenario() {
    if (!this.scenarios) return;
    const run = this.scenarioRun;
    // A test that made no traced calls has nothing to play.
    if (run && run.steps.length === 0) this.runs.splice(this.runs.indexOf(run), 1);
    this.scenarioRun = null;
    this.current = null;
    this.stack = [];
  }

  /** Called by the assert shim. Applies to the current scenario, or else the most recent run. */
  assertResult(pass: boolean) {
    const run = this.scenarios ? this.scenarioRun : this.runs.at(-1);
    if (run) run.passed = (run.passed ?? true) && pass;
  }

  fail(err: unknown) {
    const msg = errorMessage(err);
    if (this.current?.error !== msg) this.error = msg;
    this.stack = [];
  }

  finish(): Trace {
    const runs: Run[] = this.runs.map(({ label, passed, steps, truncated, error }) => ({
      label,
      passed,
      steps,
      truncated,
      ...(error ? { error } : {}),
    }));
    return { runs, skippedRuns: this.skippedRuns, ...(this.error ? { error: this.error } : {}) };
  }
}

function classLabel(run: RunBuilder): string {
  const ops = run.ops.slice(0, 6).join(", ") + (run.ops.length > 6 ? ", …" : "");
  return `${run.className}: ${ops}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
