import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { TermsPage } from '@/pages/TermsPage'

afterEach(() => {
  cleanup()
})

describe('PrivacyPage', () => {
  it('プライバシーポリシーの主要見出しを表示する', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('プライバシーポリシー')).toBeInTheDocument()
    expect(screen.getByText('1. 収集する情報')).toBeInTheDocument()
    expect(screen.getByText('5. データの削除')).toBeInTheDocument()
    expect(screen.getByText('← 新規登録に戻る').closest('a')).toHaveAttribute('href', '/register')
  })
})

describe('TermsPage', () => {
  it('利用規約の主要見出しを表示する', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('利用規約')).toBeInTheDocument()
    expect(screen.getByText('1. サービスの提供')).toBeInTheDocument()
    expect(screen.getByText('4. 免責事項')).toBeInTheDocument()
  })
})
