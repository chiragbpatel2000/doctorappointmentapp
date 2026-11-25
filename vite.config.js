import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}', 'server/api.js', 'server/schema.js'],
      exclude: ['src/main.jsx'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90, functions: 85, branches: 80, statements: 90 },
    },
  },
})
