const vscode = require("vscode");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const util = require("node:util");

/** uri string -> decorations from the last run, so they survive tab switches. */
const results = new Map();
let output, statusItem, passType, failType, current;

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
    if (isSolution || /^test\(/.test(text)) lenses.push(new vscode.CodeLens(new vscode.Range(i, 0, i, 0), command));
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
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "typescript") {
    vscode.window.showWarningMessage("Open a practice .ts file to run it.");
    return;
  }
  const doc = editor.document;
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

  output.clear();
  output.show(true);
  output.appendLine(`$ node --test ${path.relative(cwd, file)}\n`);
  statusItem.text = "$(sync~spin) Running…";
  statusItem.show();
  results.delete(uri);
  paint(editor);

  const child = spawn(cfg.get("nodePath"), args, { cwd, env: { ...process.env, FORCE_COLOR: "0" } });
  current = child;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, cfg.get("timeoutSeconds") * 1000);
  child.stdout.on("data", (d) => output.append(d.toString()));
  child.stderr.on("data", (d) => output.append(d.toString()));
  child.on("error", (err) => {
    clearTimeout(timer);
    output.appendLine(`\nCould not start node: ${err.message}. Set practiceRunner.nodePath.`);
    statusItem.text = "$(error) Node not found";
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
      fail.push(decoration(editor.selection.active.line, `✗ timed out after ${cfg.get("timeoutSeconds")}s`));
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
  });
}

function deactivate() {
  current?.kill();
}

module.exports = { activate, deactivate };
