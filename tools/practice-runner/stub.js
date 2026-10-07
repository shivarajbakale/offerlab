// Turns a worked solution from neetcode-150/ into its blank practice/ copy:
// keeps the problem statement, helpers and tests, stubs the solution.
const fs = require("node:fs");
const path = require("node:path");
const NODE_CLASSES = new Set(["ListNode", "TreeNode", "_Node", "GraphNode", "Interval"]);
const DECL = /^(export )?(function|class|const|let|type|interface) ([A-Za-z0-9_$]+)/;

function stubHeader(lines) {
  const end = lines.findIndex((l) => l.trim() === "*/");
  const head = lines.slice(0, end);
  const cut = head.findIndex((l) => /^ \* Approach/.test(l));
  let kept = cut === -1 ? head : head.slice(0, cut);
  while (kept.length && kept.at(-1).trim() === "*") kept.pop();
  return { header: [...kept, " */"], rest: lines.slice(end + 1) };
}

function blockEnd(lines, i, kind) {
  const closer = kind === "function" || kind === "class" ? /^\}/ : /^[}\])]/;
  if (/;\s*(\/\/.*)?$/.test(lines[i]) && !/[{[(]\s*$/.test(lines[i])) return i;
  for (let j = i + 1; j < lines.length; j++) if (closer.test(lines[j])) return j;
  throw new Error("unterminated block at " + i);
}

function sigEnd(lines, i) {
  for (let j = i; j < lines.length; j++) if (/\{\s*$/.test(lines[j])) return j;
  throw new Error("no signature end at " + i);
}

function stubFunction(block) {
  const s = sigEnd(block, 0);
  return [...block.slice(0, s + 1), "  // TODO: implement", '  throw new Error("Not implemented");', "}"];
}

function stubClass(block) {
  const out = [block[0]];
  for (let i = 1; i < block.length - 1; i++) {
    const l = block[i];
    const m = /^  (?!private |static )(constructor|[A-Za-z_$][\w$]*)\(/.exec(l);
    if (!m) continue;
    const s = sigEnd(block, i);
    if (out.length > 1) out.push("");
    out.push(...block.slice(i, s + 1));
    if (m[1] === "constructor") out.push("    // TODO: set up your data structures");
    else out.push("    // TODO: implement", '    throw new Error("Not implemented");');
    out.push("  }");
    // skip the method body
    let j = s + 1;
    while (j < block.length && !/^  \}/.test(block[j])) j++;
    i = j;
  }
  out.push("}");
  return out;
}

function transform(text) {
  const lines = text
    .split("\n")
    .filter((l) => !/^\s*\/\/ @why/.test(l))
    .map((l) => l.replace(/\s*\/\/ @say.*$/, ""));
  const { header, rest } = stubHeader(lines);

  // Split into top-level chunks, each with its leading comments.
  const chunks = [];
  let pending = [];
  for (let i = 0; i < rest.length; i++) {
    const l = rest[i];
    const m = DECL.exec(l);
    if (m || /^test\(/.test(l)) {
      const e = blockEnd(rest, i, m?.[2] ?? "test");
      chunks.push({
        exported: !!m?.[1],
        kind: m?.[2] ?? "test",
        name: m?.[3],
        pre: pending,
        body: rest.slice(i, e + 1),
      });
      pending = [];
      i = e;
    } else if (/^import /.test(l)) {
      chunks.push({ kind: "import", pre: pending, body: [l] });
      pending = [];
    } else if (l.trim() === "") {
      if (pending.length) pending.push(l);
    } else pending.push(l);
  }

  const isSolution = (c) => c.exported && !NODE_CLASSES.has(c.name) && (c.kind === "function" || c.kind === "class");
  const lastSolution = chunks.findLastIndex(isSolution);
  const removed = [];
  const out = [];
  chunks.forEach((c, idx) => {
    let body;
    if (isSolution(c)) body = c.kind === "class" ? stubClass(c.body) : stubFunction(c.body);
    else if (!c.exported && idx < lastSolution && ["function", "class", "type", "interface"].includes(c.kind)) {
      removed.push(c.name);
      return;
    } else body = c.body;
    const pre = c.pre.filter((l) => l.trim() !== "");
    if (c.kind !== "import" && out.length) out.push("");
    out.push(...(isSolution(c) ? [] : pre), ...body);
  });

  const note = [];
  if (removed.some((n) => /Heap/.test(n)))
    note.push("", "// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).");
  return [...header, "", ...out.slice(0, 2), ...note, ...out.slice(2), ""].join("\n");
}

module.exports = { transform };

// CLI: node tools/practice-runner/stub.js <solutions dir> <practice dir>
// Creates any missing practice files; set FORCE=1 to overwrite existing ones.
if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  for (const dir of fs.readdirSync(src).filter((d) => /^\d\d-/.test(d)).sort()) {
    fs.mkdirSync(path.join(dst, dir), { recursive: true });
    for (const f of fs.readdirSync(path.join(src, dir)).filter((f) => f.endsWith(".ts"))) {
      const target = path.join(dst, dir, f);
      if (fs.existsSync(target) && !process.env.FORCE) continue; // never clobber practice work
      fs.writeFileSync(target, transform(fs.readFileSync(path.join(src, dir, f), "utf8")));
    }
  }
}
