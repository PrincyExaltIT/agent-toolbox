import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Each test file gets its own process — state.json and env-var mutations
    // can't leak across suites. Slower but correct for a CLI that writes to
    // the real filesystem under tmpdir().
    pool: 'forks',
    // Tests build real trees in os.tmpdir(); give them a generous budget.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/commands/completion.ts', 'src/commands/default.ts'],
    },
  },
});
