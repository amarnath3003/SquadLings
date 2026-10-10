import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./browser-tests",
  timeout: 30000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (process.platform === "darwin" &&
      existsSync("/Applications/Google Chrome.app")
        ? "chrome"
        : undefined),
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
