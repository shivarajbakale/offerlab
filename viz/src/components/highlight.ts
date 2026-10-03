// Shared shiki highlighting (TypeScript, light + dark themes), cached by id.

import { useEffect, useState } from "react";
import type { ThemedToken } from "shiki";

type Tokens = ThemedToken[][];
const tokenCache = new Map<string, Tokens>();

let highlighterPromise: Promise<import("shiki/core").HighlighterCore> | null = null;
function highlighter() {
  highlighterPromise ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
  ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
    createHighlighterCore({
      themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
      langs: [import("@shikijs/langs/typescript")],
      engine: createJavaScriptRegexEngine(),
    }),
  );
  return highlighterPromise;
}

export function useTokens(id: string, code: string): Tokens | null {
  const [tokens, setTokens] = useState<{ id: string; t: Tokens } | null>(null);
  const cached = tokenCache.get(id);
  useEffect(() => {
    if (tokenCache.has(id)) return;
    let live = true;
    highlighter().then((h) => {
      const t = h.codeToTokens(code, {
        lang: "typescript",
        themes: { light: "github-light", dark: "github-dark" },
      }).tokens;
      tokenCache.set(id, t);
      if (live) setTokens({ id, t });
    });
    return () => {
      live = false;
    };
  }, [id, code]);
  if (cached) return cached;
  return tokens?.id === id ? tokens.t : null;
}
