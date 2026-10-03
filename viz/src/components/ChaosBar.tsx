// Inject a fault at the moment being shown. The scenario replays from the start with the fault
// added, so everything after it is exactly what the protocol does about it.

import { useState } from "react";
import type { Fault } from "../../../system-design/kernel/types.ts";
import { describeFault } from "../sim/chaos.ts";

export function ChaosBar({
  ids,
  up,
  partitioned,
  t,
  faults,
  onAdd,
  onReset,
}: {
  ids: string[];
  up: Record<string, boolean>;
  partitioned: boolean;
  t: number;
  faults: Fault[];
  onAdd: (f: Fault) => void;
  onReset: () => void;
}) {
  const [isolate, setIsolate] = useState(ids[0] ?? "");
  const target = ids.includes(isolate) ? isolate : ids[0];
  return (
    <div className="chaos">
      <span className="chaos-label" title="Each button replays the scenario with that fault injected at this moment">
        Chaos at t={t}
      </span>
      {ids.map((id) => (
        <button key={id} className="chaos-btn" onClick={() => onAdd({ at: t, kind: up[id] ? "crash" : "recover", node: id })}>
          {up[id] ? `Crash ${id}` : `Restart ${id}`}
        </button>
      ))}
      <span className="chaos-group">
        <select value={target} onChange={(e) => setIsolate(e.target.value)} aria-label="Node to cut off">
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          className="chaos-btn"
          onClick={() => onAdd({ at: t, kind: "partition", groups: [[target], ids.filter((x) => x !== target)] })}
        >
          Cut off
        </button>
      </span>
      {partitioned && (
        <button className="chaos-btn" onClick={() => onAdd({ at: t, kind: "heal" })}>
          Heal network
        </button>
      )}
      <button className="chaos-btn" onClick={() => onAdd({ at: t, kind: "drop", count: 1 })}>
        Lose next message
      </button>
      <button className="chaos-btn" onClick={() => onAdd({ at: t, kind: "delay", extra: 5, until: t + 20 })}>
        Slow network
      </button>
      {faults.length > 0 && (
        <span className="chaos-list">
          Injected: {faults.map(describeFault).join(" · ")}
          <button className="chaos-reset" onClick={onReset}>
            Reset
          </button>
        </span>
      )}
    </div>
  );
}
