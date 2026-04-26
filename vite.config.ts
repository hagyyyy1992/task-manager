import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  appType: 'spa',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'db.ts', 'handler.ts', 'api-server.ts'],
      exclude: [
        'src/generated/**',
        'src/**/*.d.ts',
        'src/test-setup.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        '**/*.test.{ts,tsx}',
      ],
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3456',
    },
    watch: {
      ignored: ['**/data/**'],
    },
  },
})
