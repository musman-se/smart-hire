import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { jobsApi } from "../../api/resources";
import type { Job } from "../../api/types";
import { ConfirmProvider, ToastProvider } from "../../components/ui";
import { JobEditorPage } from "./JobEditorPage";

vi.mock("../../api/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/resources")>();
  return {
    ...actual,
    jobsApi: { ...actual.jobsApi, create: vi.fn(), publish: vi.fn(), get: vi.fn() },
    skillsApi: { list: vi.fn(async () => ({ items: [], total: 0, limit: 8, offset: 0 })) },
  };
});

const created: Job = {
  id: "job-9",
  title: "Backend Engineer",
  description: "Build and run the hiring platform's APIs.",
  department: null,
  location: null,
  employment_type: "full_time",
  required_skills: [],
  min_experience_years: 0,
  max_applications: null,
  status: "draft",
  published_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

function JobPage() {
  return <p>Job page {useParams().jobId}</p>;
}

function renderEditor() {
  const router = createMemoryRouter(
    [
      { path: "/jobs", element: <p>Jobs list</p> },
      { path: "/jobs/new", element: <JobEditorPage /> },
      { path: "/jobs/:jobId", element: <JobPage /> },
    ],
    { initialEntries: ["/jobs", "/jobs/new"], initialIndex: 1 },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const titleBox = () => screen.getByRole("textbox", { name: /job title/i });
const descriptionBox = () => screen.getByRole("textbox", { name: /job description/i });

describe("JobEditorPage — new job", () => {
  beforeEach(() => {
    vi.mocked(jobsApi.create).mockReset().mockResolvedValue(created);
    vi.mocked(jobsApi.publish).mockReset().mockResolvedValue({ ...created, status: "processing" });
  });

  it("refuses an incomplete form, explains why, and focuses the first problem", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Description is required.")).toBeInTheDocument();
    expect(titleBox()).toHaveFocus();
    expect(jobsApi.create).not.toHaveBeenCalled();
  });

  it("creates the job, publishes it, and opens it", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(titleBox(), "Backend Engineer");
    // Pasted: typing it key by key is slow enough to time out under the full suite.
    await user.click(descriptionBox());
    await user.paste("Build and run the hiring platform's APIs.");
    await user.click(screen.getByRole("button", { name: "Save & publish" }));

    expect(await screen.findByText("Job page job-9")).toBeInTheDocument();
    expect(jobsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Backend Engineer", department: null, min_experience_years: 0 }),
      expect.any(String),
    );
    expect(jobsApi.publish).toHaveBeenCalledWith("job-9");
  });

  it("still opens the saved draft when only the publish step fails", async () => {
    vi.mocked(jobsApi.publish).mockRejectedValue(new Error("workflow engine down"));
    const user = userEvent.setup();
    renderEditor();

    await user.type(titleBox(), "Backend Engineer");
    // Pasted: typing it key by key is slow enough to time out under the full suite.
    await user.click(descriptionBox());
    await user.paste("Build and run the hiring platform's APIs.");
    await user.click(screen.getByRole("button", { name: "Save & publish" }));

    expect(await screen.findByText("Job page job-9")).toBeInTheDocument();
    expect(screen.getByText(/saved as a draft/i)).toBeInTheDocument();
  });

  it("asks before leaving with unsaved changes", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(titleBox(), "Half-written role");
    await user.click(screen.getByRole("link", { name: "Cancel" }));
    expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument());
    expect(titleBox()).toHaveValue("Half-written role");

    await user.click(screen.getByRole("link", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("Jobs list")).toBeInTheDocument();
  });

  it("leaves without asking when nothing was typed", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("link", { name: "Cancel" }));
    expect(await screen.findByText("Jobs list")).toBeInTheDocument();
  });
});
