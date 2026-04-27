import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Vite はフロント関連（index.html / public / src）を front/ 配下から拾う
  root: 'front',
  publicDir: 'public',
  plugins: [react(), tailwindcss()],
  appType: 'spa',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      // テストは task-app/test/ に集約。ソース実体は front/src と api/src にある。
      '@': resolve(__dirname, 'front/src'),
      '@api': resolve(__dirname, 'api/src'),
    },
  },
  test: {
    // vitest は task-app ルートを基準に動かす
    root: '.',
    environment: 'jsdom',
    setupFiles: ['./front/src/test-setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'front/src/**/*.{ts,tsx}',
        'api/src/domain/**/*.ts',
        'api/src/usecases/**/*.ts',
        'api/src/interface-adapters/**/*.ts',
        'api/src/framework/**/*.ts',
      ],
      exclude: [
        'front/src/generated/**',
        'front/src/**/*.d.ts',
        'front/src/test-setup.ts',
        'front/src/main.tsx',
        'front/src/vite-env.d.ts',
        // 型のみのファイル（実行コードなし）。v8 が 0/0 を 0% と表示するため除外。
        'front/src/types.ts',
        // インターフェース宣言ファイル（型のみ、実行コードなし）
        'api/src/domain/repositories/**',
        'api/src/domain/services/**',
        'api/src/domain/entities/User.ts',
        'api/src/domain/entities/Task.ts',
        'api/src/usecases/**/input-port.ts',
        'api/src/usecases/**/output-port.ts',
        // ランタイム接続層（DB / .env を直接触る）。E2E 領域なので単体カバレッジ除外
        'api/src/framework/prisma/**',
        // DI コンテナは prisma 実体に依存するためユニットでは検査しない
        'api/src/framework/di/**',
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
