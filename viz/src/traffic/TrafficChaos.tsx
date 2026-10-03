// Chaos for architectures: kill, restart or slow a server, or kill a whole region, at the current moment, then watch.

import { useState } from "react";
import type { DesignView, TrafficFault } from "../../../system-design/traffic/index.ts";
import { faultLabel, faultRegions, faultTargets } from "./model.ts";

type Action = "kill" | "restart" | "slow" | "killRegion" | "restartRegion";

export function TrafficChaos({ design, t, faults, onAdd, onReset }: { design: DesignView; t: number; faults: TrafficFault[]; onAdd: (f: TrafficFault) => void; onReset: () => void }) {
  // Only regions some server is in: a region where only users live has nothing to kill.
  const regions = faultRegions(design);
  const [target, setTarget] = useState("");
  const [picked, setAction] = useState<Action>("kill");
  // A region action only makes sense while the design has regions.
  const action: Action = regions.length || (picked !== "killRegion" && picked !== "restartRegion") ? picked : "kill";
  const regional = action === "killRegion" || action === "restartRegion";
  const targets = regional ? regions : faultTargets(design);
  const at = Math.round(t);
  // The chosen server may not exist in this scenario (fewer replicas, another stage): fall back to the first.
  const chosen = targets.includes(target) ? target : (targets[0] ?? "");
  const add = () => {
    if (!chosen) return;
    if (action === "killRegion" || action === "restartRegion") onAdd({ at, kind: action, region: chosen });
    else onAdd(action === "slow" ? { at, kind: "slow", target: chosen, factor: 10, durationMs: 5000 } : { at, kind: action, target: chosen });
  };
  return (
    <div className="traffic-chaos" title="Replays this scenario with a fault added at the current moment">
      <span>⚡ Chaos at {(at / 1000).toFixed(1)} s:</span>
      <select value={action} onChange={(e) => setAction(e.target.value as Action)}>
        <option value="kill">kill</option>
        <option value="restart">restart (memory is wiped)</option>
        <option value="slow">slow down 10× for 5 s</option>
        {regions.length > 0 && <option value="killRegion">kill a whole region</option>}
        {regions.length > 0 && <option value="restartRegion">restart a region</option>}
      </select>
      <select value={chosen} onChange={(e) => setTarget(e.target.value)}>
        {targets.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <button onClick={add}>Inject</button>
      {faults.map((f, i) => (
        <span key={i} className="fault">
          {faultLabel(f)} @ {(f.at / 1000).toFixed(1)} s
        </span>
      ))}
      {faults.length > 0 && <button onClick={onReset}>Reset chaos</button>}
    </div>
  );
}
