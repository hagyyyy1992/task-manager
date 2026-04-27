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
      include: ['src/**/*.{ts,tsx}', 'api/index.ts', 'api/routes/**/*.ts', 'api/lib/db.ts'],
      exclude: [
        'src/generated/**',
        'src/**/*.d.ts',
        'src/test-setup.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // 型のみのファイル（実行コードなし）。v8 が 0/0 を 0% と表示するため除外。
        'src/types.ts',
        '**/*.test.{ts,tsx}',
      ],
      // 達成値からおよそ -2% の余裕を残してロック。CI 揺れによる即時破断を避けるため。
      thresholds: {
        statements: 97,
        branches: 93,
        functions: 98,
        lines: 97,
      },
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
