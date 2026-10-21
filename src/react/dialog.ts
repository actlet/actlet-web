import { useEffect, type RefObject } from "react";
import { actionFor, DIALOG_KEYS } from "./keys";

/**
 * Makes an element a modal dialog for the keyboard: focus moves into it
 * and stays there, Escape closes it, and focus goes back to where it was.
 */
export function useDialog(
  dialog: RefObject<HTMLElement | null>,
  first: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (actionFor(DIALOG_KEYS, e) === "close") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") trapFocus(e, dialog.current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
  }, [dialog, first, onClose]);
}

/** Keeps Tab and Shift+Tab within the element. */
function trapFocus(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const focusable = [
    ...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ].filter((el) => !el.hasAttribute("disabled"));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!root.contains(active)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
