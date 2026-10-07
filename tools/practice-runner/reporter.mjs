// Custom node:test reporter: one JSON line per finished test, read back by extension.js.
export default async function* reporter(source) {
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const { name, file, line, details } = event.data;
    const result = { passed: event.type === "test:pass", name, file, line, ms: details?.duration_ms };
    const wrapper = details?.error;
    if (wrapper) {
      const err = wrapper.cause ?? wrapper;
      result.message = String(err?.message ?? err);
      result.stack = err?.stack ?? "";
      if (err && "actual" in err && "expected" in err) {
        result.actual = err.actual;
        result.expected = err.expected;
      }
    }
    yield JSON.stringify(result) + "\n";
  }
}
