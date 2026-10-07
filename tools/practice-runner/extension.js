const vscode = require("vscode");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const util = require("node:util");
const { transform } = require("./stub.js");

/** uri string -> decorations from the last run, so they survive tab switches. */
const results = new Map();
let output, statusItem, passType, failType, current, panel, lastDoc;

function activate(context) {
  output = vscode.window.createOutputChannel("Practice Runner");
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = "practiceRunner.run";
  const after = { margin: "0 0 0 2em", fontStyle: "italic" };
  passType = vscode.window.createTextEditorDecorationType({
    after: { ...after, color: new vscode.ThemeColor("testing.iconPassed") },
  });
  failType = vscode.window.createTextEditorDecorationType({
    after: { ...after, color: new vscode.ThemeColor("testing.iconFailed") },
    backgroundColor: new vscode.ThemeColor("diffEditor.removedLineBackground"),
    isWholeLine: true,
  });

  context.subscriptions.push(
    output,
    statusItem,
    passType,
    failType,
    vscode.commands.registerCommand("practiceRunner.run", run),
    vscode.commands.registerCommand("practiceRunner.reset", reset),
    vscode.languages.registerCodeLensProvider({ language: "typescript", scheme: "file" }, { provideCodeLenses }),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    vscode.window.onDidChangeVisibleTextEditors((editors) => editors.forEach(paint)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length === 0 || !results.has(e.document.uri.toString())) return;
      results.delete(e.document.uri.toString());
      vscode.window.visibleTextEditors.filter((ed) => ed.document === e.document).forEach(paint);
      updateStatus(vscode.window.activeTextEditor);
    }),
  );
  updateStatus(vscode.window.activeTextEditor);
}

function isProblemFile(doc) {
  return doc?.languageId === "typescript" && /[\\/](practice|neetcode-150)[\\/]/.test(doc.uri.fsPath);
}

/** neetcode-150/<topic>/<file> for a practice/<topic>/<file>, or undefined. */
function solutionPath(file) {
  const m = /^(.*)[\\/]practice[\\/](\d\d-[^\\/]+[\\/][^\\/]+\.ts)$/.exec(file);
  return m && path.join(m[1], "neetcode-150", m[2]);
}

/** Put a practice file back to its blank state. Undoable with Cmd+Z. */
async function reset() {
  const active = vscode.window.activeTextEditor?.document;
  const doc = active?.languageId === "typescript" ? active : lastDoc;
  const source = doc && !doc.isClosed && solutionPath(doc.uri.fsPath);
  if (!source || !fs.existsSync(source)) {
    vscode.window.showWarningMessage("Reset works on files under practice/.");
    return;
  }
  const name = path.basename(doc.uri.fsPath, ".ts");
  const choice = await vscode.window.showWarningMessage(
    `Reset ${name}? Your code in this file is replaced with the blank version.`,
    { modal: true, detail: "You can undo this with Cmd+Z / Ctrl+Z while the file is open." },
    "Reset",
  );
  if (choice !== "Reset") return;

  const blank = transform(fs.readFileSync(source, "utf8"));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), blank);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
  results.delete(doc.uri.toString());
  vscode.window.visibleTextEditors.filter((ed) => ed.document === doc).forEach(paint);
  updateStatus(vscode.window.activeTextEditor);
  if (panel) showPanel({ title: name, reset: true });
}

/** "▶ Run" above the solution and above each test, inside the file itself. */
function provideCodeLenses(doc) {
  if (!isProblemFile(doc)) return [];
  const lenses = [];
  const command = { title: "▶ Run", command: "practiceRunner.run" };
  let solutionMarked = false;
  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    const isSolution =
      !solutionMarked && /^export (function|class) /.test(text) && !/^export class (ListNode|TreeNode|_Node|GraphNode|Interval)\b/.test(text);
    if (isSolution) solutionMarked = true;
    if (!isSolution && !/^test\(/.test(text)) continue;
    const range = new vscode.Range(i, 0, i, 0);
    lenses.push(new vscode.CodeLens(range, command));
    if (isSolution && solutionPath(doc.uri.fsPath))
      lenses.push(new vscode.CodeLens(range, { title: "↺ Reset", command: "practiceRunner.reset" }));
  }
  return lenses;
}

