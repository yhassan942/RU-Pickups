// Lobby unlock token storage tests.
// Covers platform-specific token persistence for native in-memory
// storage and web sessionStorage behavior.
describe("lobby unlock token storage", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  // Verifies non-web platforms use module memory for unlock token state.
  it("stores tokens in memory for native platforms", () => {
    jest.doMock("react-native", () => ({
      Platform: { OS: "ios" },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const storage = require("@/api/lobbyUnlock") as typeof import("@/api/lobbyUnlock");

    storage.setLobbyUnlockTokenSync("lobby-1", "unlock-1");
    expect(storage.getLobbyUnlockTokenSync("lobby-1")).toBe("unlock-1");

    storage.clearLobbyUnlockTokenSync("lobby-1");
    expect(storage.getLobbyUnlockTokenSync("lobby-1")).toBeNull();
  });

  // Verifies web platform persists unlock token state in sessionStorage.
  it("uses sessionStorage on web when available", () => {
    const store = new Map<string, string>();
    const sessionStorageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };

    Object.defineProperty(global, "sessionStorage", {
      value: sessionStorageMock,
      configurable: true,
    });

    jest.doMock("react-native", () => ({
      Platform: { OS: "web" },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const storage = require("@/api/lobbyUnlock") as typeof import("@/api/lobbyUnlock");

    storage.setLobbyUnlockTokenSync("lobby-2", "unlock-2");
    expect(storage.getLobbyUnlockTokenSync("lobby-2")).toBe("unlock-2");

    storage.clearLobbyUnlockTokenSync("lobby-2");
    expect(storage.getLobbyUnlockTokenSync("lobby-2")).toBeNull();
  });
});
