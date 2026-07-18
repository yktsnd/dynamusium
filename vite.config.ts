/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The new name is primary; the legacy variable keeps existing deployments
// working until the repository is renamed through the GitHub API.
export default defineConfig({
  base: process.env.DYNAMUSIUM_BASE ?? process.env.KINETIFLUX_BASE ?? '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
  },
});
