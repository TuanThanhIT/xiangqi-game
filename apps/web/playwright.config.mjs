import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

loadEnvFile(fileURLToPath(new URL("../server/.env", import.meta.url)));
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: "list",
  outputDir: "../../.tmp/playwright-auth",
  use: { baseURL: "http://localhost:3000", channel: "chrome", headless: true, trace: "off", video: "off", screenshot: "off" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
