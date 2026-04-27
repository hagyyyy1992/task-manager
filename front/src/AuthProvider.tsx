import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { User } from './auth'
import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  deleteAccount as apiDeleteAccount,
} from './auth'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiLogin(email, password)
    setUser(u)
  }, [])

  const register = useCallback(
    async (email: string, password: string, name: string, termsAgreed: boolean) => {
      const u = await apiRegister(email, password, name, termsAgreed)
      setUser(u)
    },
    [],
  )

  const logout = useCallback(() => {
    apiLogout()
    setUser(null)
  }, [])

  const deleteAccount = useCallback(async (currentPassword: string) => {
    await apiDeleteAccount(currentPassword)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}
