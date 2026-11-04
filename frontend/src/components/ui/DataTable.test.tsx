import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable, compareValues, nextSort, type Column } from "./DataTable";
import { DropdownMenu } from "./DropdownMenu";

interface Row {
  id: string;
  name: string;
  score: number | null;
}

const ROWS: Row[] = [
  { id: "1", name: "Job 10", score: 40 },
  { id: "2", name: "Job 2", score: null },
  { id: "3", name: "job 1", score: 90 },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Name", cell: (row) => row.name, sortValue: (row) => row.name },
  { key: "score", header: "Score", cell: (row) => row.score ?? "—", sortValue: (row) => row.score },
  {
    key: "actions",
    header: "Actions",
    cell: (row) => <button type="button">Open {row.name}</button>,
  },
];

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1) // the header row
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

describe("DataTable", () => {
  it("keeps the server's order until a column is sorted", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} />);
    expect(names()).toEqual(["Job 10", "Job 2", "job 1"]);
  });

  it("cycles a column through ascending, descending and unsorted", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} />);
    const header = screen.getByRole("columnheader", { name: /Name/ });
    const button = within(header).getByRole("button");

    await user.click(button);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    // Natural order, case-insensitive: 1 < 2 < 10.
    expect(names()).toEqual(["job 1", "Job 2", "Job 10"]);

    await user.click(button);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(names()).toEqual(["Job 10", "Job 2", "job 1"]);

    await user.click(button);
    expect(header).not.toHaveAttribute("aria-sort");
    expect(names()).toEqual(["Job 10", "Job 2", "job 1"]);
  });

  it("reverses a column that opens sorted in its first direction on the first click", async () => {
    const user = userEvent.setup();
    const columns: Column<Row>[] = [COLUMNS[0]!, { ...COLUMNS[1]!, firstSortDirection: "desc" }];
    render(
      <DataTable
        columns={columns}
        rows={ROWS}
        getRowId={(row) => row.id}
        initialSort={{ key: "score", direction: "desc" }}
      />,
    );
    const header = screen.getByRole("columnheader", { name: /Score/ });
    expect(names()).toEqual(["job 1", "Job 10", "Job 2"]);

    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual(["Job 10", "job 1", "Job 2"]);

    await user.click(within(header).getByRole("button"));
    expect(header).not.toHaveAttribute("aria-sort");
  });

  it("sorts empty values last", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} />);
    const sortByScore = screen.getByRole("button", { name: /Score/ });
    await user.click(sortByScore);
    expect(names()).toEqual(["Job 10", "job 1", "Job 2"]);
    await user.click(sortByScore);
    expect(names()).toEqual(["job 1", "Job 10", "Job 2"]);
  });

  it("does not offer sorting on columns without a sort value", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} />);
    const header = screen.getByRole("columnheader", { name: "Actions" });
    expect(within(header).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a row on click, but not from its own buttons", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} onRowClick={onRowClick} />,
    );

    await user.click(screen.getByText("Job 2"));
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);

    await user.click(screen.getByRole("button", { name: "Open Job 10" }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("leaves keyboard access to the row's own controls, without a Tab stop per row", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} onRowClick={vi.fn()} />);
    for (const row of screen.getAllByRole("row")) expect(row).not.toHaveAttribute("tabindex");
  });

  it("does not open the row when an item in its menu is chosen", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onSelect = vi.fn();
    const columns: Column<Row>[] = [
      COLUMNS[0]!,
      {
        key: "menu",
        header: "Menu",
        cell: (row) => (
          <DropdownMenu
            trigger={(props) => (
              <button type="button" {...props}>
                Actions for {row.name}
              </button>
            )}
            items={[{ label: "Archive", onSelect }]}
          />
        ),
      },
    ];
    render(<DataTable columns={columns} rows={ROWS} getRowId={(row) => row.id} onRowClick={onRowClick} />);

    await user.click(screen.getByRole("button", { name: "Actions for Job 2" }));
    // The menu is portalled to <body>, outside the row, but React still bubbles to it.
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("shows the empty slot when there are no rows", () => {
    render(
      <DataTable columns={COLUMNS} rows={[]} getRowId={(row) => row.id} empty={<p>No jobs yet</p>} />,
    );
    expect(screen.getByText("No jobs yet")).toBeInTheDocument();
  });
});

describe("DataTable when the load fails", () => {
  it("says the list could not load instead of showing its empty state", async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        rows={undefined}
        getRowId={(row) => row.id}
        error={new Error("Network down")}
        onRetry={onRetry}
        empty={<p>Create your first job</p>}
      />,
    );

    expect(screen.queryByText("Create your first job")).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load this list")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("nextSort", () => {
  const column: Column<Row> = { key: "score", header: "Score", cell: () => null, firstSortDirection: "desc" };

  it("starts a column in its first direction, then reverses, then clears", () => {
    expect(nextSort(null, column)).toEqual({ key: "score", direction: "desc" });
    expect(nextSort({ key: "name", direction: "asc" }, column)).toEqual({ key: "score", direction: "desc" });
    expect(nextSort({ key: "score", direction: "desc" }, column)).toEqual({ key: "score", direction: "asc" });
    expect(nextSort({ key: "score", direction: "asc" }, column)).toBeNull();
  });

  it("starts ascending when the column names no first direction", () => {
    expect(nextSort(null, { ...column, firstSortDirection: undefined })).toEqual({ key: "score", direction: "asc" });
  });
});

describe("compareValues", () => {
  it("puts null and empty values after everything else", () => {
    expect([3, null, 1, undefined, 2].sort(compareValues)).toEqual([1, 2, 3, null, undefined]);
  });
});
