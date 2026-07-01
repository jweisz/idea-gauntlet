import { useState, useEffect } from "react";
import {
  settingsApi,
  providersApi,
  configApi,
  type ProviderInfo,
  type AppSettings,
  type AppConfig,
} from "../lib/api";
import { useAudioStore } from "../store/audioStore";
import { TRACKS } from "../hooks/useBgMusic";

const selectStyle: React.CSSProperties = {
  background: "var(--nes-darkgray)",
  border: "2px solid var(--nes-gray)",
  color: "var(--nes-white)",
  fontFamily: "inherit",
  fontSize: "0.6rem",
  padding: "6px 8px",
  cursor: "pointer",
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  background: "var(--nes-black)",
  border: "2px solid var(--nes-gray)",
  color: "var(--nes-white)",
  fontFamily: "inherit",
  fontSize: "0.55rem",
  padding: "6px 8px",
  outline: "none",
  width: "100%",
  letterSpacing: 1,
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: "var(--nes-cyan)",
};

interface KeyInputProps {
  label: string;
  placeholder: string;
  isSet: boolean;
  value: string;
  onChange: (v: string) => void;
}

function KeyInput({
  label,
  placeholder,
  isSet,
  value,
  onChange,
}: KeyInputProps) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <label style={{ fontSize: "0.55rem", color: "var(--nes-gray)" }}>
          {label}
        </label>
        {isSet && !value && (
          <span style={{ fontSize: "0.5rem", color: "var(--nes-green)" }}>
            ✓ configured
          </span>
        )}
        {value && (
          <span style={{ fontSize: "0.5rem", color: "var(--nes-yellow)" }}>
            ● will update
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type={show ? "text" : "password"}
          style={focused ? inputFocusStyle : inputStyle}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            isSet ? "● ● ● ● ● ● leave blank to keep existing" : placeholder
          }
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          style={{
            background: "var(--nes-darkgray)",
            border: "2px solid var(--nes-gray)",
            color: "var(--nes-gray)",
            fontFamily: "inherit",
            fontSize: "0.5rem",
            padding: "0 8px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {show ? "HIDE" : "SHOW"}
        </button>
      </div>
    </div>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { manualTrackId, setManualTrack } = useAudioStore();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    non_agent_provider: null,
    non_agent_model: null,
    openai_api_key: false,
    anthropic_api_key: false,
    google_api_key: false,
    ollama_base_url: null,
  });
  const [keys, setKeys] = useState({
    anthropic: "",
    openai: "",
    google: "",
    ollama_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = () =>
    Promise.all([providersApi.list(), settingsApi.get(), configApi.get()])
      .then(([p, s, c]) => {
        setProviders(p);
        setSettings(s);
        setConfig(c);
        setKeys((k) => ({ ...k, ollama_url: s.ollama_base_url ?? "" }));
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedProvider = providers.find(
    (p) => p.provider === settings.non_agent_provider,
  );
  const models = selectedProvider?.models ?? [];

  // Hidden in hosted mode: players don't manage server keys or pick models.
  const showModels = config?.show_model_selection ?? true;
  const showKeys = config?.show_api_key_settings ?? true;

  const handleProviderChange = (provider: string) => {
    const firstModel =
      providers.find((p) => p.provider === provider)?.models[0] ?? null;
    setSettings((s) => ({
      ...s,
      non_agent_provider: provider || null,
      non_agent_model: firstModel,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, string | null> = {};
      if (showModels) {
        patch.non_agent_provider = settings.non_agent_provider;
        patch.non_agent_model = settings.non_agent_model;
      }
      if (keys.anthropic.trim())
        patch.anthropic_api_key = keys.anthropic.trim();
      if (keys.openai.trim()) patch.openai_api_key = keys.openai.trim();
      if (keys.google.trim()) patch.google_api_key = keys.google.trim();
      if (keys.ollama_url.trim())
        patch.ollama_base_url = keys.ollama_url.trim();

      await settingsApi.update(patch);

      // Re-fetch settings + providers so new keys appear in the list
      setLoading(true);
      setKeys({ anthropic: "", openai: "", google: "", ollama_url: "" });
      await loadData();

      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--nes-darkgray)",
          border: "4px solid var(--nes-cyan)",
          boxShadow: "6px 6px 0 var(--nes-cyan)",
          padding: "20px 24px",
          width: "min(520px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 className="text-cyan" style={{ fontSize: "0.9rem" }}>
            ⚙ SETTINGS
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--nes-gray)",
              cursor: "pointer",
              fontSize: "0.7rem",
              fontFamily: "inherit",
            }}
          >
            [ESC]
          </button>
        </div>

        {/* BGM Track — always visible, no loading required */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--nes-yellow)",
                marginBottom: 4,
              }}
            >
              BGM TRACK
            </div>
            <div
              style={{
                fontSize: "0.55rem",
                color: "var(--nes-gray)",
                lineHeight: 1.8,
              }}
            >
              AUTO plays a different track per screen. Override to lock a
              specific track.
            </div>
          </div>
          <select
            style={selectStyle}
            value={manualTrackId ?? ""}
            onChange={(e) => setManualTrack(e.target.value || null)}
          >
            <option value="">AUTO (per screen)</option>
            {TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)" }} />

        {loading ? (
          <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
            LOADING...
          </p>
        ) : (
          <>
            {/* Judge model — hidden in hosted mode */}
            {showModels && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--nes-yellow)",
                      marginBottom: 4,
                    }}
                  >
                    JUDGE MODEL
                  </div>
                  <div
                    style={{
                      fontSize: "0.55rem",
                      color: "var(--nes-gray)",
                      lineHeight: 1.8,
                    }}
                  >
                    Used for debate scoring and defeat analysis
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{ fontSize: "0.55rem", color: "var(--nes-gray)" }}
                    >
                      PROVIDER
                    </label>
                    <select
                      style={selectStyle}
                      value={settings.non_agent_provider ?? ""}
                      onChange={(e) => handleProviderChange(e.target.value)}
                    >
                      <option value="">— select —</option>
                      {providers.map((p) => (
                        <option key={p.provider} value={p.provider}>
                          {p.provider}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      flex: 1,
                      minWidth: 120,
                    }}
                  >
                    <label
                      style={{ fontSize: "0.55rem", color: "var(--nes-gray)" }}
                    >
                      MODEL
                    </label>
                    <select
                      style={selectStyle}
                      value={settings.non_agent_model ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          non_agent_model: e.target.value || null,
                        }))
                      }
                      disabled={models.length === 0}
                    >
                      <option value="">— select —</option>
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {showModels && showKeys && (
              <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)" }} />
            )}

            {/* API Keys — hidden in hosted mode */}
            {showKeys && (
              <>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--nes-yellow)",
                        marginBottom: 4,
                      }}
                    >
                      API KEYS
                    </div>
                    <div
                      style={{
                        fontSize: "0.55rem",
                        color: "var(--nes-gray)",
                        lineHeight: 1.8,
                      }}
                    >
                      Keys are stored on the backend only — never in the
                      browser.
                    </div>
                  </div>
                  <KeyInput
                    label="ANTHROPIC"
                    placeholder="sk-ant-api03-..."
                    isSet={settings.anthropic_api_key}
                    value={keys.anthropic}
                    onChange={(v) => setKeys((k) => ({ ...k, anthropic: v }))}
                  />
                  <KeyInput
                    label="OPENAI"
                    placeholder="sk-proj-..."
                    isSet={settings.openai_api_key}
                    value={keys.openai}
                    onChange={(v) => setKeys((k) => ({ ...k, openai: v }))}
                  />
                  <KeyInput
                    label="GOOGLE (GEMINI)"
                    placeholder="AIzaSy..."
                    isSet={settings.google_api_key}
                    value={keys.google}
                    onChange={(v) => setKeys((k) => ({ ...k, google: v }))}
                  />
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{ fontSize: "0.55rem", color: "var(--nes-gray)" }}
                    >
                      OLLAMA BASE URL
                    </label>
                    <input
                      type="text"
                      style={inputStyle}
                      value={keys.ollama_url}
                      onChange={(e) =>
                        setKeys((k) => ({ ...k, ollama_url: e.target.value }))
                      }
                      placeholder={
                        settings.ollama_base_url ?? "http://localhost:11434"
                      }
                    />
                  </div>
                </div>

                {/* Available providers */}
                {providers.length > 0 && (
                  <div
                    style={{
                      border: "2px solid var(--nes-gray)",
                      padding: "8px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.55rem",
                        color: "var(--nes-gray)",
                        marginBottom: 4,
                      }}
                    >
                      AVAILABLE PROVIDERS
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {providers.map((p) => (
                        <span
                          key={p.provider}
                          style={{
                            fontSize: "0.6rem",
                            color: "var(--nes-green)",
                          }}
                        >
                          ✓ {p.provider}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <p style={{ fontSize: "0.6rem", color: "var(--nes-red)" }}>
                {error}
              </p>
            )}

            <button
              className={`pixel-btn ${saved ? "pixel-btn--green" : ""}`}
              style={{ fontSize: "0.7rem", alignSelf: "flex-end" }}
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saved ? "✓ SAVED" : saving ? "SAVING..." : "SAVE ►"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
