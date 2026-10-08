// The Mantine theme: indigo accent, Inter and JetBrains Mono, rounded controls. The app's own
// colour tokens (index.css) stay the source for the custom drawings; Mantine's surfaces are pointed
// at the same tokens so standard components and drawings sit on one palette.

import { createTheme, type CSSVariablesResolver } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 6, dark: 4 },
  fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  headings: { fontWeight: "650" },
  defaultRadius: "md",
  cursorType: "pointer",
  fontSizes: { xs: "12px", sm: "13px", md: "14px", lg: "16px", xl: "18px" },
  components: {
    Tooltip: { defaultProps: { openDelay: 300, withArrow: true, multiline: true, maw: 320 } },
    Badge: { defaultProps: { variant: "light", radius: "sm" } },
    Paper: { defaultProps: { withBorder: true } },
    Card: { defaultProps: { withBorder: true } },
  },
});

export const resolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { "--mantine-color-body": "var(--bg)", "--mantine-color-default-border": "var(--line)", "--mantine-color-dimmed": "var(--muted)" },
  dark: { "--mantine-color-body": "var(--bg)", "--mantine-color-default-border": "var(--line)", "--mantine-color-dimmed": "var(--muted)" },
});
