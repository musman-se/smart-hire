import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CandidateFilters } from "../api/resources";
import type { Candidate } from "../api/types";
import { keys, useCandidatesByIds, useJobPublication, useJobStatusCounts, useStageCounts } from "./queries";

const api = vi.hoisted(() => ({
  candidatesList: vi.fn(),
  candidatesGet: vi.fn(),
  statusCounts: vi.fn(),
  stageCounts: vi.fn(),
  publication: vi.fn(),
}));

vi.mock("../api/resources", () => ({
  MAX_IDS_PER_REQUEST: 100,
  candidatesApi: { list: api.candidatesList, get: api.candidatesGet },
  jobsApi: { statusCounts: api.statusCounts, publication: api.publication },
  applicationsApi: { stageCounts: api.stageCounts },
}));

const candidate = (id: string) => ({ id, full_name: `Candidate ${id}` }) as Candidate;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.candidatesList.mockImplementation((filters: CandidateFilters) =>
    Promise.resolve({ items: (filters.ids ?? []).map(candidate), total: 0, limit: 100, offset: 0 }),
  );
});

describe("useCandidatesByIds", () => {
  it("reads every applicant in one request, and seeds each one's own cache entry", async () => {
    const { result } = renderHook(() => useCandidatesByIds(["c2", "c1", "c2", ""]), { wrapper });

    await waitFor(() => expect(result.current.byId.size).toBe(2));
    expect(api.candidatesList).toHaveBeenCalledTimes(1);
    expect(api.candidatesList).toHaveBeenCalledWith({ ids: ["c1", "c2"], limit: 2 });
    expect(api.candidatesGet).not.toHaveBeenCalled();
    // The drawer and the candidate page read these without asking again.
    expect(client.getQueryData(keys.candidate("c1"))).toEqual(candidate("c1"));
  });

  it("asks in batches of at most a hundred", async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `c${String(index).padStart(3, "0")}`);
    const { result } = renderHook(() => useCandidatesByIds(ids), { wrapper });

    await waitFor(() => expect(result.current.byId.size).toBe(150));
    expect(api.candidatesList).toHaveBeenCalledTimes(2);
    const sizes = api.candidatesList.mock.calls.map(([filters]) => (filters as CandidateFilters).ids?.length);
    expect(sizes.sort()).toEqual([100, 50]);
  });
});

describe("count hooks", () => {
  it("reads every job status's total in one request", async () => {
    api.statusCounts.mockResolvedValue({ draft: 2, processing: 0, published: 5, publish_failed: 1, closed: 0 });
    const { result } = renderHook(() => useJobStatusCounts(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.statusCounts).toHaveBeenCalledTimes(1);
    expect(result.current.counts).toEqual({ draft: 2, processing: 0, published: 5, publish_failed: 1, closed: 0 });
    expect(result.current.total).toBe(8);
  });

  it("reads every stage's total in one request, for one job or all", async () => {
    api.stageCounts.mockResolvedValue({
      applied: 3,
      screening: 1,
      interview: 0,
      offer: 0,
      hired: 1,
      rejected: 2,
      withdrawn: 0,
    });
    const { result } = renderHook(() => useStageCounts({ jobId: "j1" }), { wrapper });

    await waitFor(() => expect(result.current.counts.applied).toBe(3));
    expect(api.stageCounts).toHaveBeenCalledTimes(1);
    expect(api.stageCounts).toHaveBeenCalledWith("j1");
    expect(result.current.total).toBe(7);
  });

  it("stays under the applications prefix, so any application change refreshes it", async () => {
    api.stageCounts.mockResolvedValue({ applied: 1 });
    renderHook(() => useStageCounts(), { wrapper });
    await waitFor(() => expect(api.stageCounts).toHaveBeenCalledTimes(1));

    await client.invalidateQueries({ queryKey: keys.applications });
    expect(api.stageCounts).toHaveBeenCalledTimes(2);
  });
});

describe("useJobPublication", () => {
  const liveJob = { id: "j1", status: "published", content_processed_at: "2026-11-10T09:00:00Z", publish_error: null } as const;
  const publication = (workflowStatus: string, processedAt: string) => ({
    job_id: "j1",
    job_status: "published",
    publish_error: null,
    content_processed_at: processedAt,
    workflow: { status: workflowStatus },
  });

  it("polls a re-analysis of a live job, then re-reads the job when it lands", async () => {
    api.publication
      .mockResolvedValueOnce(publication("running", liveJob.content_processed_at))
      .mockResolvedValue(publication("completed", "2026-11-10T09:05:00Z"));
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useJobPublication(liveJob), { wrapper });

    // "published" throughout — the run's own status keeps it polling.
    await waitFor(() => expect(result.current.data?.workflow?.status).toBe("completed"), { timeout: 3000 });
    expect(api.publication).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.job("j1"), exact: true }));
  });
});
