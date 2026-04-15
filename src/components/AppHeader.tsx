import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

interface Props {
  children?: React.ReactNode
}

export function AppHeader({ children }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-lg font-bold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300">
          Task Manager
        </Link>
        <div className="flex items-center gap-2">
          {user && (
            <>
              <Link
                to="/account"
                className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm"
              >
                {user.name}
              </Link>
              <button
                onClick={() => { logout(); navigate('/login') }}
                className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-red-500 text-sm"
              >
                ログアウト
              </button>
            </>
          )}
          {children}
        </div>
      </div>
    </header>
  )
}
