// One callout as a Mantine alert: red for severe, orange for a warning, grey for a hint.

import { Alert } from "@mantine/core";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { Callout } from "../../../system-design/traffic/index.ts";

const COLOR: Record<number, string> = { 3: "red", 2: "orange" };

export function NoteCard({ note, title, onClick }: { note: Callout; title?: ReactNode; onClick?: () => void }) {
  const Icon = note.severity >= 2 ? IconAlertTriangle : IconInfoCircle;
  return (
    <Alert
      className={`arch-note${onClick ? " clickable" : ""}`}
      color={COLOR[note.severity] ?? "gray"}
      variant="light"
      radius="md"
      p="xs"
      icon={<Icon size={16} />}
      title={title}
      onClick={onClick}
    >
      {note.text}
    </Alert>
  );
}
