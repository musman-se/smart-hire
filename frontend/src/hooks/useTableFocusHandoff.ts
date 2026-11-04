import { useEffect, useRef } from "react";

import { focusableWithin } from "../components/ui";

/** Where in a table the keyboard was: which row, which cell, which control in it. */
interface TablePosition {
  table: HTMLTableElement;
  row: HTMLTableRowElement;
  rowIndex: number;
  cellIndex: number;
  controlIndex: number;
}

/**
 * Keeps keyboard focus in a table whose rows can leave while one of them has it — a
 * queue row that a stage move takes out of the tab it was listed under. The focused
 * control goes with its row, and focus would fall back to the page; instead it moves to
 * the same control in the row that took its place (or the new last row, or whatever the
 * table shows once it is empty), so a keyboard user carries on down the list.
 *
 * Call it in the page that renders the table; it checks after every render, because
 * the row leaves in whichever render the refetched list lands in.
 */
export function useTableFocusHandoff(): void {
  const last = useRef<TablePosition | null>(null);

  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      // A menu or dialog opened from the row takes focus outside it, and hands it back
      // to the row when it closes, so the row is remembered again then.
      last.current = event.target instanceof HTMLElement ? positionOf(event.target) : null;
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    const position = last.current;
    if (!position || position.row.isConnected || !position.table.isConnected || !focusIsLost()) return;
    last.current = null;
    targetFor(position)?.focus();
  });
}

/** Focus fell back to the page because its element was removed. Focus the user moved
 * on purpose is left alone. */
export function focusIsLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

function positionOf(control: HTMLElement): TablePosition | null {
  const cell = control.closest("td, th");
  const row = cell?.parentElement;
  const table = row?.closest("table");
  if (!(cell instanceof HTMLTableCellElement) || !(row instanceof HTMLTableRowElement) || !table) return null;
  // Header and footer rows do not leave; only body rows are worth following.
  if (row.parentElement !== table.tBodies[0]) return null;
  return {
    table,
    row,
    rowIndex: row.sectionRowIndex,
    cellIndex: cell.cellIndex,
    controlIndex: Math.max(0, focusableWithin(cell).indexOf(control)),
  };
}

function targetFor({ table, rowIndex, cellIndex, controlIndex }: TablePosition): HTMLElement | undefined {
  const rows = table.tBodies[0]?.rows;
  const row = rows?.[Math.min(rowIndex, rows.length - 1)];
  if (!row) return undefined;
  const cell = row.cells[cellIndex];
  const inCell = cell ? focusableWithin(cell) : [];
  return inCell[controlIndex] ?? inCell[0] ?? focusableWithin(row)[0];
}
