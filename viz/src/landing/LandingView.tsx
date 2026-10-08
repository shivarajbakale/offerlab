// The front door: what Offerlab is, shown running. A first visit lands here; Start opens the
// Algorithms overview and every station on the map opens its real topic.

import { ActionIcon, Button, Group, SegmentedControl } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { problems } from "../problems.ts";
import { Illustration } from "./Illustrations.tsx";
import { Race } from "./Race.tsx";
import { prefersReducedMotion } from "./reducedMotion.ts";
import { RouteMap } from "./RouteMap.tsx";
import { LINES, TOUR, allStations } from "./stations.ts";
import "./landing.css";

const REPO = "https://github.com/shivarajbakale/offerlab";
const BASE = import.meta.env.BASE_URL;

const SCREENS = [
  { key: "algo", label: "Algorithms", src: "landing/algo.jpg", caption: "A sliding-window solution running step by step, next to its code." },
  { key: "design", label: "System design", src: "landing/design.jpg", caption: "Case studies: tune the load, add servers, inject failures." },
  { key: "blocks", label: "Building blocks", src: "landing/blocks.jpg", caption: "Every message between nodes, step by step." },
];

const KEYS: { keys: string[]; match: string[]; does: string }[] = [
  { keys: ["space"], match: [" "], does: "play and pause" },
  { keys: ["←", "→"], match: ["ArrowLeft", "ArrowRight"], does: "step back and forward" },
  { keys: ["[", "]"], match: ["[", "]"], does: "slower and faster" },
  { keys: ["i"], match: ["i"], does: "show the intuition" },
  { keys: ["e"], match: ["e"], does: "explain each line" },
];

const INSTALL = `git clone ${REPO}.git
cd offerlab
npm install && npm --prefix viz install
npm run viz`;

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const ARROW = "M5 12h14M13 6l6 6-6 6";
const COPY = "M9 9h10v10H9zM5 15V5h10";
const CHECK = "M5 12l5 5 9-10";

function GitHubMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function LandingView({ onOpen }: { onOpen: (id: string) => void }) {
  const stations = useMemo(() => allStations().filter((s) => problems.some((p) => p.id === s.id)), []);
  const [selected, setSelected] = useState(TOUR[0]);
  const [hover, setHover] = useState<string | null>(null);
  const [touring, setTouring] = useState(() => !prefersReducedMotion());
  const [visible, setVisible] = useState(true);
  const [screen, setScreen] = useState(SCREENS[0].key);
  const [pressed, setPressed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const shownKey = hover ?? selected;
  const station = stations.find((s) => s.key === shownKey) ?? stations[0];

  // The tour rides on until the visitor picks a station, and waits while the map is off screen.
  useEffect(() => {
    if (!touring || !visible) return;
    const id = setInterval(() => {
      setSelected((cur) => TOUR[(TOUR.indexOf(cur) + 1) % TOUR.length]);
    }, 6000);
    return () => clearInterval(id);
  }, [touring, visible]);

  useEffect(() => {
    const el = hero.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keycaps light up when their key is pressed anywhere on the page.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = KEYS.find((x) => x.match.includes(e.key));
      if (!k || (e.target as HTMLElement)?.closest?.("button, a, [role=button], input, textarea")) return;
      if (e.key === " ") e.preventDefault();
      setPressed(e.key);
    };
    const up = () => setPressed(null);
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, []);

  const pick = useCallback((key: string) => {
    setTouring(false);
    setSelected(key);
  }, []);

  const step = (dir: 1 | -1) => {
    const i = stations.findIndex((s) => s.key === selected);
    pick(stations[(i + dir + stations.length) % stations.length].key);
  };

  const scrollTo = (id: string) => {
    scroller.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the commands stay selectable.
    }
  };

  const start = () => onOpen("overview/algorithms");
  const shot = SCREENS.find((s) => s.key === screen)!;

  return (
    <div className="landing" ref={scroller}>
      <header className="ln-nav">
        <div className="ln-brand">
          <img src={`${BASE}favicon.svg`} alt="" width={30} height={30} />
          Offerlab
        </div>
        <Group component="nav" gap={4} aria-label="Page sections">
          <Button variant="subtle" color="gray" onClick={() => scrollTo("map")}>Tracks</Button>
          <Button variant="subtle" color="gray" onClick={() => scrollTo("naive")}>How it teaches</Button>
          <Button variant="subtle" color="gray" onClick={() => scrollTo("screens")}>Screens</Button>
          <Button variant="subtle" color="gray" onClick={() => scrollTo("local")}>Run locally</Button>
        </Group>
        <Group gap="xs" ml="auto">
          <ActionIcon component="a" variant="subtle" color="gray" size="lg" href={REPO} target="_blank" rel="noreferrer" aria-label="Offerlab on GitHub">
            <GitHubMark />
          </ActionIcon>
          <Button radius="xl" onClick={start}>
            Open the lab
          </Button>
        </Group>
      </header>

      <section className="ln-hero" id="map" ref={hero}>
        <div className="ln-hero-copy">
          <h1>
            Interview prep you can <em>watch run</em>.
          </h1>
          <p className="ln-lede">The NeetCode 150 and system design from first principles, step by step, in your browser.</p>
          <Group gap="sm">
            <Button size="lg" radius="xl" onClick={start} rightSection={<Icon d={ARROW} />}>
              Start with Algorithms
            </Button>
            <Button component="a" size="lg" radius="xl" variant="default" href={REPO} target="_blank" rel="noreferrer" leftSection={<GitHubMark />}>
              Source on GitHub
            </Button>
          </Group>
          <ul className="ln-legend" aria-label="Tracks">
            {LINES.map((l) => (
              <li key={l.key}>
                <button onClick={() => onOpen(l.overview)}>
                  <span className="ln-swatch" style={{ background: l.color }} />
                  <span className="ln-legend-name">{l.name}</span>
                  <span className="ln-legend-count">{l.count}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="ln-fine">Free and open source. Works offline once loaded.</p>
        </div>

        <div className="ln-hero-map">
          <div className="ln-map-scroll">
            <RouteMap selected={shownKey} onPick={pick} onHover={setHover} onHub={start} trains={!reduced} />
          </div>
          <div className="ln-station" aria-live="polite">
            <div className="ln-station-scene">
              <div key={station.key} className="ln-swap">
                <Illustration kind={station.illus} color={station.line.color} playing={visible} />
              </div>
            </div>
            <div className="ln-station-info">
              <div className="ln-station-line">
                <span className="ln-swatch" style={{ background: station.line.color }} />
                {station.line.name}
                {touring && <span className="ln-touring">touring the map</span>}
              </div>
              <h2>{station.label}</h2>
              <p>{station.watch}</p>
              <div className="ln-station-actions">
                <Button radius="xl" onClick={() => onOpen(station.id)} rightSection={<Icon d={ARROW} size={16} />}>
                  Open this lesson
                </Button>
                <Group gap={6}>
                  <ActionIcon variant="default" radius="xl" size="lg" aria-label="Previous station" onClick={() => step(-1)}>
                    <Icon d="M15 6l-6 6 6 6" />
                  </ActionIcon>
                  <ActionIcon variant="default" radius="xl" size="lg" aria-label="Next station" onClick={() => step(1)}>
                    <Icon d="M9 6l6 6-6 6" />
                  </ActionIcon>
                </Group>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ln-section ln-naive" id="naive">
        <div className="ln-section-head">
          <h2>The naive way fails first.</h2>
          <p>
            Every lesson opens with what the idea is and the problem it solves, then runs the obvious approach until you can see why it
            breaks. Here is Two Sum, both ways, on the same twelve numbers.
          </p>
        </div>
        <Race />
      </section>

      <section className="ln-section ln-screens" id="screens">
        <div className="ln-section-head">
          <h2>Every step sits next to the line that caused it.</h2>
          <p>Solutions and simulations run for real. Pointers slide, trees re-link, queues back up and servers fall over while the code highlights.</p>
        </div>
        <SegmentedControl
          className="ln-tabs"
          radius="xl"
          size="md"
          aria-label="Screens"
          value={screen}
          onChange={setScreen}
          data={SCREENS.map((s) => ({ value: s.key, label: s.label }))}
        />
        <figure className="ln-shot">
          <div className="ln-shot-bar" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <img key={shot.key} className="ln-swap" src={`${BASE}${shot.src}`} alt={shot.caption} width={1600} height={1000} loading="lazy" />
          <figcaption>{shot.caption}</figcaption>
        </figure>
      </section>

      <section className="ln-section ln-keys">
        <div className="ln-section-head">
          <h2>Drive it from the keyboard.</h2>
          <p>Try the keys now. The same ones work inside every lesson.</p>
        </div>
        <ul className="ln-keylist">
          {KEYS.map((k) => (
            <li key={k.does}>
              <span className="ln-caps">
                {k.keys.map((c, i) => (
                  <kbd key={c} className={pressed === k.match[i] ? "down" : ""}>
                    {c}
                  </kbd>
                ))}
              </span>
              <span>{k.does}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ln-section ln-local" id="local">
        <div className="ln-local-copy">
          <h2>Yours to run, read and change.</h2>
          <p>
            MIT licensed. Every problem is one self-contained TypeScript file with its tests, so you can run it with <code>node --test</code>, break it,
            and watch what changes. You need Node.js 26 or newer.
          </p>
          <Group gap="sm">
            <Button size="lg" radius="xl" onClick={start} rightSection={<Icon d={ARROW} />}>
              Start with Algorithms
            </Button>
            <Button component="a" size="lg" radius="xl" variant="default" href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
              Contribute
            </Button>
          </Group>
        </div>
        <div className="ln-terminal">
          <div className="ln-terminal-bar">
            <span>terminal</span>
            <Button size="compact-sm" variant="light" color={copied ? "teal" : "gray"} onClick={copy} aria-label="Copy the commands" leftSection={<Icon d={copied ? CHECK : COPY} size={15} />}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre>
            {INSTALL.split("\n").map((l) => (
              <span key={l}>
                <i aria-hidden="true">$ </i>
                {l}
                {"\n"}
              </span>
            ))}
          </pre>
          <p className="ln-terminal-note">Opens the visualizer at localhost:5173.</p>
        </div>
      </section>

      <footer className="ln-foot">
        <div className="ln-brand">
          <img src={`${BASE}favicon.svg`} alt="" width={24} height={24} />
          Offerlab
        </div>
        <p>Problem names link to LeetCode. LeetCode and NeetCode are trademarks of their owners; Offerlab is not affiliated with either.</p>
        <a href={REPO} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
