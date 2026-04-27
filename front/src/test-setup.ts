import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

// SUT のエラーパス (catch { console.error(e); alert(...) }) で出る期待されたログを抑制。
// 実害があるエラーはテスト失敗 or alert/state 検証で捕捉されるため、コンソールノイズだけ消す。
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})
