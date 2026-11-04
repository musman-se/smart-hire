import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Application, Job } from "../../api/types";
import { ApplicationCard } from "./ApplicationCard";
import { makeApplication, makeJob } from "./fixtures";
import { UNLISTED_JOB } from "./JobTitle";

function setup(application: Application, job: Job | undefined) {
  const onOpen = vi.fn();
  const onWithdraw = vi.fn();
  render(
    <MemoryRouter>
      <ul>
        <ApplicationCard
          application={application}
          job={job}
          jobLoading={false}
          onOpen={onOpen}
          onWithdraw={onWithdraw}
        />
      </ul>
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), onOpen, onWithdraw };
}

describe("ApplicationCard", () => {
  it("names the job and says what happens next", async () => {
    const { user, onOpen } = setup(makeApplication({ stage: "interview" }), makeJob({ title: "Data Engineer" }));
    expect(screen.getByText(/Expect a message about scheduling/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Data Engineer" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("explains a job the candidate can no longer read instead of showing its id", () => {
    setup(makeApplication({ job_id: "4f1c-…" }), undefined);
    expect(screen.getByText(UNLISTED_JOB)).toBeInTheDocument();
    expect(screen.queryByText(/4f1c/)).not.toBeInTheDocument();
  });

  it("offers withdrawal only while the application is active", async () => {
    const active = setup(makeApplication({ stage: "screening" }), makeJob());
    await active.user.click(screen.getByRole("button", { name: /^Actions for / }));
    await active.user.click(screen.getByRole("menuitem", { name: /Withdraw application/ }));
    expect(active.onWithdraw).toHaveBeenCalled();
  });

  it("has no withdraw action once the application is closed", async () => {
    const { user } = setup(makeApplication({ stage: "rejected" }), makeJob({ status: "closed" }));
    expect(screen.getByText("Role closed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Actions for / }));
    expect(screen.queryByRole("menuitem", { name: /Withdraw/ })).not.toBeInTheDocument();
  });
});
