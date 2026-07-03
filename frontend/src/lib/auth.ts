// Lightweight client-side auth session, persisted in localStorage.

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

export interface AuthSession {
  accessToken: string | null;
  tokenType: "bearer";
  user?: { email?: string; name?: string };
  mode: "local-dev" | "jwt";
}

const AUTH_SESSION_KEY = "idea_gauntlet_auth_session";

export function getAuthSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || (parsed.mode !== "local-dev" && parsed.mode !== "jwt"))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getAuthSession()?.accessToken ?? null;
}

export function withAuthHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export function buildLocalDevSession(): AuthSession {
  return {
    accessToken: null,
    tokenType: "bearer",
    mode: "local-dev",
    user: { email: "local_dev@localhost" },
  };
}

export function setAuthSession(session: AuthSession): void {
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function setJwtSession(
  accessToken: string,
  user?: { email?: string; name?: string },
): void {
  setAuthSession({ accessToken, tokenType: "bearer", mode: "jwt", user });
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

/**
 * Call on sign-out. Without this, GIS silently re-selects the same Google
 * account on the next sign-in attempt instead of showing the account
 * chooser, which would defeat the point of signing out to switch accounts.
 */
export function disableGoogleAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect();
}

export function isAuthenticated(): boolean {
  const s = getAuthSession();
  return s !== null;
}
