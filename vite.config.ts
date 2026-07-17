/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// KINETIFLUX_BASE lets the GitHub Pages workflow build for a repository
// subpath (e.g. "/kinetiflux/") without affecting local development.
export default defineConfig({
  base: process.env.KINETIFLUX_BASE ?? '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
  },
});
