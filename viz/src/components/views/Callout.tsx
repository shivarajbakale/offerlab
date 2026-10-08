// The plain-English note at the top of a picture: what just happened, and whether it is good news.

import { Alert } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import type { Caption } from "../../model/systems/types.ts";
import "./Callout.css";

const LABEL: Record<Caption["tone"], string> = { info: "What's happening", good: "Works", bad: "Problem" };
const COLOR: Record<Caption["tone"], string> = { info: "blue", good: "green", bad: "red" };
const ICON: Record<Caption["tone"], typeof IconInfoCircle> = { info: IconInfoCircle, good: IconCircleCheck, bad: IconAlertTriangle };

export function Callout({ caption }: { caption: Caption }) {
  const Icon = ICON[caption.tone];
  return (
    <Alert
      className={`callout ${caption.tone}`}
      role="status"
      variant="light"
      color={COLOR[caption.tone]}
      title={LABEL[caption.tone]}
      icon={<Icon size={18} />}
      radius="md"
      py="xs"
    >
      {caption.text}
    </Alert>
  );
}
