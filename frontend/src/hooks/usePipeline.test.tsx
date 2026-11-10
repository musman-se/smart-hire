import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Application, Page } from "../api/types";
import { ToastProvider } from "../components/ui";
import { useStageChange } from "../components/pipeline/useStageChange";
import { keys } from "./queries";
import { useMoveApplication } from "./usePipeline";

const advance = vi.hoisted(() => vi.fn());
vi.mock("../api/resources", () => ({ applicationsApi: { advance } }));

const app = (id: string): Application =>
  ({
    id,
    job_id: "j1",
    candidate_id: `c-${id}`,
    stage: "applied",
    cover_letter: null,
    match_score: 70,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
  }) as Application;

describe("useMoveApplication", () => {
  it("undoes only the refused move when two overlap, and marks both while in flight", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    client.setQueryData<Page<Application>>(keys.jobApplications("j1"), {
      items: [app("a1"), app("a2")],
      total: 2,
      limit: 100,
      offset: 0,
    });
    const answers: Record<string, { resolve: (a: Application) => void; reject: (e: Error) => void }> = {};
    advance.mockImplementation(
      (id: string) =>
        new Promise<Application>((resolve, reject) => {
          answers[id] = { resolve, reject };
        }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ move: useMoveApplication("j1"), change: useStageChange("j1", () => "Someone") }),
      { wrapper },
    );
    const stages = () =>
      client.getQueryData<Page<Application>>(keys.jobApplications("j1"))?.items.map((a) => a.stage);

    act(() => result.current.move.mutate({ id: "a1", stage: "screening" }));
    await waitFor(() => expect(answers.a1).toBeDefined());
    act(() => result.current.move.mutate({ id: "a2", stage: "screening" }));
    await waitFor(() => expect(answers.a2).toBeDefined());

    expect(stages()).toEqual(["screening", "screening"]);
    await waitFor(() => expect([...result.current.change.pendingIds].sort()).toEqual(["a1", "a2"]));

    // The first is refused: its card goes back; the second, still in flight, stays.
    await act(async () => answers.a1?.reject(new Error("Moved by someone else")));
    await waitFor(() => expect(stages()).toEqual(["applied", "screening"]));
    await waitFor(() => expect([...result.current.change.pendingIds]).toEqual(["a2"]));

    await act(async () => answers.a2?.resolve({ ...app("a2"), stage: "screening" }));
    await waitFor(() => expect(result.current.change.pendingIds.size).toBe(0));
    expect(stages()).toEqual(["applied", "screening"]);
  });
});
