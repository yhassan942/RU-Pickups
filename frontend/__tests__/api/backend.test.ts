// Backend API helper tests.
// Covers access-token retrieval and authenticated fetch behavior,
// including lobby unlock header propagation.
const mockGetSession = jest.fn();
const mockGetUnlockToken = jest.fn();

jest.mock("@/api/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

jest.mock("@/api/lobbyUnlock", () => ({
  getLobbyUnlockTokenSync: (lobbyId: string) => mockGetUnlockToken(lobbyId),
}));

describe("backend api helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error test fetch override
    global.fetch = jest.fn();
  });

  // Verifies token helper degrades gracefully on Supabase session errors.
  it("returns null when session lookup fails", async () => {
    mockGetSession.mockResolvedValueOnce({ data: {}, error: new Error("boom") });
    const backend = require("@/api/backend") as typeof import("@/api/backend");
    await expect(backend.getAccessToken()).resolves.toBeNull();
  });

  // Verifies authedFetch injects Bearer token into outgoing requests.
  it("adds authorization header for authed fetch", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-123" } },
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    const backend = require("@/api/backend") as typeof import("@/api/backend");
    await backend.authedFetch("/users/me");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/users/me");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer token-123");
  });

  // Verifies protected fetch helpers fail fast without an access token.
  it("throws when auth token is missing", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const backend = require("@/api/backend") as typeof import("@/api/backend");
    await expect(backend.authedFetch("/lobbies")).rejects.toThrow("Not authenticated");
  });

  // Verifies per-lobby unlock token is propagated as request header.
  it("adds X-Lobby-Unlock header when unlock token exists", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-xyz" } },
      error: null,
    });
    mockGetUnlockToken.mockReturnValueOnce("unlock-secret");
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    const backend = require("@/api/backend") as typeof import("@/api/backend");
    await backend.authedFetchForLobby("lobby-123", "/lobbies/lobby-123/join");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer token-xyz");
    expect((init.headers as Headers).get("X-Lobby-Unlock")).toBe("unlock-secret");
  });
});
