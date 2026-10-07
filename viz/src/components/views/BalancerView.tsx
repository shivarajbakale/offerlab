// A load balancer as a picture: requests arrive on the left, the balancer (or several) in the
// middle, servers on the right with their queues. A caption on top says what just happened.

import { AnimatePresence, motion } from "framer-motion";
import type { BalancerPanel } from "../../model/systems/balancer.ts";
import { Callout } from "./Callout.tsx";
import "./BalancerView.css";

const CARD_H = 76;
const GAP = 10;
const MAX_DOTS = 14;

export function BalancerView({ panel }: { panel: BalancerPanel }) {
  const n = panel.servers.length;
  const height = n * CARD_H + (n - 1) * GAP;
  const mid = (i: number) => i * (CARD_H + GAP) + CARD_H / 2;
  const fastest = Math.max(...panel.servers.map((s) => s.speed));

  return (
    <div className="lb-view">
      <Callout caption={panel.caption} />
      <div className="lb-stage" style={{ minHeight: height }}>
        <div className="lb-col lb-users">
          <div className="lb-users-box">
            <span className="lb-users-icon" aria-hidden>
              ●●●
            </span>
            <b>Users</b>
            <span>send requests</span>
          </div>
          <span className="lb-arrow" aria-hidden>
            →
          </span>
        </div>

        <div className="lb-col lb-balancers">
          {panel.balancers.map((b) => (
            <div key={b.label} className={`lb-balancer ${b.active ? "active" : ""}`}>
              <b>{b.label}</b>
              <span className="lb-strategy">{panel.strategy}</span>
              {b.view && (
                <span className="lb-seen" title="This balancer's copy of the counts, from the last refresh">
                  thinks: {b.view.map((c, i) => `${panel.servers[i]?.name} ${c}`).join(" · ")}
                </span>
              )}
              {panel.next !== undefined && b.active && <span className="lb-seen">next turn: {panel.servers[panel.next]?.name}</span>}
            </div>
          ))}
          <p className="lb-rule">{panel.rule}</p>
        </div>

        <svg className="lb-wires" viewBox={`0 0 60 ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden>
          {panel.servers.map((s, i) => (
            <line
              key={s.name}
              x1={0}
              y1={height / 2}
              x2={60}
              y2={mid(i)}
              className={`lb-wire ${s.target ? "target" : ""} ${s.sampled ? "sampled" : ""}`}
            />
          ))}
        </svg>

        <div className="lb-col lb-servers" style={{ gap: GAP }}>
          {panel.servers.map((s) => {
            const shown = Math.min(s.queue, MAX_DOTS);
            return (
              <div
                key={s.name}
                className={`lb-server ${s.backedUp ? "backed-up" : ""} ${s.target ? "target" : ""} ${s.sampled ? "sampled" : ""}`}
                style={{ height: CARD_H }}
              >
                <div className="lb-server-head">
                  <b>Server {s.name}</b>
                  <span className={`lb-speed ${s.speed < fastest ? "slow" : ""}`}>
                    {s.speed < fastest ? "slow · " : ""}finishes {s.speed}/tick
                  </span>
                  {s.sampled && <span className="lb-tag">sampled</span>}
                  {s.target && <span className="lb-tag target">← this request</span>}
                </div>
                <div className="lb-queue" title={`${s.queue} unfinished request${s.queue === 1 ? "" : "s"}`}>
                  <AnimatePresence initial={false}>
                    {Array.from({ length: shown }, (_, k) => (
                      <motion.span
                        key={k}
                        className={`lb-req ${k >= s.speed * 2 ? "late" : k >= s.speed ? "wait" : ""}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      />
                    ))}
                  </AnimatePresence>
                  {s.queue > MAX_DOTS && <span className="lb-more">+{s.queue - MAX_DOTS}</span>}
                  {s.queue === 0 && <span className="lb-idle">idle, nothing waiting</span>}
                  {s.queue > 0 && <span className="lb-count">{s.queue} unfinished</span>}
                </div>
                <div className="lb-server-foot">
                  got {s.got}
                  {s.gotThisTick > 0 && ` (${s.gotThisTick} this tick)`}
                  {s.slow > 0 && <span className="lb-slow"> · {s.slow} waited too long</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="lb-foot">
        <span>
          Tick <b>{panel.tick}</b> · {panel.sent} requests sent ·{" "}
          <span className={panel.slow ? "lb-slow" : ""}>
            {panel.slow} waited 2+ ticks
          </span>
        </span>
        <span className="lb-legend">
          <span className="lb-req" /> starts this tick
          <span className="lb-req wait" /> waits 1 tick
          <span className="lb-req late" /> waits 2+ ticks
        </span>
      </div>
    </div>
  );
}
