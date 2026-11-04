import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SkillFilter } from "./SkillFilter";

vi.mock("../../hooks/queries", () => ({
  useSkillSuggestions: (search: string) => ({
    data: search ? ["python", "pytorch"].filter((name) => name.startsWith(search)) : [],
  }),
}));

function setup(value = "") {
  const onChange = vi.fn();
  const view = render(<SkillFilter value={value} onChange={onChange} />);
  return { onChange, input: screen.getByRole("combobox", { name: "Filter by skill" }), ...view };
}

describe("SkillFilter", () => {
  it("applies the typed skill on Enter, lower-cased", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "  Go {Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("go");
  });

  it("does not filter while the recruiter is still typing", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "pyt");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picks a suggestion with the arrow keys", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "py");
    expect(await screen.findByRole("option", { name: "pytorch" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("pytorch");
  });

  it("clears the filter with Escape", async () => {
    const { input, onChange } = setup("sql");
    await userEvent.click(input);
    await userEvent.keyboard("{Escape}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("");
  });

  it("follows a value changed elsewhere, such as Clear filters", () => {
    const { input, rerender, onChange } = setup("sql");
    expect(input).toHaveValue("sql");
    rerender(<SkillFilter value="" onChange={onChange} />);
    expect(input).toHaveValue("");
  });
});
