import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobFilters } from "../api/resources";
import type { JobStatus } from "../api/types";
import { useJobStatusCounts } from "./queries";
import { useLiveJobs } from "./useJobsExtras";

const api = vi.hoisted(() => ({ jobsList: vi.fn() }));

vi.mock("../api/resources", () => ({
  jobsApi: { list: api.jobsList },
}));

/** The server's totals per status; lists are empty, only totals matter here. */
let totals: Partial<Record<JobStatus, number>>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useLiveJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    totals = { draft: 3, processing: 1, published: 16 };
    api.jobsList.mockImplementation((filters: JobFilters) =>
      Promise.resolve({
        items: [],
        total: filters.status ? (totals[filters.status] ?? 0) : 0,
        limit: filters.limit ?? 10,
        offset: 0,
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("refreshes the tab counts when a publish settles off the current page", async () => {
    // The Draft tab: the job being published has already left this list.
    const { result } = renderHook(
      () => ({ list: useLiveJobs({ status: "draft" }), counts: useJobStatusCounts() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.counts.counts.processing).toBe(1));
    expect(result.current.counts.counts.published).toBe(16);

    // The workflow finishes: the job is live.
    totals = { draft: 3, processing: 0, published: 17 };
    await act(() => vi.advanceTimersByTimeAsync(2000));

    await waitFor(() => expect(result.current.counts.counts.published).toBe(17));
    expect(result.current.counts.counts.processing).toBe(0);
  });

  it("stops polling once nothing is being published", async () => {
    totals = { draft: 3, processing: 0, published: 16 };
    renderHook(() => useLiveJobs({ status: "draft" }), { wrapper });
    await waitFor(() => expect(api.jobsList).toHaveBeenCalledTimes(2));

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(api.jobsList).toHaveBeenCalledTimes(2);
  });
});
