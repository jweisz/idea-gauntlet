import { beforeEach, describe, expect, it } from "vitest";
import {
  buildLocalDevSession,
  clearAuthSession,
  getAccessToken,
  getAuthSession,
  isAuthenticated,
  setAuthSession,
  setJwtSession,
  withAuthHeaders,
} from "./auth";

const KEY = "idea_gauntlet_auth_session";

beforeEach(() => {
  localStorage.clear();
});

describe("auth session storage", () => {
  it("returns null when nothing is stored", () => {
    expect(getAuthSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("ignores a malformed or invalid-mode session", () => {
    localStorage.setItem(KEY, "{not json");
    expect(getAuthSession()).toBeNull();

    localStorage.setItem(KEY, JSON.stringify({ mode: "bogus" }));
    expect(getAuthSession()).toBeNull();
  });

  it("round-trips a jwt session", () => {
    setJwtSession("tok999", { email: "a@b.com" });
    const session = getAuthSession();
    expect(session?.mode).toBe("jwt");
    expect(session?.accessToken).toBe("tok999");
    expect(getAccessToken()).toBe("tok999");
    expect(isAuthenticated()).toBe(true);
  });

  it("stores a local-dev session with no token", () => {
    setAuthSession(buildLocalDevSession());
    expect(getAuthSession()?.mode).toBe("local-dev");
    expect(getAccessToken()).toBeNull();
    expect(isAuthenticated()).toBe(true);
  });

  it("clearAuthSession removes the stored session", () => {
    setJwtSession("tok", undefined);
    clearAuthSession();
    expect(getAuthSession()).toBeNull();
  });
});

// Minimal unsigned JWT with the given `exp` (seconds since epoch). base64url,
// padding stripped — exactly how a real token is shaped.
function jwtWithExp(exp: number): string {
  const b64url = (o: object) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "HS256" })}.${b64url({ sub: "a@b.com", exp })}.sig`;
}

describe("jwt session expiry", () => {
  it("treats an expired token as signed-out and clears it", () => {
    setJwtSession(jwtWithExp(Math.floor(Date.now() / 1000) - 60));
    expect(isAuthenticated()).toBe(false);
    expect(getAccessToken()).toBeNull();
    // isAuthenticated drops the stale session so the app shows sign-in.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps a non-expired token", () => {
    const tok = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
    setJwtSession(tok);
    expect(isAuthenticated()).toBe(true);
    expect(getAccessToken()).toBe(tok);
  });

  it("falls back to valid when the token has no readable exp", () => {
    setJwtSession("not-a-jwt");
    expect(isAuthenticated()).toBe(true);
    expect(getAccessToken()).toBe("not-a-jwt");
  });
});

describe("withAuthHeaders", () => {
  it("adds the bearer header only when a token exists", () => {
    expect(
      new Headers(withAuthHeaders().headers).get("Authorization"),
    ).toBeNull();

    setJwtSession("tok-abc");
    const headers = new Headers(withAuthHeaders().headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-abc");
  });

  it("preserves existing init fields", () => {
    const init = withAuthHeaders({ method: "POST" });
    expect(init.method).toBe("POST");
  });
});
