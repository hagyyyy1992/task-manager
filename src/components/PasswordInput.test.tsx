import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PasswordInput } from './PasswordInput'

afterEach(() => {
  cleanup()
})

describe('PasswordInput', () => {
  it('label を表示し、初期は password タイプ', () => {
    render(<PasswordInput value="abc" onChange={() => {}} label="パスワード" />)
    expect(screen.getByText('パスワード')).toBeInTheDocument()
    const input = screen.getByDisplayValue('abc') as HTMLInputElement
    expect(input.type).toBe('password')
  })

  it('入力すると onChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(<PasswordInput value="" onChange={onChange} label="L" />)
    const input = screen.getByDisplayValue('') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'new' } })
    expect(onChange).toHaveBeenCalledWith('new')
  })

  it('表示トグルで type=text に切り替わる', () => {
    render(<PasswordInput value="abc" onChange={() => {}} label="L" />)
    const input = screen.getByDisplayValue('abc') as HTMLInputElement
    expect(input.type).toBe('password')

    const toggle = screen.getByTitle('パスワードを表示')
    fireEvent.click(toggle)
    expect(input.type).toBe('text')

    const toggle2 = screen.getByTitle('パスワードを隠す')
    fireEvent.click(toggle2)
    expect(input.type).toBe('password')
  })

  it('required / minLength / autoComplete 属性が反映される', () => {
    render(
      <PasswordInput
        value=""
        onChange={() => {}}
        label="L"
        required
        minLength={8}
        autoComplete="new-password"
      />,
    )
    const input = screen.getByDisplayValue('') as HTMLInputElement
    expect(input.required).toBe(true)
    expect(input.minLength).toBe(8)
    expect(input.autocomplete).toBe('new-password')
  })
})
