import { createContext } from 'react'
import type { User } from './auth'

export interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, termsAgreed: boolean) => Promise<void>
  logout: () => void
  deleteAccount: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)
