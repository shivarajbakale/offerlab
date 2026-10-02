import { SPEEDS, type Player } from "../player/usePlayer.ts";

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);
const ICONS = {
  first: "M6 5h2v14H6zM20 5v14L9 12z",
  prev: "M18 5v14L7 12zM5 5h2v14H5z",
  play: "M7 4v16l13-8z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  next: "M6 5v14l11-7zM17 5h2v14h-2z",
  last: "M4 5v14l11-7zM16 5h2v14h-2z",
};

export function Controls({ player }: { player: Player }) {
  const { index, count, playing } = player;
  return (
    <div className="controls">
      <div className="btns">
        <button className="btn" title="Restart (Home)" onClick={() => player.step(-count)}>
          <Icon d={ICONS.first} />
        </button>
        <button className="btn" title="Step back (←)" onClick={() => player.step(-1)}>
          <Icon d={ICONS.prev} />
        </button>
        <button className="btn primary" title="Play / pause (space)" onClick={player.toggle}>
          <Icon d={playing ? ICONS.pause : ICONS.play} />
        </button>
        <button className="btn" title="Step forward (→)" onClick={() => player.step(1)}>
          <Icon d={ICONS.next} />
        </button>
        <button className="btn" title="Jump to end (End)" onClick={() => player.step(count)}>
          <Icon d={ICONS.last} />
        </button>
      </div>
      <input
        className="scrub"
        type="range"
        min={0}
        max={Math.max(0, count - 1)}
        value={index}
        onChange={(e) => {
          player.pause();
          player.setIndex(Number(e.target.value));
        }}
      />
      <span className="counter">
        step {count ? index + 1 : 0} / {count}
      </span>
      <div className="speeds" title="Speed ([ and ])">
        {SPEEDS.map((s) => (
          <button key={s} className={s === player.speed ? "on" : ""} onClick={() => player.setSpeed(s)}>
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
