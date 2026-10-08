import { ActionIcon, Button, Group, Kbd, SegmentedControl, Slider, Switch, Text, Tooltip } from "@mantine/core";
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
} from "@tabler/icons-react";
import { SPEEDS, type Player } from "../player/usePlayer.ts";

export type ScrubMark = { index: number; label: string; kind?: "broken" | "shrink" | "best" | "moment" };

/**
 * `counter` replaces the "step i / n" text; `marks` are labelled ticks over the scrubber: chaos events
 * (no kind), or key moments of a window story (a colored tick that jumps there when clicked).
 */
export function Controls({
  player,
  counter,
  marks,
  keyOnly,
}: {
  player: Player;
  counter?: string;
  marks?: ScrubMark[];
  /** "Key steps only": step between the steps that carry a written reason. */
  keyOnly?: { on: boolean; toggle: () => void; count: number };
}) {
  const { index, count, playing } = player;
  const go = (k: number) => {
    player.pause();
    player.setIndex(k);
  };
  return (
    <div className="controls">
      <Group className="btns" gap={4} wrap="nowrap">
        <Tooltip label="Restart (Home)">
          <ActionIcon variant="default" size="lg" onClick={() => player.step(-count)} aria-label="Restart">
            <IconPlayerSkipBackFilled size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Step back (←)">
          <ActionIcon variant="default" size="lg" onClick={() => player.step(-1)} aria-label="Step back">
            <IconPlayerTrackPrevFilled size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Play / pause (space)">
          <ActionIcon variant="filled" size="lg" w={44} onClick={player.toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <IconPlayerPauseFilled size={18} /> : <IconPlayerPlayFilled size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Step forward (→)">
          <ActionIcon variant="default" size="lg" onClick={() => player.step(1)} aria-label="Step forward">
            <IconPlayerTrackNextFilled size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Jump to end (End)">
          <ActionIcon variant="default" size="lg" onClick={() => player.step(count)} aria-label="Jump to end">
            <IconPlayerSkipForwardFilled size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div className="scrub-wrap">
        {marks?.map((m) =>
          m.kind ? (
            <Tooltip key={`${m.index}-${m.label}`} label={m.label}>
              <button
                className={`scrub-tick ${m.kind}`}
                style={{ left: `${(100 * m.index) / Math.max(1, count - 1)}%` }}
                aria-label={`Jump to: ${m.label}`}
                onClick={() => go(m.index)}
              />
            </Tooltip>
          ) : (
            <Tooltip key={`${m.index}-${m.label}`} label={m.label}>
              <span className="scrub-mark" style={{ left: `${(100 * m.index) / Math.max(1, count - 1)}%` }}>
                ⚡
              </span>
            </Tooltip>
          ),
        )}
        <Slider
          className="scrub"
          min={0}
          max={Math.max(0, count - 1)}
          value={index}
          onChange={go}
          label={null}
          size="sm"
          thumbSize={14}
          aria-label="Step"
        />
      </div>
      <Text span className="counter" ff="monospace" size="xs" c="dimmed">
        {counter ?? (
          <>
            <span className="counter-word">step </span>
            {count ? index + 1 : 0} / {count}
          </>
        )}
      </Text>
      {keyOnly && (
        <Tooltip label={`Step only through the ${keyOnly.count} steps that explain a decision (press k)`}>
          <Switch
            className="key-toggle"
            size="xs"
            checked={keyOnly.on}
            onChange={keyOnly.toggle}
            label={
              <>
                Key steps <Kbd size="xs">k</Kbd>
              </>
            }
          />
        </Tooltip>
      )}
      {/* Narrow screens show one button that cycles through the speeds instead of the full row. */}
      <Button
        className="speed-cycle"
        variant="default"
        size="compact-sm"
        ff="monospace"
        onClick={() => player.setSpeed(SPEEDS[(SPEEDS.indexOf(player.speed) + 1) % SPEEDS.length])}
        aria-label="Speed"
      >
        {player.speed}x
      </Button>
      <Tooltip label="Speed ([ and ])">
        <SegmentedControl
          className="speeds"
          size="xs"
          value={String(player.speed)}
          onChange={(v) => player.setSpeed(Number(v))}
          data={SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }))}
        />
      </Tooltip>
    </div>
  );
}
