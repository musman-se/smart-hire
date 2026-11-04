import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { urlParam, useUrlState } from "./useUrlState";

const SCHEMA = {
  search: urlParam.string(),
  status: urlParam.oneOf(["draft", "published"] as const),
  offset: urlParam.number(0, { min: 0 }),
  skills: urlParam.list(),
};

/** The page opens at `initialUrl`, reached from /applications so Back has somewhere to go. */
function setup(initialUrl = "/jobs") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/applications", initialUrl]} initialIndex={1}>
      {children}
    </MemoryRouter>
  );
  return renderHook(
    () => {
      const [state, setState] = useUrlState(SCHEMA, { resetOnChange: "offset" });
      const location = useLocation();
      const navigate = useNavigate();
      return {
        state,
        setState,
        search: location.search,
        url: location.pathname + location.search,
        back: () => navigate(-1),
      };
    },
    { wrapper },
  );
}

describe("useUrlState", () => {
  it("reads defaults when the URL has no params", () => {
    const { result } = setup();
    expect(result.current.state).toEqual({ search: "", status: "", offset: 0, skills: [] });
  });

  it("parses typed values and rejects bad ones", () => {
    const { result } = setup("/jobs?search=eng&status=bogus&offset=-5&skills=python,sql");
    expect(result.current.state).toEqual({
      search: "eng",
      status: "", // not one of the allowed values
      offset: 0, // below min
      skills: ["python", "sql"],
    });
  });

  it("writes changes to the URL and leaves defaults out", () => {
    const { result } = setup();
    act(() => result.current.setState({ search: "python", status: "draft" }));
    expect(result.current.search).toBe("?search=python&status=draft");

    act(() => result.current.setState({ search: "" }));
    expect(result.current.search).toBe("?status=draft");
  });

  it("resets the offset when another key changes", () => {
    const { result } = setup("/jobs?offset=40");
    act(() => result.current.setState({ search: "go" }));
    expect(result.current.state.offset).toBe(0);
    expect(result.current.search).toBe("?search=go");
  });

  it("keeps the offset when only the offset changes", () => {
    const { result } = setup("/jobs?search=go");
    act(() => result.current.setState({ offset: 20 }));
    expect(result.current.state).toMatchObject({ search: "go", offset: 20 });
  });

  it("preserves params outside the schema", () => {
    const { result } = setup("/jobs?tab=details");
    act(() => result.current.setState({ search: "x" }));
    expect(result.current.search).toBe("?tab=details&search=x");
  });

  it("accepts an updater function", () => {
    const { result } = setup("/jobs?offset=20");
    act(() => result.current.setState((current) => ({ offset: current.offset + 20 })));
    expect(result.current.state.offset).toBe(40);
  });

  it("keeps both of two updates made in the same tick", () => {
    // Pagination's page-size picker sets the limit and then the page, back to back.
    const { result } = setup("/jobs?offset=40");
    act(() => {
      result.current.setState({ search: "go" });
      result.current.setState({ status: "draft" });
    });
    expect(result.current.search).toBe("?search=go&status=draft");
  });

  it("builds each later update on the URL that rendered", () => {
    const { result } = setup("/jobs");
    act(() => result.current.setState({ search: "go" }));
    act(() => result.current.setState({ search: "" }));
    act(() => result.current.setState({ status: "draft" }));
    expect(result.current.search).toBe("?status=draft");
  });

  describe("history", () => {
    it("pushes a tab change, so Back returns to the previous tab", () => {
      const { result } = setup();
      act(() => result.current.setState({ status: "draft" }));
      act(() => result.current.setState({ status: "published" }));
      act(() => result.current.back());
      expect(result.current.url).toBe("/jobs?status=draft");
      act(() => result.current.back());
      expect(result.current.url).toBe("/jobs");
    });

    it("pushes a page change", () => {
      const { result } = setup("/jobs?offset=20");
      act(() => result.current.setState({ offset: 40 }));
      act(() => result.current.back());
      expect(result.current.url).toBe("/jobs?offset=20");
    });

    it("replaces the entry while typing, so Back is not spent on keystrokes", () => {
      const { result } = setup();
      act(() => result.current.setState({ search: "p" }));
      act(() => result.current.setState({ search: "py" }));
      expect(result.current.url).toBe("/jobs?search=py");
      act(() => result.current.back());
      expect(result.current.url).toBe("/applications");
    });

    it("pushes when any changed param asks to", () => {
      const { result } = setup();
      act(() => result.current.setState({ search: "go", status: "draft" }));
      act(() => result.current.back());
      expect(result.current.url).toBe("/jobs");
    });

    it("makes one entry of updates in the same tick", () => {
      const { result } = setup();
      act(() => {
        result.current.setState({ status: "draft" });
        result.current.setState({ offset: 20 });
      });
      expect(result.current.url).toBe("/jobs?status=draft&offset=20");
      act(() => result.current.back());
      expect(result.current.url).toBe("/jobs");
    });

    it("lets the caller replace a change the user did not make", () => {
      // useClampOffset snapping a stale page back onto the last one.
      const { result } = setup("/jobs?offset=80");
      act(() => result.current.setState({ offset: 40 }, { history: "replace" }));
      expect(result.current.url).toBe("/jobs?offset=40");
      act(() => result.current.back());
      expect(result.current.url).toBe("/applications");
    });

    it("adds no entry when nothing changes", () => {
      const { result } = setup("/jobs?status=draft");
      act(() => result.current.setState({ status: "draft" }));
      act(() => result.current.back());
      expect(result.current.url).toBe("/applications");
    });
  });
});
