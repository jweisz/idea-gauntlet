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

/**
 * Decode a JWT's `exp` claim (seconds since epoch) without verifying the
 * signature — enough to know locally whether the token has expired. Returns
 * null if the token isn't a well-formed JWT with a numeric `exp`.
 */
function getTokenExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // base64url → base64, restoring the padding JWT strips (strict atob needs it).
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
}

/**
 * True once a jwt session's token has expired (with 30s of clock skew). local-
 * dev sessions never expire. If the token has no readable `exp`, we can't tell
 * locally — treat it as valid and let the server reject it with a 401 (handled
 * reactively in api.ts).
 */
export function isSessionExpired(session: AuthSession): boolean {
  if (session.mode !== "jwt" || !session.accessToken) return false;
  const exp = getTokenExp(session.accessToken);
  if (exp === null) return false;
  return Date.now() / 1000 >= exp - 30;
}

export function getAccessToken(): string | null {
  const s = getAuthSession();
  // Don't send a token we already know is expired.
  if (!s || isSessionExpired(s)) return null;
  return s.accessToken;
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
  if (!s) return false;
  // An expired token is as good as signed-out: drop it so the app shows the
  // sign-in screen instead of a logged-in shell whose data calls all 401.
  if (isSessionExpired(s)) {
    clearAuthSession();
    return false;
  }
  return true;
}
