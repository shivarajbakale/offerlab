import { useState } from "react";
import { patternById, type Pattern } from "../patterns/index.ts";
import { problems, type Problem } from "../problems.ts";
import { useTokens } from "./highlight.ts";

/** "Why this works and where else it works": the per-problem insight plus its pattern(s). */
export function IntuitionPanel({ problem, onSelect }: { problem: Problem; onSelect: (id: string) => void }) {
  const own = problem.patterns.map((id) => patternById.get(id)).filter((p): p is Pattern => Boolean(p));
  const [active, setActive] = useState(0);
  const pattern = own[active] ?? own[0];

  return (
    <div className="intuition">
      {problem.insight && (
        <section className="intu-card insight">
          <h3>Key insight</h3>
          <p>{problem.insight}</p>
        </section>
      )}

      {pattern && (
        <>
          <div className="intu-patterns">
            <span className="intu-label">Pattern</span>
            {own.map((p, i) => (
              <button key={p.id} className={`chip ${i === active ? "on" : ""}`} onClick={() => setActive(i)}>
                {p.name}
              </button>
            ))}
          </div>
          <PatternView key={pattern.id} pattern={pattern} problem={problem} onSelect={onSelect} />
        </>
      )}

      {problem.realWorld && (
        <section className="intu-card">
          <h3>This problem in the real world</h3>
          <p>{problem.realWorld}</p>
        </section>
      )}

      {!problem.insight && !pattern && <p className="intu-empty">No intuition notes for this problem yet.</p>}
    </div>
  );
}

function PatternView({ pattern, problem, onSelect }: { pattern: Pattern; problem: Problem; onSelect: (id: string) => void }) {
  const inApp = problems.filter((p) => p.patterns.includes(pattern.id));
  const total = inApp.length + pattern.related.length;
  return (
    <>
      <section className="intu-card">
        <h3>The intuition</h3>
        <p>{pattern.intuition}</p>
        <h4>Reach for it when you see</h4>
        <ul className="signals">
          {pattern.signals.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <h4>Template</h4>
        <Template id={`pattern:${pattern.id}`} code={pattern.template.replace(/^\n+|\s+$/g, "")} />
      </section>

      <section className="intu-card">
        <h3>
          Same trick solves <span className="count">{total}</span>
        </h3>
        <ul className="solves">
          {inApp.map((p) => (
            <li key={p.id} className={p.id === problem.id ? "current" : ""}>
              <button className="link" onClick={() => onSelect(p.id)} disabled={p.id === problem.id}>
                <span className="dot in" title="In this app" />
                <span className="num">{p.number}</span> {p.title}
              </button>
              <span className={`diff ${p.difficulty}`}>{p.difficulty}</span>
            </li>
          ))}
          {pattern.related.map((r) => (
            <li key={r.slug}>
              <a className="link" href={`https://leetcode.com/problems/${r.slug}/`} target="_blank" rel="noreferrer">
                <span className="dot" title="On LeetCode" />
                {r.title} <span className="ext">↗</span>
                {r.premium && <span className="premium" title="LeetCode Premium">Premium</span>}
              </a>
              <span className={`diff ${r.difficulty}`}>{r.difficulty}</span>
            </li>
          ))}
        </ul>
        <p className="legend">
          <span className="dot in" /> in this app (click to visualize) <span className="dot" /> practice on LeetCode
        </p>
      </section>

      <section className="intu-card">
        <h3>Where {pattern.name} shows up in real systems</h3>
        <dl className="real">
          {pattern.realWorld.map((r) => (
            <div key={r.title}>
              <dt>{r.title}</dt>
              <dd>{r.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

function Template({ id, code }: { id: string; code: string }) {
  const tokens = useTokens(id, code);
  return (
    <pre className="template">
      {tokens
        ? tokens.map((line, n) => (
            <div key={n}>
              {line.map((t, i) => (
                <span key={i} style={t.htmlStyle as React.CSSProperties}>
                  {t.content}
                </span>
              ))}
              {line.length === 0 && "\n"}
            </div>
          ))
        : code}
    </pre>
  );
}
