// Sliders for a design's knobs. A change is committed on release, which re-runs the scenario.

import { useState } from "react";
import type { Knob } from "../../../system-design/traffic/index.ts";
import { formatNumber, fromSlider, toSlider } from "./model.ts";

const NAMES: Record<string, string> = {
  qps: "Requests a second",
  apps: "App servers",
  cacheKeys: "Cache size (keys)",
  dbReplicas: "Database copies",
  lagMs: "Replica lag (ms)",
  consumers: "Queue consumers",
  writes: "Share of writes",
};

type Props = {
  knobs: Knob[];
  values: Record<string, number>;
  changed: boolean;
  busy: boolean;
  onCommit: (name: string, value: number) => void;
  onReset: () => void;
};

export function KnobBar({ knobs, values, changed, busy, onCommit, onReset }: Props) {
  const [drag, setDrag] = useState<{ name: string; value: number } | null>(null);
  if (!knobs.length) return null;
  return (
    <div className="knobs">
      {knobs.map((k) => {
        const v = drag?.name === k.knob ? drag.value : (values[k.knob] ?? k.value);
        const commit = () => {
          if (drag?.name !== k.knob) return;
          onCommit(k.knob, drag.value);
          setDrag(null);
        };
        return (
          <label key={k.knob} className="knob">
            <span className="knob-name">{NAMES[k.knob] ?? k.knob}</span>
            <input
              type="range"
              min={0}
              max={1000}
              value={toSlider(k, v)}
              onChange={(e) => setDrag({ name: k.knob, value: fromSlider(k, Number(e.target.value)) })}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
            />
            <span className="knob-value">{formatNumber(v)}</span>
          </label>
        );
      })}
      {busy && <span className="knob-busy">Simulating…</span>}
      {changed && (
        <button className="chaos-reset" onClick={onReset}>
          Reset knobs
        </button>
      )}
    </div>
  );
}
