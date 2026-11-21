import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { api } from '../api/client'
import type { Employee, LeaveRequest } from '../api/types'
import { canApprove, useCurrentUser, useUser } from '../context/CurrentUser'
import { DEPARTMENT_LABEL } from '../labels'
import { Avatar } from './ui'

/** Pages call this after approving/rejecting so the nav counter refreshes. */
export const notifyApprovalsChanged = () => window.dispatchEvent(new Event('approvals-changed'))

function usePendingCount(user: Employee) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!canApprove(user)) return
    const load = () =>
      api<LeaveRequest[]>('/leave-requests?scope=to_approve')
        .then((r) => setCount(r.length))
        .catch(() => setCount(0))
    load()
    window.addEventListener('approvals-changed', load)
    return () => window.removeEventListener('approvals-changed', load)
  }, [user])
  return count
}

function UserSwitcher() {
  const { user, employees, switchUser } = useCurrentUser()
  const roleTag = (e: Employee) => (e.role === 'hr' ? ' · HR' : e.direct_reports > 0 ? ' · Manager' : '')
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-400 lg:inline">Signed in as</span>
      {user && <Avatar name={user.full_name} size="sm" />}
      <select
        aria-label="Switch user (demo)"
        className="max-w-48 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
        value={user?.id ?? ''}
        onChange={(e) => switchUser(e.target.value ? Number(e.target.value) : null)}
      >
        {(Object.keys(DEPARTMENT_LABEL) as (keyof typeof DEPARTMENT_LABEL)[]).map((d) => (
          <optgroup key={d} label={DEPARTMENT_LABEL[d]}>
            {employees
              .filter((e) => e.department === d)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {roleTag(e)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const user = useUser()
  const pending = usePendingCount(user)

  const links: { to: string; label: string; badge?: number }[] = [
    { to: '/', label: 'Overview' },
    { to: '/request', label: 'Request leave' },
    { to: '/my-requests', label: 'My requests' },
    { to: '/calendar', label: 'Team calendar' },
    { to: '/availability', label: "Who's available?" },
  ]
  if (canApprove(user)) links.push({ to: '/approvals', label: 'Approvals', badge: pending })

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold">C</span>
            <span className="font-semibold">
              Corvalis <span className="hidden font-normal text-slate-400 sm:inline">· Leave & availability</span>
            </span>
          </NavLink>
          <UserSwitcher />
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                  isActive ? 'border-blue-400 text-white' : 'border-transparent text-slate-300 hover:text-white'
                }`
              }
            >
              {l.label}
              {!!l.badge && (
                <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">{l.badge}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
