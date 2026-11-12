import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', workers: 1,
  use: { baseURL: 'http://127.0.0.1:1420', headless: true, viewport: { width: 1366, height: 768 }, channel: 'msedge' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:1420', reuseExistingServer: false },
});
