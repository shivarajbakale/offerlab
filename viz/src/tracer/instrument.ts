// Babel plugin that turns a NeetCode solution file into a self-tracing script.
//
// - strips TypeScript types (preset-typescript)
// - rewrites `import x from "m"` to `const x = __require("m").default` and drops `export`
// - wraps every traced function body in __rt.enter / try { ... } finally { __rt.exit() }
// - inserts __rt.step(line, getters) before each statement and at each loop test
// - rewrites `return e` to `return __rt.ret(line, e, getters)`
//
// Function kinds (decided at runtime by the recorder):
//   entry  exported function / method of an exported class: starts a run
//   inner  other top-level function or nested function: traced only when called from traced code
//   mute   method of a non-exported class (heaps, trie nodes): runs silently

import Babel from "@babel/standalone";

/* eslint-disable @typescript-eslint/no-explicit-any */
type NodePath = any;
type Kind = "entry" | "inner" | "mute";
type FnInfo = { kind: Kind; name: string; isMethod: boolean } | null;

const RT = "__rt";
const GENERATED = "__vizGenerated";

const LOOP_BODY_PARENTS = new Set([
  "WhileStatement",
  "DoWhileStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
]);

function vizPlugin({ types: t }: { types: any }) {
  const exported = new Set<string>();
  const dataClasses = new Set<string>();
  const infoCache = new WeakMap<object, FnInfo>();
  const done = new WeakSet<object>();

  const gen = <T>(node: T): T => {
    (node as any)[GENERATED] = true;
    return node;
  };
  const rtCall = (method: string, args: any[]) =>
    t.callExpression(t.memberExpression(t.identifier(RT), t.identifier(method)), args);

  function className(classPath: NodePath): string {
    return classPath.node.id?.name ?? "Anonymous";
  }

  function fnInfo(path: NodePath): FnInfo {
    if (infoCache.has(path.node)) return infoCache.get(path.node)!;
    const info = computeInfo(path);
    infoCache.set(path.node, info);
    return info;
  }

  function computeInfo(path: NodePath): FnInfo {
    const node = path.node;
    if (node.generator || node.async) return null;
    const parentFn = path.parentPath.getFunctionParent();

    if (path.isClassMethod()) {
      const classPath = path.parentPath.parentPath;
      const cls = className(classPath);
      if (dataClasses.has(cls)) return null;
      if (parentFn && !fnInfo(parentFn)) return null;
      const method = node.key.name ?? "method";
      const name = node.kind === "constructor" ? `new ${cls}` : `${cls}.${method}`;
      const kind: Kind = parentFn ? "inner" : exported.has(cls) ? "entry" : "mute";
      return { kind, name, isMethod: true };
    }

    let name = node.id?.name as string | undefined;
    if (!name && path.parentPath.isVariableDeclarator()) name = path.parentPath.node.id.name;
    if (!name && path.parentPath.isAssignmentExpression()) {
      const left = path.parentPath.node.left;
      name = left.name ?? left.property?.name;
    }

    if (parentFn) {
      if (!fnInfo(parentFn)) return null;
      // Expression-bodied arrows (comparators, tiny helpers) stay untraced to keep noise down.
      if (path.isArrowFunctionExpression() && !t.isBlockStatement(node.body)) return null;
      return { kind: "inner", name: name ?? "λ", isMethod: false };
    }

    // Top level: function declarations and `const f = () => {}`. Callbacks such as
    // `test("...", () => {...})` have no name and are not traced.
    if (!name) return null;
    if (path.isFunctionDeclaration() || path.parentPath.isVariableDeclarator()) {
      return { kind: exported.has(name) ? "entry" : "inner", name, isMethod: false };
    }
    return null;
  }

  /** Object literal of getters for every binding visible from `path` inside its function. */
  function getters(path: NodePath, fnPath: NodePath, includeThis: boolean, paramsOnly = false) {
    const found: { name: string; pos: number }[] = [];
    const seen = new Set<string>();
    let scope = path.scope;
    while (scope) {
      for (const [name, binding] of Object.entries<any>(scope.bindings)) {
        if (seen.has(name) || name.startsWith("__")) continue;
        if (!["param", "let", "const", "var"].includes(binding.kind)) continue;
        if (paramsOnly && binding.kind !== "param") continue;
        seen.add(name);
        found.push({ name, pos: binding.identifier.start ?? 0 });
      }
      if (scope === fnPath.scope) break;
      scope = scope.parent;
    }
    found.sort((a, b) => a.pos - b.pos);
    const props = found.map(({ name }) =>
      t.objectProperty(t.identifier(name), t.arrowFunctionExpression([], t.identifier(name))),
    );
    if (includeThis) {
      props.unshift(
        t.objectProperty(t.identifier("this"), t.arrowFunctionExpression([], t.thisExpression())),
      );
    }
    return t.objectExpression(props);
  }

  function tracedFn(path: NodePath): { fn: NodePath; info: NonNullable<FnInfo> } | null {
    const fn = path.getFunctionParent();
    if (!fn) return null;
    const info = fnInfo(fn);
    return info ? { fn, info } : null;
  }

  function line(path: NodePath): number {
    return path.node.loc?.start.line ?? 0;
  }

  return {
    visitor: {
      Program: {
        enter(path: NodePath) {
          for (const stmt of path.node.body) {
            const decl = t.isExportNamedDeclaration(stmt) ? stmt.declaration : stmt;
            if (!decl) continue;
            if (t.isClassDeclaration(decl)) {
              const hasMethods = decl.body.body.some(
                (m: any) => t.isClassMethod(m) && m.kind !== "constructor",
              );
              if (!hasMethods) dataClasses.add(decl.id.name);
            }
            if (!t.isExportNamedDeclaration(stmt)) continue;
            if (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) {
              exported.add(decl.id.name);
            } else if (t.isVariableDeclaration(decl)) {
              for (const d of decl.declarations) if (t.isIdentifier(d.id)) exported.add(d.id.name);
            }
          }
        },
      },

      ImportDeclaration(path: NodePath) {
        if (path.node.importKind === "type") return path.remove();
        const source = t.stringLiteral(path.node.source.value);
        const mod = t.callExpression(t.identifier("__require"), [source]);
        const decls = path.node.specifiers.map((s: any) => {
          const imported = t.isImportDefaultSpecifier(s)
            ? "default"
            : t.isImportNamespaceSpecifier(s)
              ? null
              : (s.imported.name ?? s.imported.value);
          const init = imported ? t.memberExpression(mod, t.identifier(imported)) : mod;
          return t.variableDeclarator(t.identifier(s.local.name), init);
        });
        if (decls.length === 0) return path.remove();
        path.replaceWith(gen(t.variableDeclaration("const", decls)));
      },

      ExportNamedDeclaration(path: NodePath) {
        if (path.node.declaration) path.replaceWith(path.node.declaration);
        else path.remove();
      },

      ExportDefaultDeclaration(path: NodePath) {
        const decl = path.node.declaration;
        if (t.isExpression(decl)) path.remove();
        else path.replaceWith(decl);
      },

      Statement(path: NodePath) {
        const node = path.node;
        if (node[GENERATED] || done.has(node)) return;
        if (
          path.isBlockStatement() ||
          path.isFunctionDeclaration() ||
          path.isClassDeclaration() ||
          path.isEmptyStatement() ||
          path.isTSTypeAliasDeclaration?.() ||
          path.isTSInterfaceDeclaration?.() ||
          node.type.startsWith("TS") ||
          node.declare
        ) {
          return;
        }
        const traced = tracedFn(path);
        if (!traced) return;

        const parent = path.parentPath;
        const inList = path.inList && (parent.isBlockStatement() || parent.isSwitchCase());
        if (!inList) {
          const singleBody =
            (parent.isIfStatement() && (path.key === "consequent" || path.key === "alternate")) ||
            (LOOP_BODY_PARENTS.has(parent.node.type) && path.key === "body");
          // Wrap `if (x) return y;` into a block so a step can be inserted; revisited afterwards.
          if (singleBody) path.replaceWith(t.blockStatement([node]));
          return;
        }
        done.add(node);

        if (path.isReturnStatement()) {
          const arg = node.argument;
          node.argument = rtCall("ret", [
            t.numericLiteral(line(path)),
            arg ?? t.identifier("undefined"),
            getters(path, traced.fn, traced.info.isMethod),
          ]);
          // A plain `return x` is shown by the return step alone; keep a line step when the
          // expression makes calls, so the line lights up before the recursion runs.
          let hasCall = false;
          if (arg) {
            t.traverseFast(arg, (n: any) => {
              if (t.isCallExpression(n) || t.isNewExpression(n)) hasCall = true;
            });
          }
          if (!hasCall) return;
        }

        path.insertBefore(
          gen(
            t.expressionStatement(
              rtCall("step", [
                t.numericLiteral(line(path)),
                getters(path, traced.fn, traced.info.isMethod),
                t.stringLiteral("line"),
              ]),
            ),
          ),
        );
      },

      "ForStatement|WhileStatement"(path: NodePath) {
        const node = path.node;
        if (!node.test || node.test[GENERATED]) return;
        const traced = tracedFn(path);
        if (!traced) return;
        const scopePath = path.isForStatement() ? path.get("test") : path;
        node.test = gen(
          t.sequenceExpression([
            rtCall("step", [
              t.numericLiteral(line(path)),
              getters(scopePath, traced.fn, traced.info.isMethod),
              t.stringLiteral("loop"),
            ]),
            node.test,
          ]),
        );
      },

      Function: {
        exit(path: NodePath) {
          const info = fnInfo(path);
          const node = path.node;
          if (!info || done.has(node)) return;
          done.add(node);
          const fnLine = line(path);
          if (!t.isBlockStatement(node.body)) {
            node.body = t.blockStatement([
              gen(
                t.returnStatement(
                  rtCall("ret", [t.numericLiteral(fnLine), node.body, t.objectExpression([])]),
                ),
              ),
            ]);
          }
          const enter = gen(
            t.expressionStatement(
              rtCall("enter", [
                t.stringLiteral(info.name),
                t.stringLiteral(info.kind),
                t.numericLiteral(fnLine),
                getters(path.get("body"), path, info.isMethod, true),
                info.isMethod ? t.thisExpression() : t.nullLiteral(),
              ]),
            ),
          );
          const wrapped = gen(
            t.tryStatement(
              t.blockStatement(node.body.body),
              t.catchClause(
                t.identifier("__err"),
                t.blockStatement([
                  gen(t.expressionStatement(rtCall("thrown", [t.identifier("__err")]))),
                  gen(t.throwStatement(t.identifier("__err"))),
                ]),
              ),
              t.blockStatement([gen(t.expressionStatement(rtCall("exit", [])))]),
            ),
          );
          node.body = t.blockStatement([enter, wrapped]);
        },
      },
    },
  };
}

export function instrument(source: string): string {
  const result = Babel.transform(source, {
    filename: "solution.ts",
    sourceType: "module",
    presets: [["typescript", { allowDeclareFields: true }]],
    plugins: [vizPlugin],
    comments: false,
  });
  return `"use strict";\n${result.code ?? ""}`;
}
