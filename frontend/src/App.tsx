import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  isAuthenticated,
  buildLocalDevSession,
  setAuthSession,
} from "./lib/auth";
import { useConfigStore } from "./store/configStore";
import GoogleSignIn from "./components/GoogleSignIn";
import ConnectionError from "./components/ConnectionError";
import type { AppConfig } from "./lib/api";
import { useAudioStore } from "./store/audioStore";
import { useBgMusic } from "./hooks/useBgMusic";
import { useGameStore } from "./store/gameStore";
import { gauntlet } from "./lib/api";
import AudioControls from "./components/AudioControls";
import HomeScreen from "./screens/HomeScreen";
import IdeaEntryScreen from "./screens/IdeaEntryScreen";
import GatekeeperScreen from "./screens/GatekeeperScreen";
import ChallengerSelectScreen from "./screens/ChallengerSelectScreen";
import StageSelectScreen from "./screens/StageSelectScreen";
import BossInterstitialScreen from "./screens/BossInterstitialScreen";
import BattleScreen from "./screens/BattleScreen";
import SummaryScreen from "./screens/SummaryScreen";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import WaitlistScreen from "./screens/WaitlistScreen";

// One track per boss slot — 8 slots, 8 unique tracks. This maps to the
// boss's *position in the session's roster*, not the boss's identity: which
// track a given boss (e.g. Bedrock) gets depends on where it landed in that
// game's randomized order, so it won't always be the same track across
// different games. "overworld" and "credits" are reserved for the menu
// screens and the summary screen respectively, so they're excluded here.
const BATTLE_TRACKS = [
  "arena",
  "shadow",
  "boss-rush",
  "voltage",
  "thunder",
  "mirage",
  "starlight",
  "carnival",
];

function AudioManager() {
  const { musicEnabled, manualTrackId } = useAudioStore();
  const location = useLocation();
  const session = useGameStore((s) => s.session);

  const autoTrackId = useMemo(() => {
    const path = location.pathname;
    if (
      path === "/" ||
      path === "/new" ||
      path === "/gatekeeper" ||
      path === "/choose-challengers"
    )
      return "overworld";
    if (path === "/stage-select") return "arena";
    if (path.startsWith("/battle/")) {
      const bossId = Number(path.split("/").pop());
      const idx = session?.bosses.findIndex((b) => b.id === bossId) ?? 0;
      return BATTLE_TRACKS[Math.max(0, idx) % BATTLE_TRACKS.length];
    }
    if (path === "/summary") return "credits";
    return "arena";
  }, [location.pathname, session]);

  const isBossInterstitial = location.pathname.startsWith("/boss/");
  useBgMusic(musicEnabled && !isBossInterstitial, manualTrackId ?? autoTrackId);
  return null;
}

function SessionRestorer() {
  const { session, setSession } = useGameStore();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (session) return;
    const savedId = localStorage.getItem("gauntlet_session_id");
    if (!savedId) return;
    gauntlet
      .getSession(Number(savedId))
      .then((s) => {
        setSession(s);
        // Never drop back into a battle/boss screen from a page refresh — redirect to stage select
        const { pathname } = location;
        if (pathname.startsWith("/battle/") || pathname.startsWith("/boss/")) {
          navigate("/stage-select", { replace: true });
        }
      })
      .catch(() => localStorage.removeItem("gauntlet_session_id"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const config = useConfigStore((s) => s.config);
  const error = useConfigStore((s) => s.error);
  const load = useConfigStore((s) => s.load);
  const reload = useConfigStore((s) => s.reload);
  const [authed, setAuthed] = useState(isAuthenticated());

  const applyConfig = (c: AppConfig | null) => {
    // Self-host / local-open: auto-establish a local-dev session. Guarded on a
    // real config (never a failed load) so an unreachable backend can't drop us
    // into a tokenless self-host session.
    if (c && c.auth !== "google" && !isAuthenticated()) {
      setAuthSession(buildLocalDevSession());
    }
    setAuthed(isAuthenticated());
  };

  useEffect(() => {
    load().then(applyConfig);
  }, [load]);

  if (error && !config) {
    return <ConnectionError onRetry={() => reload().then(applyConfig)} />;
  }
  if (!config) return null; // brief: waiting on /api/config

  if (config.auth === "google" && !authed) {
    return (
      <GoogleSignIn
        clientId={config.google_client_id}
        onSignedIn={() => setAuthed(true)}
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <AudioManager />
        <SessionRestorer />
        <AudioControls />
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/new" element={<IdeaEntryScreen />} />
          <Route path="/gatekeeper" element={<GatekeeperScreen />} />
          <Route
            path="/choose-challengers"
            element={<ChallengerSelectScreen />}
          />
          <Route path="/stage-select" element={<StageSelectScreen />} />
          <Route path="/boss/:bossId" element={<BossInterstitialScreen />} />
          <Route path="/battle/:bossId" element={<BattleScreen />} />
          <Route path="/summary" element={<SummaryScreen />} />
          <Route path="/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/waitlist" element={<WaitlistScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
