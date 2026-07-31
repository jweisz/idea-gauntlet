import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChallengerSelectScreen from "./ChallengerSelectScreen";
import { gauntlet, type AgentSummary } from "../lib/api";
import { useConfigStore } from "../store/configStore";
import { useGameStore } from "../store/gameStore";

const CONFIG = {
  game_name: "Idea Gauntlet",
  auth: "local",
  google_client_id: "",
  credits_enabled: false,
  billing_enabled: false,
  show_api_key_settings: true,
  show_model_selection: true,
  leaderboard_enabled: true,
  accepting_new_players: true,
  difficulty_bosses: { easy: 3, normal: 5, difficult: 7, insane: 8 },
  difficulty_progression: {
    easy: "linear",
    normal: "linear",
    difficult: "linear",
    insane: "free",
  },
} as const;

const POOL: AgentSummary[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  name: `Critic ${i + 1}`,
  emoji: "🤖",
  role_description: "critic",
}));

let randomAgents: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  useConfigStore.setState({ config: CONFIG, error: false });
  useGameStore.setState({ pendingIdea: "Candy is bad", pendingAgents: [] });
  randomAgents = vi.spyOn(gauntlet, "randomAgents").mockResolvedValue(POOL);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <ChallengerSelectScreen />
    </MemoryRouter>,
  );
}

const tileNames = () =>
  screen.getAllByText(/^Critic \d+$/).map((el) => el.textContent as string);

describe("ChallengerSelectScreen", () => {
  it("fetches the longest possible lineup once, not one per difficulty", async () => {
    renderScreen();
    await waitFor(() => expect(tileNames().length).toBe(5));

    fireEvent.click(screen.getByText("EASY"));
    fireEvent.click(screen.getByText("DIFFICULT"));
    fireEvent.click(screen.getByText("INSANE"));

    expect(randomAgents).toHaveBeenCalledTimes(1);
    expect(randomAgents).toHaveBeenCalledWith(8);
  });

  it("shows as many challengers as the chosen difficulty has bosses", async () => {
    renderScreen();
    await waitFor(() => expect(tileNames().length).toBe(5)); // normal

    fireEvent.click(screen.getByText("EASY"));
    expect(tileNames().length).toBe(3);

    fireEvent.click(screen.getByText("DIFFICULT"));
    expect(tileNames().length).toBe(7);

    fireEvent.click(screen.getByText("INSANE"));
    expect(tileNames().length).toBe(8);
  });

  it("keeps the challengers you already saw when the gauntlet gets longer", async () => {
    renderScreen();
    await waitFor(() => expect(tileNames().length).toBe(5));

    fireEvent.click(screen.getByText("EASY"));
    const onEasy = tileNames();

    fireEvent.click(screen.getByText("DIFFICULT"));
    // A prefix, so raising the difficulty adds critics rather than reshuffling.
    expect(tileNames().slice(0, 3)).toEqual(onEasy);
  });

  it("uses the ordered lineup for in-order tiers and the grid for free choice", async () => {
    renderScreen();
    await waitFor(() => expect(tileNames().length).toBe(5));

    expect(screen.queryByTestId("challenger-lineup")).toBeTruthy();
    expect(screen.queryByTestId("challenger-grid")).toBeNull();

    fireEvent.click(screen.getByText("INSANE"));

    expect(screen.queryByTestId("challenger-grid")).toBeTruthy();
    expect(screen.queryByTestId("challenger-lineup")).toBeNull();
  });

  it("still loads challengers when the backend sends no gauntlet config", async () => {
    // Regression: with the keys absent the max boss count was 0, so the mount
    // effect returned before fetching and the screen sat on "LOADING AGENTS..."
    // forever — with nothing in the server logs, because no request was ever
    // made. It must fall back to the legacy 8-boss free-choice run instead.
    const { difficulty_bosses, difficulty_progression, ...legacy } = CONFIG;
    void difficulty_bosses;
    void difficulty_progression;
    useConfigStore.setState({ config: legacy as never });

    renderScreen();

    await waitFor(() => expect(randomAgents).toHaveBeenCalledWith(8));
    await waitFor(() => expect(tileNames().length).toBe(8));
    expect(screen.queryByText("LOADING AGENTS...")).toBeNull();
  });

  it("keeps one reroll button in the action row on every tier", async () => {
    // It used to move to the grid's centre tile on free choice, so switching
    // difficulty read as the button teleporting.
    renderScreen();
    await waitFor(() => expect(tileNames().length).toBe(5));

    for (const tier of ["EASY", "DIFFICULT", "INSANE", "NORMAL"]) {
      fireEvent.click(screen.getByText(tier));
      expect(screen.getAllByText(/REROLL/).length).toBe(1);
    }
  });

  it("numbers the lineup only when the run is fought in order", async () => {
    renderScreen();
    await waitFor(() => expect(tileNames().length).toBe(5));

    expect(screen.getByText("1")).toBeTruthy(); // normal: order matters

    fireEvent.click(screen.getByText("INSANE"));

    expect(screen.queryByText("1")).toBeNull(); // free choice: it doesn't
  });

  it("starts the game with exactly the challengers on screen", async () => {
    const createSession = vi
      .spyOn(gauntlet, "createSession")
      .mockResolvedValue({} as never);
    renderScreen();
    await waitFor(() => expect(tileNames().length).toBe(5));

    fireEvent.click(screen.getByText("EASY"));
    fireEvent.click(screen.getByText(/ENTER THE GAUNTLET/));

    await waitFor(() =>
      expect(createSession).toHaveBeenCalledWith(
        "Candy is bad",
        [1, 2, 3],
        "easy",
      ),
    );
  });
});
