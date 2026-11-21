import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setApiUser } from '../api/client'
import type { Employee } from '../api/types'

const STORAGE_KEY = 'corvalis.userId'

interface CurrentUserValue {
  user: Employee | null
  employees: Employee[]
  loading: boolean
  error: string | null
  switchUser: (id: number | null) => void
}

const Ctx = createContext<CurrentUserValue | null>(null)

function readStored(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [userId, setUserId] = useState<number | null>(readStored)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Employee[]>('/employees')
      .then(setEmployees)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const user = employees.find((e) => e.id === userId) ?? null
  // Keep the API header in sync before children fetch anything.
  setApiUser(user?.id ?? null)

  const switchUser = (id: number | null) => {
    setApiUser(id)
    setUserId(id)
    try {
      if (id == null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }

  return <Ctx.Provider value={{ user, employees, loading, error, switchUser }}>{children}</Ctx.Provider>
}

export function useCurrentUser() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCurrentUser outside provider')
  return v
}

/** For pages rendered only once a user is chosen. */
export function useUser(): Employee {
  const { user } = useCurrentUser()
  if (!user) throw new Error('No user selected')
  return user
}

export function canApprove(user: Employee) {
  return user.role === 'hr' || user.direct_reports > 0
}
