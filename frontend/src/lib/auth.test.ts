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
