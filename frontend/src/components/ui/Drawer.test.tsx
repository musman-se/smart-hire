import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Drawer } from "./Drawer";

function renderDrawer(contentKey: string) {
  return (
    <Drawer open onClose={() => {}} title="Applicant" contentKey={contentKey}>
      <p>Details</p>
    </Drawer>
  );
}

describe("Drawer", () => {
  it("starts the body from the top when it moves on to other content", () => {
    const { rerender } = render(renderDrawer("a1"));
    const body = screen.getByText("Details").parentElement as HTMLElement;

    body.scrollTop = 400;
    rerender(renderDrawer("a1"));
    expect(body.scrollTop).toBe(400);

    rerender(renderDrawer("a2"));
    expect(body.scrollTop).toBe(0);
  });

  it("moves focus in without scrolling the page behind it", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(renderDrawer("a1"));
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });
});
