import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}', 'convex/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    // Bound worker concurrency: parallel jsdom + edge-runtime workers
    // exhaust this machine and fail to spawn (flaky infrastructure
    // failures, not test failures).
    // maxWorkers pinned to 1: full-suite runs at higher worker counts
    // produce fork-spawn flakes on this machine (exit -1, no assertion
    // failures). Determinism over speed for the MVP.
    maxWorkers: 1,
  },
})
