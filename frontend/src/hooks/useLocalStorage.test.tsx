import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLocalStorage } from "./useLocalStorage";

describe("useLocalStorage", () => {
  it("starts from the stored value, or the initial one", () => {
    window.localStorage.setItem("stored", JSON.stringify(20));
    expect(renderHook(() => useLocalStorage("stored", 10)).result.current[0]).toBe(20);
    expect(renderHook(() => useLocalStorage("absent", 10)).result.current[0]).toBe(10);
  });

  it("keeps every user of a key in step within the tab", () => {
    const { result } = renderHook(() => ({
      shell: useLocalStorage("collapsed", false),
      settings: useLocalStorage("collapsed", false),
    }));
    act(() => result.current.shell[1]((value) => !value));
    expect(result.current.settings[0]).toBe(true);
    expect(window.localStorage.getItem("collapsed")).toBe("true");
  });

  it("composes two functional updates made back to back", () => {
    const { result } = renderHook(() => useLocalStorage("count", 0));
    act(() => {
      result.current[1]((n) => n + 1);
      result.current[1]((n) => n + 1);
    });
    expect(result.current[0]).toBe(2);
  });

  it("falls back to the initial value for a value it cannot parse", () => {
    window.localStorage.setItem("broken", "{not json");
    expect(renderHook(() => useLocalStorage("broken", "x")).result.current[0]).toBe("x");
  });
});
