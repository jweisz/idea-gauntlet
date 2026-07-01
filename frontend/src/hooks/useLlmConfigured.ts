import { useEffect, useState } from "react";
import { settingsApi, type AppSettings } from "../lib/api";
import { useConfigStore } from "../store/configStore";
import { useUIStore } from "../store/uiStore";

export type LlmConfigState = "unknown" | "configured" | "unconfigured";

/**
 * Whether an LLM looks configured, from DB-stored settings alone.
 *
 * This can't see env-var-based keys or a working local Ollama model with no
 * override set, so it's a best-effort read used only to gate the "start a
 * new game" action in self-host installs (where Settings exposes key/model
 * fields to act on). The real safety net is still the just-in-time error
 * screens (e.g. the Gatekeeper) that surface a clear message the moment an
 * LLM call actually fails, whatever the cause.
 */
export function useLlmConfigured(): LlmConfigState {
  const config = useConfigStore((s) => s.config);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Settings live in a modal that overlays the caller rather than routing to
  // it, so this component never remounts to pick up changes made there.
  // Refetch on mount (settingsOpen starts false) and again whenever the
  // modal closes, so a just-added key/model is reflected immediately.
  useEffect(() => {
    if (settingsOpen) return;
    settingsApi
      .get()
      .then(setSettings)
      .catch(() => {});
  }, [settingsOpen]);

  if (!config?.show_api_key_settings) return "configured";
  if (!settings) return "unknown";

  const noKeys =
    !settings.openai_api_key &&
    !settings.anthropic_api_key &&
    !settings.google_api_key;
  const noModelOverride = !settings.llm_provider && !settings.llm_model;

  return noKeys && noModelOverride ? "unconfigured" : "configured";
}
