import { Code } from "@mantine/core";

/** A `@why` note: plain text with `backtick` spans shown as inline code. */
export function WhyText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <Code key={i}>{part.slice(1, -1)}</Code>
        ) : (
          part
        ),
      )}
    </>
  );
}
