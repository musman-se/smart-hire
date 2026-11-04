import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EMPTY_JOB_FORM, type JobFormValues } from "./jobForm";
import { JobPreviewCard } from "./JobPreviewCard";

const complete: JobFormValues = {
  ...EMPTY_JOB_FORM,
  title: "Backend Engineer",
  description: "Build and run the hiring platform's APIs.",
  department: "Engineering",
  location: "Remote",
  required_skills: ["python"],
  min_experience_years: "3",
};

describe("JobPreviewCard", () => {
  it("says ready to publish when every item is done", () => {
    render(<JobPreviewCard values={complete} />);
    expect(screen.getByText("Ready to publish")).toBeInTheDocument();
    expect(screen.getByText("3+ years")).toBeInTheDocument();
  });

  it("is not ready while a number is out of range, and does not draw it as valid", () => {
    render(
      <JobPreviewCard values={{ ...complete, min_experience_years: "-3", max_applications: "0" }} />,
    );
    expect(screen.queryByText("Ready to publish")).not.toBeInTheDocument();
    expect(screen.getByText("1 thing to add")).toBeInTheDocument();
    expect(screen.queryByText("No minimum experience")).not.toBeInTheDocument();
    expect(screen.queryByText(/Closes to new applications/)).not.toBeInTheDocument();
  });
});
