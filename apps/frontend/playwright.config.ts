import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const python = process.env.BRAINDEBUGGER_PYTHON ?? 'python';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, launchOptions: executablePath ? { executablePath } : {} },
  projects: [
    { name: 'mocked-ui', testMatch: 'explorer.spec.ts' },
    { name: 'real-api', testMatch: 'real-api.spec.ts' }
  ],
  webServer: [
    {
      command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --configLoader runner',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true
    },
    {
      command: `"${python}" -m uvicorn app.main:app --app-dir apps/backend --host 127.0.0.1 --port 8000`,
      cwd: resolve(import.meta.dirname, '../..'),
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});
