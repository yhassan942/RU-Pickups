// Root layout auth-routing tests.
// Covers redirects for unauthenticated users, expired sessions, and
// authenticated users with completed profiles.
import { render, waitFor, act, cleanup } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockUseSegments = jest.fn();
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();

jest.mock("expo-router", () => ({
  Stack: {
    Screen: () => null,
  },
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockUseSegments(),
}));

jest.mock("@/hooks/use-color-scheme", () => ({
  useColorScheme: () => "light",
}));

jest.mock("@/api/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: () => mockOnAuthStateChange(),
      signOut: () => mockSignOut(),
    },
  },
}));

const flushPromises = async () => {
  await Promise.resolve();
};

describe("RootLayout auth routing", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockUseSegments.mockReturnValue(["(tabs)"]);
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    global.fetch = jest.fn();
  });

  // Verifies sessionless users are blocked from tab routes.
  it("redirects unauthenticated users to login", async () => {
    mockUseSegments.mockReturnValue(["(tabs)"]);
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const RootLayout = require("@/app/_layout")
      .default as typeof import("@/app/_layout").default;

    render(<RootLayout />);

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    await waitFor(() => {
      expect(mockGetSession).toHaveBeenCalled();
    }, { timeout: 10000 });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    }, { timeout: 10000 });
  }, 20000);

  // Verifies stale/invalid tokens trigger forced sign-out flow.
  it("signs out and redirects to login when backend returns 401", async () => {
    mockUseSegments.mockReturnValue(["(tabs)"]);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({}),
    });

    const RootLayout = require("@/app/_layout")
      .default as typeof import("@/app/_layout").default;

    render(<RootLayout />);

    await act(async () => {
      await flushPromises();
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  // Verifies logged-in users on auth screens are forwarded into the app.
  it("redirects auth route users with valid profile to lobbies", async () => {
    mockUseSegments.mockReturnValue(["login"]);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ username: "dev1", preferred_campus: "busch" }),
    });

    const RootLayout = require("@/app/_layout")
      .default as typeof import("@/app/_layout").default;

    render(<RootLayout />);

    await act(async () => {
      await flushPromises();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/lobbies");
    });
  });
});