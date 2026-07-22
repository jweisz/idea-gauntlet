import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiJson, configApi } from "./api";

const originalFetch = globalThis.fetch;

function mockFetch(response: Response) {
  const fn = vi.fn().mockResolvedValue(response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("apiJson", () => {
  it("returns parsed JSON on success", async () => {
    mockFetch(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(apiJson("/api/health")).resolves.toEqual({ status: "ok" });
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(apiJson("/api/settings/")).resolves.toBeUndefined();
  });

  it("throws ApiError carrying the server-provided detail", async () => {
    mockFetch(
      new Response(JSON.stringify({ detail: "no credits" }), {
        status: 402,
        headers: { "content-type": "application/json" },
      }),
    );

    const err = await apiJson("/api/gauntlet/sessions").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(402);
    expect((err as ApiError).detail).toBe("no credits");
  });

  it("falls back to a generic message when no detail is present", async () => {
    mockFetch(new Response("", { status: 500 }));
    const err = await apiJson("/api/x").catch((e) => e);
    expect((err as ApiError).detail).toContain("500");
  });

  it("sends the bearer header when a jwt session is stored", async () => {
    localStorage.setItem(
      "idea_gauntlet_auth_session",
      JSON.stringify({
        accessToken: "tok123",
        tokenType: "bearer",
        mode: "jwt",
      }),
    );
    const fn = mockFetch(new Response("{}", { status: 200 }));

    await apiJson("/api/billing/me");

    const init = fn.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok123");
  });
});

describe("configApi.get", () => {
  it("retries then throws when the endpoint stays unreachable", async () => {
    // Fresh Response per call (a Response body can only be read once).
    const fn = vi.fn(() =>
      Promise.resolve(new Response("nope", { status: 503 })),
    );
    globalThis.fetch = fn as unknown as typeof fetch;

    await expect(configApi.get(3, 0)).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("recovers if a later attempt succeeds (no permissive fallback)", async () => {
    const ok = new Response(
      JSON.stringify({
        game_name: "Hosted",
        auth: "google",
        google_client_id: "",
        credits_enabled: true,
        billing_enabled: false,
        show_api_key_settings: false,
        show_model_selection: false,
        leaderboard_enabled: true,
        accepting_new_players: true,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(ok);
    globalThis.fetch = fn as unknown as typeof fetch;

    const config = await configApi.get(3, 0);
    expect(config.auth).toBe("google");
    expect(config.show_api_key_settings).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("returns the server config when the endpoint succeeds", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          game_name: "Hosted Gauntlet",
          auth: "google",
          google_client_id: "abc",
          credits_enabled: true,
          billing_enabled: true,
          show_api_key_settings: false,
          show_model_selection: false,
          leaderboard_enabled: true,
          accepting_new_players: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const config = await configApi.get();
    expect(config.game_name).toBe("Hosted Gauntlet");
    expect(config.billing_enabled).toBe(true);
    expect(config.accepting_new_players).toBe(false);
  });
});
