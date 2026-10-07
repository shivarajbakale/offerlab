// The plain-English note at the top of a picture: what just happened, and whether it is good news.

import type { Caption } from "../../model/systems/types.ts";
import "./Callout.css";

const LABEL: Record<Caption["tone"], string> = { info: "What's happening", good: "Works", bad: "Problem" };

export function Callout({ caption }: { caption: Caption }) {
  return (
    <div className={`callout ${caption.tone}`} role="status">
      <span className="callout-tag">{LABEL[caption.tone]}</span>
      <span className="callout-text">{caption.text}</span>
    </div>
  );
}
