// Phones (portrait, or landscape with a short screen) get a reading view: code, lessons and
// notes, with no visual or player. Keep this query in step with the phone block in App.css.

import { useSyncExternalStore } from "react";

export const PHONE_QUERY = "(max-width: 640px), (max-height: 500px) and (orientation: landscape)";

function subscribe(onChange: () => void) {
  const mq = matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
