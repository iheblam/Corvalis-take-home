import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { api } from '../api/client'
import type { AssistantStats, Employee, LeaveRequest } from '../api/types'
import { canApprove, useCurrentUser, useUser } from '../context/CurrentUser'
import { DEPARTMENT_LABEL } from '../labels'
import { useGuide } from './Guide'
import { ApproveIcon, CalendarIcon, ChatIcon, HelpIcon, HomeIcon, InboxIcon, ListIcon, PeopleIcon, RequestIcon } from './icons'
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

/** Called after a question is sent to / answered by HR so the HR inbox counter refreshes. */
export const notifyTicketsChanged = () => window.dispatchEvent(new Event('tickets-changed'))

function useOpenTickets(user: Employee) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (user.role !== 'hr') return
    const load = () =>
      api<AssistantStats>('/assistant/stats')
        .then((s) => setCount(s.open_tickets))
        .catch(() => setCount(0))
    load()
    window.addEventListener('tickets-changed', load)
    return () => window.removeEventListener('tickets-changed', load)
  }, [user])
  return count
}

function UserSwitcher() {
  const { user, employees, switchUser } = useCurrentUser()
  const roleTag = (e: Employee) => (e.role === 'hr' ? ' · HR' : e.direct_reports > 0 ? ' · Manager' : '')
  return (
    <label className="flex items-center gap-2 rounded-lg text-sm" data-tour="user-switcher">
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
  const openTickets = useOpenTickets(user)

  const { openGuide } = useGuide()

  const links: { to: string; label: string; icon: ComponentType<{ size?: number }>; badge?: number }[] = [
    { to: '/', label: 'Overview', icon: HomeIcon },
    { to: '/request', label: 'Request leave', icon: RequestIcon },
    { to: '/my-requests', label: 'My requests', icon: ListIcon },
    { to: '/calendar', label: 'Team calendar', icon: CalendarIcon },
    { to: '/availability', label: "Who's available?", icon: PeopleIcon },
    { to: '/assistant', label: 'Ask the rules', icon: ChatIcon },
  ]
  if (canApprove(user)) links.push({ to: '/approvals', label: 'Approvals', icon: ApproveIcon, badge: pending })
  if (user.role === 'hr') links.push({ to: '/hr-inbox', label: 'HR inbox', icon: InboxIcon, badge: openTickets })

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
          <div className="flex items-center gap-3">
            <button
              onClick={() => openGuide()}
              data-tour="help"
              title="How to use the app"
              aria-label="Help: how to use the app"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <HelpIcon size={20} />
              <span className="hidden md:inline">Help</span>
            </button>
            <UserSwitcher />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              data-tour={`nav-${l.to === '/' ? 'overview' : l.to.slice(1)}`}
              end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                  isActive ? 'border-blue-400 text-white' : 'border-transparent text-slate-300 hover:text-white'
                }`
              }
            >
              <l.icon size={17} />
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
