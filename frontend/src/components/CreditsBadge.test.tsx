import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import CreditsBadge from "./CreditsBadge";
import { creditsApi } from "../lib/api";

const balance = (n: number) => ({
  balance: n,
  monthly_grant: 3,
  billing_enabled: false,
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Renders the badge at "/a", then navigates to "/b" to force a refetch. */
function renderAcrossNavigation() {
  return render(
    <MemoryRouter initialEntries={["/a"]}>
      <CreditsBadge variant="toolbar" />
      <Routes>
        <Route path="/a" element={<Navigate to="/b" replace />} />
        <Route path="/b" element={<div />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CreditsBadge", () => {
  it("shows the balance", async () => {
    vi.spyOn(creditsApi, "me").mockResolvedValue(balance(2));

    render(
      <MemoryRouter>
        <CreditsBadge />
      </MemoryRouter>,
    );

    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.getByText("CREDITS")).toBeTruthy();
  });

  it("plays the spend animation when the balance drops", async () => {
    vi.spyOn(creditsApi, "me")
      .mockResolvedValueOnce(balance(2))
      .mockResolvedValue(balance(1));

    const { container } = renderAcrossNavigation();

    // The gatekeeper charged a play between the two fetches.
    await waitFor(() => expect(screen.getByText("−1 🪙")).toBeTruthy());
    expect(container.querySelector(".credits-badge--bump")).toBeTruthy();
    expect(screen.getByText("CREDIT")).toBeTruthy(); // singular at 1
  });

  it("does not animate on the first load", async () => {
    vi.spyOn(creditsApi, "me").mockResolvedValue(balance(1));

    const { container } = render(
      <MemoryRouter>
        <CreditsBadge />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    expect(container.querySelector(".credits-badge--bump")).toBeNull();
  });

  it("tops up on click in a dev build, and animates the gain", async () => {
    vi.spyOn(creditsApi, "me").mockResolvedValue(balance(1));
    const devGrant = vi
      .spyOn(creditsApi, "devGrant")
      .mockResolvedValue(balance(4));

    render(
      <MemoryRouter>
        <CreditsBadge />
      </MemoryRouter>,
    );

    const chip = await screen.findByRole("button");
    fireEvent.click(chip);

    await waitFor(() => expect(screen.getByText("+3 🪙")).toBeTruthy());
    expect(devGrant).toHaveBeenCalledTimes(1);
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("stops topping up at the cap", async () => {
    vi.spyOn(creditsApi, "me").mockResolvedValue(balance(99));
    const devGrant = vi.spyOn(creditsApi, "devGrant");

    render(
      <MemoryRouter>
        <CreditsBadge />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button"));
    expect(devGrant).not.toHaveBeenCalled();
  });
});
