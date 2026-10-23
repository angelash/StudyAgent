import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const apiPort = Number(process.env.E2E_API_PORT ?? 4107);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3107);
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;
const sharedEnvironment = {
  STUDY_STORAGE: 'sqlite',
  STUDY_DATA_DIR: process.env.E2E_DATA_DIR ?? join(process.cwd(), 'data', 'qa', `browser-product-${process.pid}`),
  STUDY_ASSET_ROOT: join(process.cwd(), 'data', 'assets'),
  STUDY_WORKER_ENABLED: 'true',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.E2E_RESULT_FILE ?? 'data/qa/browser-product-acceptance.json' }],
  ],
  outputDir: 'test-results/browser-product-acceptance',
  use: {
    actionTimeout: 15_000,
    baseURL: webUrl,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start --workspace @study-agent/api',
      url: `${apiUrl}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ...sharedEnvironment,
        API_HOST: '127.0.0.1',
        API_PORT: String(apiPort),
        CORS_ORIGINS: `${webUrl},http://127.0.0.1:${webPort}`,
      },
    },
    {
      command: process.env.E2E_WEB_COMMAND ?? 'npm run start --workspace @study-agent/web',
      url: webUrl,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ...sharedEnvironment,
        PORT: String(webPort),
        NEXT_PUBLIC_API_BASE_URL: apiUrl,
      },
    },
  ],
});