/** Status bar shows a Run button on problem files, until a run replaces it with the result. */
function updateStatus(editor) {
  if (current) return;
  if (!isProblemFile(editor?.document)) return statusItem.hide();
  const r = results.get(editor.document.uri.toString());
  statusItem.text = r?.summary ?? "$(play) Run problem";
  statusItem.show();
}

function paint(editor) {
  const r = results.get(editor.document.uri.toString());
  editor.setDecorations(passType, r?.pass ?? []);
  editor.setDecorations(failType, r?.fail ?? []);
}

function decoration(line, text, hover) {
  return {
    range: new vscode.Range(line, 0, line, 0),
    renderOptions: { after: { contentText: text } },
    hoverMessage: hover ? new vscode.MarkdownString().appendCodeblock(hover, "text") : undefined,
  };
}

function show(value) {
  return util.inspect(value, { depth: 4, breakLength: Infinity, maxArrayLength: 20 });
}

/** Line (0-based) to flag for a failure: the deepest stack frame inside this file. */
function failureLine(result, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const frame = new RegExp(`${escaped}:(\\d+):\\d+`);
  for (const l of (result.stack || "").split("\n")) {
    const m = frame.exec(l);
    if (m) return Number(m[1]) - 1;
  }
  return (result.line ?? 1) - 1;
}

async function run() {
  // When the results panel has focus there is no active text editor, so fall back to the last run file.
  const active = vscode.window.activeTextEditor?.document;
  const doc = active?.languageId === "typescript" ? active : lastDoc;
  if (!doc || doc.isClosed) {
    vscode.window.showWarningMessage("Open a practice .ts file to run it.");
    return;
  }
  lastDoc = doc;
  if (doc.isDirty) await doc.save();
  const file = doc.uri.fsPath;
  const uri = doc.uri.toString();
  current?.kill();

  const cfg = vscode.workspace.getConfiguration("practiceRunner");
  const cwd = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath ?? path.dirname(file);
  const jsonOut = path.join(os.tmpdir(), `practice-runner-${process.pid}-${Date.now()}.jsonl`);
  const args = [
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    `--test-reporter=${path.join(__dirname, "reporter.mjs")}`,
    `--test-reporter-destination=${jsonOut}`,
    file,
  ];

  const title = path.basename(file, ".ts");
  let log = "";
  output.clear();
  output.appendLine(`$ node --test ${path.relative(cwd, file)}\n`);
  showPanel({ title, running: true });
  statusItem.text = "$(sync~spin) Running…";
  statusItem.show();
  results.delete(uri);
  vscode.window.visibleTextEditors.filter((ed) => ed.document === doc).forEach(paint);

  const child = spawn(cfg.get("nodePath"), args, { cwd, env: { ...process.env, FORCE_COLOR: "0" } });
  current = child;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, cfg.get("timeoutSeconds") * 1000);
  const collect = (d) => {
    log += d.toString();
    output.append(d.toString());
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("error", (err) => {
    clearTimeout(timer);
    collect(`\nCould not start node: ${err.message}. Set practiceRunner.nodePath.\n`);
  });

  child.on("close", () => {
    clearTimeout(timer);
    if (current === child) current = undefined;
    let tests = [];
    try {
      tests = fs.readFileSync(jsonOut, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      fs.rmSync(jsonOut, { force: true });
    } catch {}
    tests = tests.filter((t) => t.file === file);

    const pass = [];
    const fail = [];
    for (const t of tests) {
      if (t.passed) {
        pass.push(decoration((t.line ?? 1) - 1, `✓ passed (${Math.round(t.ms ?? 0)} ms)`));
        continue;
      }
      const firstLine = (t.message || "failed").split("\n")[0];
      const text =
        "expected" in t
          ? `✗ expected ${show(t.expected)}, got ${show(t.actual)}`
          : `✗ ${firstLine}`;
      fail.push(decoration(failureLine(t, file), text, t.message));
    }
    if (timedOut) {
      output.appendLine(`\nKilled after ${cfg.get("timeoutSeconds")}s. Infinite loop?`);
      fail.push(decoration(0, `✗ timed out after ${cfg.get("timeoutSeconds")}s`));
    }

    const failed = tests.filter((t) => !t.passed).length;
    let summary;
    if (timedOut) summary = "$(watch) Timed out";
    else if (tests.length === 0) summary = "$(warning) No tests ran";
    else if (failed) summary = `$(error) ${failed}/${tests.length} failed`;
    else summary = `$(pass) ${tests.length}/${tests.length} passed`;

    results.set(uri, { pass, fail, summary });
    vscode.window.visibleTextEditors.filter((ed) => ed.document.uri.toString() === uri).forEach(paint);
    updateStatus(vscode.window.activeTextEditor);
    showPanel({ title, tests, log, summary, timedOut, timeout: cfg.get("timeoutSeconds") });
  });
}

/** Results open in a panel beside the code, reused across runs. */
function showPanel(state) {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "practiceRunner.results",
      "Test Results",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true },
    );
    panel.onDidDispose(() => (panel = undefined));
    panel.webview.onDidReceiveMessage((m) => (m === "run" ? run() : m === "reset" ? reset() : undefined));
  } else if (!panel.visible) {
    panel.reveal(undefined, true);
  }
  panel.webview.html = renderPanel(state);
}

