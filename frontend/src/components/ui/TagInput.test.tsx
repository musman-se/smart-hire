import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TagInput, type TagInputProps } from "./TagInput";

function Harness(props: Partial<TagInputProps> & { initial?: string[] }) {
  const { initial = [], ...rest } = props;
  const [tags, setTags] = useState<string[]>(initial);
  return (
    <>
      <TagInput aria-label="Skills" value={tags} onChange={setTags} {...rest} />
      <output data-testid="tags">{tags.join("|")}</output>
    </>
  );
}

const tags = () => screen.getByTestId("tags").textContent;
const input = () => screen.getByRole("combobox", { name: "Skills" });

describe("TagInput", () => {
  it("adds tags on Enter and on comma", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "python{Enter}sql,");
    expect(tags()).toBe("python|sql");
    expect(input()).toHaveValue("");
  });

  it("drops duplicates case-insensitively", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["Python"]} />);
    await user.type(input(), "python{Enter}PYTHON,");
    expect(tags()).toBe("Python");
  });

  it("removes the last tag with Backspace in an empty box, or any tag by its button", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["go", "rust", "sql"]} />);

    await user.click(input());
    await user.keyboard("{Backspace}");
    expect(tags()).toBe("go|rust");

    await user.click(screen.getByRole("button", { name: "Remove go" }));
    expect(tags()).toBe("rust");
  });

  it("splits a pasted list", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["sql"]} />);
    await user.click(input());
    await user.paste("python, SQL, kafka");
    expect(tags()).toBe("sql|python|kafka");
  });

  it("stops at maxTags", async () => {
    const user = userEvent.setup();
    render(<Harness maxTags={2} />);
    await user.type(input(), "a{Enter}b{Enter}c{Enter}");
    expect(tags()).toBe("a|b");
  });

  it("offers suggestions that arrow keys and Enter pick from", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["postgresql", "python", "pytorch"]} initial={["python"]} />);
    await user.type(input(), "p");

    const options = screen.getAllByRole("option");
    // Already chosen skills are not offered again.
    expect(options.map((option) => option.textContent)).toEqual(["postgresql", "pytorch"]);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", options[1]?.id);

    await user.keyboard("{Enter}");
    expect(tags()).toBe("python|pytorch");
  });

  it("looks suggestions up with an async suggest function", async () => {
    const user = userEvent.setup();
    const suggest = async (query: string) => ["kafka", "kotlin"].filter((s) => s.startsWith(query));
    render(<Harness suggest={suggest} />);
    await user.type(input(), "ka");

    const option = await screen.findByRole("option", { name: "kafka" });
    await user.click(option);
    expect(tags()).toBe("kafka");
  });

  it("closes the suggestion list on Escape without clearing the text", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["python"]} />);
    await user.type(input(), "py");
    expect(input()).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveValue("py");
  });
});
