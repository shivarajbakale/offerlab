// The clicked box, explained: its job, life without it, the frontend idea it resembles, its
// numbers in words, the problems at it now, and a way to see what happens if it breaks.

import type { Callout, ComponentView, DesignView, Frame } from "../../../system-design/traffic/index.ts";
import { guideFor, metricWords } from "./explain.ts";

type Props = {
  comp: ComponentView;
  design: DesignView;
  frame: Frame;
  notes: Callout[];
  /** "new" or "changed" compared with the stage before, and that stage's version of this box. */
  diff?: "new" | "changed";
  before?: ComponentView;
  /** Kill every machine of this box from now on, to see what it was holding up. */
  onTurnOff?: () => void;
  onClose: () => void;
};

export function BoxInspector({ comp, design, frame, notes, diff, before, onTurnOff, onClose }: Props) {
  const g = guideFor(comp, design);
  const lines = metricWords(comp, frame);
  return (
    <div className="insp">
      <div className="insp-head">
        <b>{comp.label}</b>
        <span className="insp-tag">{g.tagline}</span>
        <button className="wf-close" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="insp-facts">
        <div>
          <dt>Its job</dt>
          <dd>{g.job}</dd>
        </div>
        <div>
          <dt>Without it</dt>
          <dd>{g.without}</dd>
        </div>
        <div>
          <dt>In frontend terms</dt>
          <dd>{g.frontend}</dd>
        </div>
        {diff && (
          <div>
            <dt>{diff === "new" ? "New in this stage" : "Changed in this stage"}</dt>
            <dd>
              {diff === "new"
                ? "The stage before didn't have this box. Compare the two stages' numbers to see what it bought."
                : before
                  ? `Before: ${before.replicas} machine${before.replicas === 1 ? "" : "s"} with ${before.cores} cores${before.sessions ? `, sessions ${before.sessions}` : ""}. Now: ${comp.replicas} with ${comp.cores}${comp.sessions ? `, sessions ${comp.sessions}` : ""}.`
                  : "Resized since the stage before."}
            </dd>
          </div>
        )}
      </dl>
      {lines.length > 0 && (
        <div className="insp-metrics">
          <div className="insp-sub">Right now</div>
          {lines.map((l) => (
            <div key={l.name} className={`insp-metric ${l.tone}`}>
              <span className="insp-name">{l.name}</span>
              <span className="insp-value">{l.value}</span>
              <span className="insp-says">{l.says}</span>
            </div>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div className="insp-metrics">
          <div className="insp-sub">Problems here</div>
          {notes.map((n) => (
            <div key={n.rule} className={`arch-note sev${n.severity}`}>
              {n.text}
            </div>
          ))}
        </div>
      )}
      {onTurnOff && (
        <div className="insp-off">
          <button className="arch-trace" onClick={onTurnOff}>
            What if it breaks? Turn it off now
          </button>
          <span>Every machine of this box is killed from this moment, and the run replays so you can watch what depended on it.</span>
        </div>
      )}
    </div>
  );
}
