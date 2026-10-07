# Practice Runner

A small Cursor / VS Code extension for this repo. Open any file under `practice/`
or `neetcode-150/` and click **▶ Run** above the solution or test, the ▶ button in the editor title bar, the status bar button (or
`Cmd+Alt+R` / `Ctrl+Alt+R`). It runs `node --test` on that file and shows:

- the full test output in the **Practice Runner** output panel,
- `✓ passed` next to the test, or a red `✗ expected …, got …` on the failing line
  (hover it for the full assertion diff),
- a pass/fail summary in the status bar.

Runs are killed after 10 seconds to catch infinite loops. Settings:
`practiceRunner.nodePath` (default `node`, needs Node 23.6+) and
`practiceRunner.timeoutSeconds`.

## Install

```sh
cd tools/practice-runner
npx @vscode/vsce package --skip-license --allow-missing-repository
cursor --install-extension practice-runner-0.2.0.vsix
```

Then reload the Cursor window.
