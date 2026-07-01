import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WaitlistScreen from "./WaitlistScreen";

describe("WaitlistScreen", () => {
  it("renders the closed-to-new-players message and signup affordances", () => {
    render(
      <MemoryRouter>
        <WaitlistScreen />
      </MemoryRouter>,
    );

    expect(screen.getByText(/not accepting new players/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /notify me/i })).toBeTruthy();
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
  });
});
