module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  collectCoverageFrom: [
    "api/backend.ts",
    "api/lobbyUnlock.ts",
    "app/_layout.tsx",
    "app/login.tsx",
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      lines: 70,
      branches: 55,
      functions: 70,
    },
  },
};
