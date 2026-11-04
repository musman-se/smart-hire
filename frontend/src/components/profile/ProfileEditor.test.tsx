import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { candidatesApi } from "../../api/resources";
import { makeCandidate } from "../candidate/fixtures";
import { ConfirmProvider, ToastProvider } from "../ui";
import { ProfileEditor } from "./ProfileEditor";

const candidate = makeCandidate({ headline: "Engineer", years_experience: 2, skills: ["python"] });

function setup() {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A data router, because the unsaved-changes guard uses useBlocker.
  const router = createMemoryRouter([{ path: "/profile", element: <ProfileEditor candidate={candidate} /> }], {
    initialEntries: ["/profile"],
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { user };
}

const saveBar = () => screen.queryByRole("region", { name: "Unsaved changes" });

describe("ProfileEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the save bar only while something has changed", async () => {
    const { user } = setup();
    expect(saveBar()).not.toBeInTheDocument();

    const headline = screen.getByLabelText(/Headline/);
    await user.clear(headline);
    await user.type(headline, "Data engineer");
    expect(saveBar()).toBeInTheDocument();
    // The preview follows the form before anything is saved.
    expect(screen.getByRole("group", { name: "Preview of your profile" })).toHaveTextContent("Data engineer");

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(saveBar()).not.toBeInTheDocument();
    expect(headline).toHaveValue("Engineer");
  });

  it("blocks a save with an invalid field and points at it", async () => {
    const update = vi.spyOn(candidatesApi, "update");
    const { user } = setup();

    const resume = screen.getByLabelText(/Resume link/);
    await user.type(resume, "my-cv.pdf");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter a full link starting with https://")).toBeInTheDocument();
    expect(resume).toHaveFocus();
    expect(update).not.toHaveBeenCalled();
  });

  it("moves focus to an invalid phone on save and keeps it out of the preview", async () => {
    const update = vi.spyOn(candidatesApi, "update");
    const { user } = setup();

    const phone = screen.getByLabelText(/Phone/);
    await user.type(phone, "abc");
    // An unsavable phone is not credited in the preview recruiters would see.
    expect(screen.getByRole("group", { name: "Preview of your profile" })).not.toHaveTextContent("abc");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(phone).toHaveFocus();
    expect(update).not.toHaveBeenCalled();
  });

  it("sends only the fields that changed", async () => {
    const update = vi
      .spyOn(candidatesApi, "update")
      .mockResolvedValue({ ...candidate, years_experience: 5 });
    const { user } = setup();

    const years = screen.getByLabelText(/Years of experience/);
    await user.clear(years);
    await user.type(years, "5");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(update).toHaveBeenCalledWith(candidate.id, { years_experience: 5 });
    await waitFor(() => expect(saveBar()).not.toBeInTheDocument());
  });
});
