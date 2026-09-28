import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, launchOptions: executablePath ? { executablePath } : {} },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --configLoader runner',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true
  }
});
