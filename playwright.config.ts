import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/** Every flow runs on a phone-sized and a desktop-sized screen (SPEC §12). */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Everyone starts signed in through the mock Google flow. Login tests opt out.
    storageState: 'tests/e2e/.auth/state.json',
    // Flows are checked on still screens, so nothing is caught half-way through an animation.
    // tests/e2e/motion.spec.ts turns animations back on to check them.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: String(PORT), APP_URL: `http://localhost:${PORT}`, GOOGLE_MODE: 'mock' },
  },
});
