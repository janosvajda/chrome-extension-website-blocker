import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: 'line',
    timeout: 30_000,
    use: {
        trace: 'retain-on-failure',
    },
});
