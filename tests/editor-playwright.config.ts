import { defineConfig } from '@playwright/test';
import configuration from '../playwright.config';
export default defineConfig({ ...configuration, testDir: './ui', webServer: undefined, use: { ...configuration.use, baseURL: 'http://127.0.0.1:1423' } });
