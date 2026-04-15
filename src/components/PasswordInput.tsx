import { useState } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  label: string
  required?: boolean
  minLength?: number
  autoFocus?: boolean
}

export function PasswordInput({ value, onChange, label, required, minLength, autoFocus }: Props) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          autoFocus={autoFocus}
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 pr-10 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm p-1"
          tabIndex={-1}
        >
          {show ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  )
}
