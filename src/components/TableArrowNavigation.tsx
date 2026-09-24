"use client";

import type { KeyboardEvent, ReactNode } from "react";

const editableSelector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea';

export default function TableArrowNavigation({ children }: { children: ReactNode }) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown")
    ) return;

    const current = event.target;
    if (!(current instanceof HTMLElement) || !current.matches(editableSelector)) return;

    const cell = current.closest("td");
    const row = cell?.parentElement;
    const body = row?.parentElement;
    if (!(cell instanceof HTMLTableCellElement) || !(row instanceof HTMLTableRowElement) || !(body instanceof HTMLTableSectionElement) || body.tagName !== "TBODY") return;

    const inputs = Array.from(cell.querySelectorAll<HTMLElement>(editableSelector));
    const position = inputs.indexOf(current);
    if (position < 0) return;

    let nextRow = event.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
    while (nextRow instanceof HTMLTableRowElement) {
      const nextCell = nextRow.cells[cell.cellIndex];
      const next = nextCell?.querySelectorAll<HTMLElement>(editableSelector)[position];
      if (next && !next.matches(":disabled") && next.getClientRects().length) {
        event.preventDefault();
        next.focus();
        if (next instanceof HTMLInputElement && next.type !== "number") next.select();
        return;
      }
      nextRow = event.key === "ArrowDown" ? nextRow.nextElementSibling : nextRow.previousElementSibling;
    }
  }

  return <div onKeyDown={handleKeyDown}>{children}</div>;
}
