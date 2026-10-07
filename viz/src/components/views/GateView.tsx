// A gate between callers and a server: the caller (or callers) on the left, the gate in the middle
// with its state and meter, the server on the right, and the latest request's fate drawn on the
// path between them.

import { motion } from "framer-motion";
import type { GateEvent, GatePanel } from "../../model/systems/gate.ts";
import "./GateView.css";

const ICON: Record<GateEvent["outcome"], string> = { passed: "✓", failed: "✗", refused: "✗", queued: "…" };
const WORD: Record<GateEvent["outcome"], string> = { passed: "reached the server", failed: "failed at the server", refused: "turned away", queued: "waiting in line" };

function Meter({ meter }: { meter: NonNullable<GatePanel["meter"]> }) {
  const { level, max, unit } = meter;
  const plural = (n: number) => (unit ? ` ${unit}${n === 1 ? "" : "s"}` : "");
  const slots = max !== undefined && max <= 24 ? Math.max(max, Math.ceil(level)) : 0;
  return (
    <div className="gate-meter">
      {slots > 0 ? (
        <div className="gate-slots" aria-hidden>
          {Array.from({ length: slots }, (_, i) => {
            const fill = Math.max(0, Math.min(1, level - i));
            return (
              <span key={i} className={`gate-slot ${i >= (max ?? 0) ? "over" : ""}`}>
                <motion.span className="gate-slot-fill" initial={false} animate={{ height: `${fill * 100}%` }} transition={{ duration: 0.3 }} />
              </span>
            );
          })}
        </div>
      ) : (
        max !== undefined && (
          <div className="gate-bar">
            <motion.span initial={false} animate={{ width: `${Math.min(100, (level / max) * 100)}%` }} />
          </div>
        )
      )}
      <span className="gate-meter-text">
        <b>{level}</b>
        {max !== undefined ? ` of ${max}` : ""}
        {plural(level)}
      </span>
    </div>
  );
}

export function GateView({ panel }: { panel: GatePanel }) {
  const ev = panel.latest;
  const over = panel.server?.cap !== undefined && panel.server.load > panel.server.cap;
  return (
    <div className="gate-view">
      <div className="gate-stage">
        <div className="gate-col gate-from">
          {panel.clients ? (
            <div className="gate-clients">
              {panel.clients.map((c) => (
                <span key={c.name} className={`gate-client ${c.last?.outcome ?? ""}`} title={c.last?.label}>
                  {c.name}
                  {c.last && <i>{ICON[c.last.outcome]}</i>}
                </span>
              ))}
            </div>
          ) : (
            <div className="gate-box">
              <b>{panel.from}</b>
              <span>sends requests</span>
            </div>
          )}
        </div>

        <div className="gate-wire">
          <span className={`gate-arrow ${ev && ev.outcome !== "passed" && ev.outcome !== "failed" ? ev.outcome : ""}`}>→</span>
        </div>

        <div className={`gate-col gate-box gate-main state-${(panel.state ?? "").replace(/\s+/g, "-")}`}>
          <b>{panel.title}</b>
          {panel.state && <span className="gate-state">{panel.state}</span>}
          {panel.meter && <Meter meter={panel.meter} />}
        </div>

        <div className="gate-wire">
          <span className={`gate-arrow ${ev?.outcome === "passed" ? "passed" : ev?.outcome === "failed" ? "failed" : "idle"}`}>→</span>
        </div>

        <div className={`gate-col gate-box gate-to ${over ? "over" : ""}`}>
          <b>{panel.to}</b>
          {panel.server ? (
            <span>
              {panel.server.load} request{panel.server.load === 1 ? "" : "s"} this tick
              {panel.server.cap !== undefined && <> · handles {panel.server.cap}</>}
            </span>
          ) : (
            <span>does the work</span>
          )}
        </div>
      </div>

      {ev && (
        <motion.div
          key={`${ev.t}:${panel.counts.passed + panel.counts.failed + panel.counts.refused + panel.counts.queued}`}
          className={`gate-event ${ev.outcome} ${ev.fresh ? "fresh" : ""}`}
          initial={ev.fresh ? { opacity: 0, y: -4 } : false}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="gate-event-icon">{ICON[ev.outcome]}</span>
          <span>
            {ev.fresh ? "Just now" : "Last request"} (t={ev.t}
            {ev.row ? `, ${ev.row}` : ""}): {WORD[ev.outcome]} — {ev.label}
          </span>
        </motion.div>
      )}

      <div className="gate-foot">
        <span className="ok">✓ {panel.counts.passed} through</span>
        {panel.counts.queued > 0 && <span className="queued">… {panel.counts.queued} queued</span>}
        {panel.counts.refused > 0 && <span className="refused">✗ {panel.counts.refused} turned away</span>}
        {panel.counts.failed > 0 && <span className="failed">✗ {panel.counts.failed} failed at the server</span>}
      </div>
    </div>
  );
}
