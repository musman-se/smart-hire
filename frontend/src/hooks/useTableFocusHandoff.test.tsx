import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTableFocusHandoff } from "./useTableFocusHandoff";

/** A queue whose rows come from outside, as a refetch after a move delivers them. */
function Queue({ rows }: { rows: string[] }) {
  useTableFocusHandoff();
  return (
    <>
      <input aria-label="Search" />
      <table>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2}>
                <button type="button">Go to Screening</button>
              </td>
            </tr>
          ) : (
            rows.map((name) => (
              <tr key={name}>
                <td>{name}</td>
                <td>
                  <button type="button">Advance {name}</button>
                  <button type="button">More for {name}</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

const button = (name: string) => screen.getByRole("button", { name });

describe("useTableFocusHandoff", () => {
  it("moves focus to the same control in the row that takes the removed row's place", () => {
    const { rerender } = render(<Queue rows={["Ayesha", "Bilal", "Sana"]} />);
    button("Advance Bilal").focus();

    rerender(<Queue rows={["Ayesha", "Sana"]} />);
    expect(button("Advance Sana")).toHaveFocus();
  });

  it("keeps the control's place within its cell", () => {
    const { rerender } = render(<Queue rows={["Ayesha", "Bilal"]} />);
    button("More for Ayesha").focus();

    rerender(<Queue rows={["Bilal"]} />);
    expect(button("More for Bilal")).toHaveFocus();
  });

  it("falls back to the new last row, then to what the empty table offers", () => {
    const { rerender } = render(<Queue rows={["Ayesha", "Bilal"]} />);
    button("Advance Bilal").focus();

    rerender(<Queue rows={["Ayesha"]} />);
    expect(button("Advance Ayesha")).toHaveFocus();

    rerender(<Queue rows={[]} />);
    expect(button("Go to Screening")).toHaveFocus();
  });

  it("leaves focus alone once the user has moved it out of the table", () => {
    const { rerender } = render(<Queue rows={["Ayesha", "Bilal"]} />);
    button("Advance Ayesha").focus();
    const search = screen.getByRole("textbox", { name: "Search" });
    search.focus();

    rerender(<Queue rows={["Bilal"]} />);
    expect(search).toHaveFocus();
  });

  it("does nothing while the focused row stays", () => {
    const { rerender } = render(<Queue rows={["Ayesha", "Bilal"]} />);
    button("Advance Bilal").focus();

    rerender(<Queue rows={["Ayesha", "Bilal", "Sana"]} />);
    expect(button("Advance Bilal")).toHaveFocus();
  });
});
