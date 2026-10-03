// Drill text with the lesson Markdown subset: **bold**, *italic*, `code` and [links](#...).

import { parseInline } from "../sim/lesson.ts";

export function Rich({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((x, i) =>
        x.kind === "bold" ? (
          <strong key={i}>{x.text}</strong>
        ) : x.kind === "italic" ? (
          <em key={i}>{x.text}</em>
        ) : x.kind === "code" ? (
          <code key={i}>{x.text}</code>
        ) : x.kind === "link" ? (
          <a key={i} href={x.href} {...(x.href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer" })}>
            {x.text}
          </a>
        ) : (
          <span key={i}>{x.text}</span>
        ),
      )}
    </>
  );
}
