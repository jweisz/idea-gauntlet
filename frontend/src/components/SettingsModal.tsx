import { useEffect, useRef, useState } from "react";
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
  error?: string | null;
  onCommit: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
}

function KeyInput({
  label,
  placeholder,
  isSet,
  error,
  onCommit,
  onClear,
}: KeyInputProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft("");
    await onCommit(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

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
        {saved && (
          <span style={{ fontSize: "0.5rem", color: "var(--nes-green)" }}>
            ✓ saved
          </span>
        )}
        {!saved && isSet && (
          <span style={{ fontSize: "0.5rem", color: "var(--nes-green)" }}>
            ✓ configured
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type={show ? "text" : "password"}
          style={focused ? inputFocusStyle : inputStyle}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder={
            isSet ? "● ● ● ● ● ● leave blank to keep existing" : placeholder
          }
          autoComplete="off"
        />
        {isSet && (
          <button
            type="button"
            title="Remove this key"
            onClick={async () => {
              setClearing(true);
              await onClear();
              setClearing(false);
            }}
            disabled={clearing}
            style={{
              background: "rgba(214,40,40,0.15)",
              border: "2px solid var(--nes-red)",
              color: "var(--nes-red)",
              fontFamily: "inherit",
              fontSize: "0.6rem",
              padding: "0 10px",
              cursor: clearing ? "default" : "pointer",
              opacity: clearing ? 0.5 : 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            🗑
          </button>
        )}
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
      {isSet && error && (
        <p
          style={{
            fontSize: "0.5rem",
            color: "var(--nes-red)",
            lineHeight: 1.6,
          }}
        >
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { manualTrackId, setManualTrack } = useAudioStore();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    llm_provider: null,
    llm_model: null,
    openai_api_key: false,
    anthropic_api_key: false,
    google_api_key: false,
    ollama_base_url: null,
  });
  const [ollamaDraft, setOllamaDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Set (before calling onClose) whenever the modal is being dismissed
  // without saving (ESC / backdrop / header close), so an in-flight blur on
  // a still-focused field doesn't sneak a commit in as it unmounts. The
  // SAVE button does NOT set this — clicking it naturally blurs the
  // focused field first (browser focus order), letting that edit commit
  // normally before the modal closes.
  const discardingRef = useRef(false);

  const loadData = () =>
    Promise.all([providersApi.list(), settingsApi.get(), configApi.get()])
      .then(([p, s, c]) => {
        setProviders(p);
        setSettings(s);
        setConfig(c);
        setOllamaDraft(s.ollama_base_url ?? "");
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));

  useEffect(() => {
    void loadData();
  }, []);

  const closeDiscarding = () => {
    discardingRef.current = true;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDiscarding();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProvider = providers.find(
    (p) => p.provider === settings.llm_provider,
  );
  const models = selectedProvider?.models ?? [];

  // Hidden in hosted mode: players don't manage server keys or pick models.
  const showModels = config?.show_model_selection ?? true;
  const showKeys = config?.show_api_key_settings ?? true;

  const patchSettings = async (patch: Record<string, string | null>) => {
    if (discardingRef.current) return;
    try {
      await settingsApi.update(patch);
    } catch {
      setError("Failed to save settings");
    }
  };

  const handleProviderChange = async (provider: string) => {
    const firstModel =
      providers.find((p) => p.provider === provider)?.models[0] ?? null;
    const patch = {
      llm_provider: provider || null,
      llm_model: firstModel,
    };
    setSettings((s) => ({ ...s, ...patch }));
    await patchSettings(patch);
  };

  const handleModelChange = async (model: string) => {
    const patch = { llm_model: model || null };
    setSettings((s) => ({ ...s, ...patch }));
    await patchSettings(patch);
  };

  const commitKey = async (
    field: "anthropic_api_key" | "openai_api_key" | "google_api_key",
    value: string,
  ) => {
    await patchSettings({ [field]: value });
    await loadData();
  };

  const clearKey = async (
    field: "anthropic_api_key" | "openai_api_key" | "google_api_key",
  ) => {
    await patchSettings({ [field]: null });
    await loadData();
  };

  const commitOllamaUrl = async () => {
    const trimmed = ollamaDraft.trim();
    if (!trimmed || trimmed === (settings.ollama_base_url ?? "")) return;
    await patchSettings({ ollama_base_url: trimmed });
    await loadData();
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
        if (e.target === e.currentTarget) closeDiscarding();
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
            onClick={closeDiscarding}
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
            <option value="">AUTO</option>
            {TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {(showModels || showKeys) && (
          <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)" }} />
        )}

        {loading ? (
          <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
            LOADING...
          </p>
        ) : (
          <>
            {/* Model — hidden in hosted mode */}
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
                    MODEL
                  </div>
                  <div
                    style={{
                      fontSize: "0.55rem",
                      color: "var(--nes-gray)",
                      lineHeight: 1.8,
                    }}
                  >
                    Used by every critic — plus debate scoring, defeat analysis,
                    and summaries
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
                      value={settings.llm_provider ?? ""}
                      onChange={(e) =>
                        void handleProviderChange(e.target.value)
                      }
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
                      value={settings.llm_model ?? ""}
                      onChange={(e) => void handleModelChange(e.target.value)}
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
                      browser. Saved instantly when you leave the field.
                    </div>
                  </div>
                  <KeyInput
                    label="ANTHROPIC"
                    placeholder="sk-ant-api03-..."
                    isSet={settings.anthropic_api_key}
                    error={
                      providers.find((p) => p.provider === "anthropic")?.error
                    }
                    onCommit={(v) => commitKey("anthropic_api_key", v)}
                    onClear={() => clearKey("anthropic_api_key")}
                  />
                  <KeyInput
                    label="OPENAI"
                    placeholder="sk-proj-..."
                    isSet={settings.openai_api_key}
                    error={
                      providers.find((p) => p.provider === "openai")?.error
                    }
                    onCommit={(v) => commitKey("openai_api_key", v)}
                    onClear={() => clearKey("openai_api_key")}
                  />
                  <KeyInput
                    label="GOOGLE (GEMINI)"
                    placeholder="AIzaSy..."
                    isSet={settings.google_api_key}
                    error={
                      providers.find((p) => p.provider === "gemini")?.error
                    }
                    onCommit={(v) => commitKey("google_api_key", v)}
                    onClear={() => clearKey("google_api_key")}
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
                      value={ollamaDraft}
                      onChange={(e) => setOllamaDraft(e.target.value)}
                      onBlur={() => void commitOllamaUrl()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="http://localhost:11434"
                    />
                  </div>
                </div>

                {/* Available providers — only those that actually resolved a model list */}
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
                      {providers
                        .filter((p) => !p.error)
                        .map((p) => (
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
              className="pixel-btn pixel-btn--green"
              style={{ fontSize: "0.7rem", alignSelf: "flex-end" }}
              onClick={onClose}
            >
              SAVE <span className="pixel-arrow">▶</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