function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function renderPanel({ title, running, reset, tests = [], log = "", timedOut, timeout }) {
  const failed = tests.filter((t) => !t.passed).length;
  let headline, tone;
  if (running) [headline, tone] = ["Running…", "muted"];
  else if (reset) [headline, tone] = ["Reset to the blank version. Run it when you are ready.", "muted"];
  else if (timedOut) [headline, tone] = [`Timed out after ${timeout}s. Infinite loop?`, "fail"];
  else if (tests.length === 0) [headline, tone] = ["No tests ran. Check the output below.", "fail"];
  else if (failed) [headline, tone] = [`${failed} of ${tests.length} failed`, "fail"];
  else [headline, tone] = [`All ${tests.length} passed`, "pass"];

  const cards = tests
    .map((t) => {
      const head = `<div class="row"><span class="${t.passed ? "pass" : "fail"}">${t.passed ? "✓" : "✗"}</span>
        <span class="name">${esc(t.name)}</span><span class="muted">${Math.round(t.ms ?? 0)} ms</span></div>`;
      if (t.passed) return `<div class="card">${head}</div>`;
      const compare =
        "expected" in t
          ? `<div class="grid"><div class="label">Expected</div><pre class="pass">${esc(show(t.expected))}</pre>
             <div class="label">Got</div><pre class="fail">${esc(show(t.actual))}</pre></div>`
          : "";
      return `<div class="card">${head}${compare}<pre>${esc(t.message || "failed")}</pre></div>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px 16px; }
  h1 { font-size: 1.1em; margin: 0 0 4px; font-weight: 600; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
  .headline { font-size: 1.05em; }
  .pass { color: var(--vscode-testing-iconPassed); }
  .fail { color: var(--vscode-testing-iconFailed); }
  .muted { color: var(--vscode-descriptionForeground); }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; }
  .row { display: flex; gap: 8px; align-items: baseline; }
  .name { flex: 1; font-weight: 600; }
  .grid { display: grid; grid-template-columns: max-content 1fr; gap: 4px 10px; margin-top: 8px; align-items: baseline; }
  .label { color: var(--vscode-descriptionForeground); }
  pre { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
        white-space: pre-wrap; word-break: break-word; margin: 6px 0 0; }
  .grid pre { margin: 0; }
  details pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; }
  summary { cursor: pointer; color: var(--vscode-descriptionForeground); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0;
           padding: 5px 12px; border-radius: 3px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .actions { display: flex; gap: 8px; }
</style></head><body>
<div class="top"><div><h1>${esc(title)}</h1><div class="headline ${tone}">${esc(headline)}</div></div>
<div class="actions"><button id="reset" class="secondary" ${running ? "disabled" : ""}>↺ Reset</button>
<button id="run" ${running ? "disabled" : ""}>▶ Run${reset ? "" : " again"}</button></div></div>
${cards}
${log ? `<details ${tests.length === 0 || timedOut ? "open" : ""}><summary>Full output</summary><pre>${esc(log)}</pre></details>` : ""}
<script>
  const api = acquireVsCodeApi();
  document.getElementById("run").addEventListener("click", () => api.postMessage("run"));
  document.getElementById("reset").addEventListener("click", () => api.postMessage("reset"));
</script>
</body></html>`;
}

function deactivate() {
  current?.kill();
}

module.exports = { activate, deactivate };
