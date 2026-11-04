import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ConfirmProvider, useConfirm } from "./ConfirmDialog";

function DeleteButton() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const confirmed = await confirm({
            title: "Delete this job?",
            body: "Its applications go too.",
            confirmLabel: "Delete",
            tone: "danger",
          });
          setAnswer(String(confirmed));
        }}
      >
        Delete job
      </button>
      <output data-testid="answer">{answer}</output>
    </>
  );
}

function setup() {
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <DeleteButton />
    </ConfirmProvider>,
  );
  const answer = () => screen.getByTestId("answer").textContent;
  return { user, answer };
}

describe("useConfirm", () => {
  it("resolves true when confirmed", async () => {
    const { user, answer } = setup();
    await user.click(screen.getByRole("button", { name: "Delete job" }));

    expect(screen.getByRole("dialog", { name: "Delete this job?" })).toHaveTextContent(
      "Its applications go too.",
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(answer()).toBe("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("resolves false when cancelled", async () => {
    const { user, answer } = setup();
    await user.click(screen.getByRole("button", { name: "Delete job" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(answer()).toBe("false");
  });

  it("resolves false on Escape", async () => {
    const { user, answer } = setup();
    await user.click(screen.getByRole("button", { name: "Delete job" }));
    await user.keyboard("{Escape}");
    expect(answer()).toBe("false");
  });

  it("focuses Cancel first for a dangerous action", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Delete job" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});
