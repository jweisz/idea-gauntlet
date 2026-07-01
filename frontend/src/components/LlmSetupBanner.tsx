import { useEffect, useState } from "react";
import { settingsApi, type AppSettings } from "../lib/api";
import { useConfigStore } from "../store/configStore";
import { useUIStore } from "../store/uiStore";

const DISMISS_KEY = "llm_setup_banner_dismissed";

/**
 * Soft, dismissible nudge shown when no LLM provider looks configured yet.
 *
 * This is a best-effort hint, not a gate: it only sees DB-stored settings, so
 * it can't detect env-var-based keys or a working local Ollama model with no
 * override set. That's fine — the real safety net is the just-in-time error
 * screens (e.g. the Gatekeeper) that surface a clear message the moment an
 * LLM call actually fails, whatever the cause. Only rendered in self-host,
 * where Settings actually exposes key/model fields to act on.
 */
export default function LlmSetupBanner() {
  const config = useConfigStore((s) => s.config);
  const openSettings = useUIStore((s) => s.openSettings);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => {
    settingsApi
      .get()
      .then(setSettings)
      .catch(() => {});
  }, []);

  if (!config?.show_api_key_settings || dismissed || !settings) return null;

  const noKeys =
    !settings.openai_api_key &&
    !settings.anthropic_api_key &&
    !settings.google_api_key;
  const noModelOverride =
    !settings.non_agent_provider && !settings.non_agent_model;
  if (!(noKeys && noModelOverride)) return null;

  return (
    <div
      className="pixel-box pixel-box--yellow"
      style={{
        width: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
      }}
    >
      <button
        className="pixel-btn"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          fontSize: "0.65rem",
          padding: "6px 10px",
        }}
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        title="Dismiss"
      >
        ✕
      </button>

      <span
        style={{
          fontSize: "0.65rem",
          color: "var(--nes-yellow)",
          lineHeight: 1.7,
          paddingRight: 36,
        }}
      >
        ⚠ NO AI MODEL CONFIGURED — critics won't respond until you add a key or
        model in Settings.
      </span>

      <button
        className="pixel-btn pixel-btn--yellow"
        style={{
          fontSize: "0.65rem",
          padding: "6px 10px",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        onClick={openSettings}
      >
        <span style={{ fontSize: "1.4em" }}>⚙️</span>
        CONFIGURE
      </button>
    </div>
  );
}
