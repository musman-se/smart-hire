import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applicationsApi } from "../../api/resources";
import type { Application } from "../../api/types";
import { makeApplication, makeCandidate, makeJob } from "../candidate/fixtures";
import { ConfirmProvider, ToastProvider } from "../ui";
import { ApplyPanel } from "./ApplyPanel";

vi.mock("../../api/resources", () => ({
  applicationsApi: { list: vi.fn(), apply: vi.fn(), history: vi.fn() },
}));

function renderPanel(mine: Application[]) {
  vi.mocked(applicationsApi.list).mockResolvedValue({ items: mine, total: mine.length, limit: 100, offset: 0 });
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <ConfirmProvider>
            <ApplyPanel job={makeJob()} candidate={makeCandidate()} profileError={null} onRetryProfile={() => {}} />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ApplyPanel tracking link", () => {
  beforeEach(() => {
    vi.mocked(applicationsApi.history).mockResolvedValue([]);
  });

  it("opens My applications with the existing application's details showing", async () => {
    renderPanel([makeApplication({ id: "app-7" })]);
    const link = await screen.findByRole("link", { name: /Track it in My applications/ });
    expect(link).toHaveAttribute("href", "/applications?app=app-7");
  });

  it("links to the application just submitted", async () => {
    vi.mocked(applicationsApi.apply).mockResolvedValue(makeApplication({ id: "app-new" }));
    renderPanel([]);
    await userEvent.click(await screen.findByRole("button", { name: /Submit application/ }));
    expect(await screen.findByText("Application sent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Track it in My applications/ })).toHaveAttribute(
      "href",
      "/applications?app=app-new",
    );
  });
});
