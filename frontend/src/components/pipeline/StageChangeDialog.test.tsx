import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StageChangeDialog, type StageChangeRequest } from "./StageChangeDialog";

const reject: StageChangeRequest = {
  applicationId: "a1",
  candidateName: "Ayesha Khan",
  from: "interview",
  to: "rejected",
};

describe("StageChangeDialog", () => {
  it("asks for a rejection reason without insisting on one", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<StageChangeDialog request={reject} onCancel={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog", { name: "Reject Ayesha Khan?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject without a reason" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Role filled" }));
    expect(screen.getByRole("textbox", { name: /Reason/ })).toHaveValue("Role filled");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalledWith("Role filled", "rejected");
  });

  it("adds a reason chip to what is written and hands the caret back to the note", async () => {
    const user = userEvent.setup();
    render(<StageChangeDialog request={reject} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const reason = screen.getByRole("textbox", { name: /Reason/ });
    const chip = screen.getByRole("button", { name: "Missing key skills" });

    await user.type(reason, "Strong on frontend");
    await user.click(chip);
    expect(reason).toHaveValue("Strong on frontend. Missing key skills");
    expect(reason).toHaveFocus();
    expect(chip).toHaveAttribute("aria-pressed", "true");

    // Typing goes on where the chip left off, not into the chip.
    await user.type(reason, " (Kubernetes)");
    expect(reason).toHaveValue("Strong on frontend. Missing key skills (Kubernetes)");

    // A second click takes the reason back out and keeps the rest.
    await user.click(chip);
    expect(reason).toHaveValue("Strong on frontend. (Kubernetes)");
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("sends a forward move with mod+Enter from the note", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <StageChangeDialog request={{ ...reject, from: "applied", to: "screening" }} onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    const note = screen.getByRole("textbox", { name: /Note/ });
    expect(note).toHaveFocus();
    await user.type(note, "  Strong portfolio  ");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onConfirm).toHaveBeenCalledWith("Strong portfolio", "screening");
  });

  it("lets the recruiter pick another allowed stage when given targets", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <StageChangeDialog
        request={{ ...reject, to: "interview", from: "screening" }}
        targets={["interview", "rejected"]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("radio", { name: "Interview" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Rejected" }));
    // Choosing rejection brings its reasons and its warning with it.
    expect(screen.getByRole("dialog", { name: "Reject Ayesha Khan?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Missing key skills" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalledWith("Missing key skills", "rejected");
  });

  it("keeps a written reason from a stray backdrop click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { baseElement } = render(<StageChangeDialog request={reject} onCancel={onCancel} onConfirm={vi.fn()} />);
    const backdrop = baseElement.querySelector(".modal-backdrop");
    if (!backdrop) throw new Error("No backdrop");

    await user.type(screen.getByRole("textbox", { name: /Reason/ }), "Needs on-call experience");
    await user.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and holds the buttons while a move is in flight", () => {
    const { rerender } = render(
      <StageChangeDialog request={reject} pending onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    rerender(
      <StageChangeDialog request={reject} error={new Error("Network down")} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
