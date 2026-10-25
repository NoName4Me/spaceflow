import { useEffect, type RefObject } from "react";
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    const previous = document.activeElement;
    ref.current
      ?.querySelector<HTMLElement>(
        "input:not(:disabled),select:not(:disabled),button",
      )
      ?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
        ) || []),
      ].filter((n) => n.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [ref, close]);
}
