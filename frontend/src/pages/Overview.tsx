import { addDays, format, isWeekend, nextMonday, parseISO, startOfWeek } from 'date-fns'
import { useState } from 'react'
import { Link } from 'react-router'
import { useApi } from '../api/client'
import type { Calendar, CalendarAbsence, EmployeeBrief, LeaveRequest } from '../api/types'
import { BalanceCard } from '../components/BalanceCard'
import { Avatar, Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge, TypeBadge } from '../components/ui'
import { canApprove, useUser } from '../context/CurrentUser'
import { DEPARTMENT_LABEL, fmtRange, isoDate, plural } from '../labels'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Overview() {
  const user = useUser()
  const today = new Date()
  const todayIso = isoDate(today)
  const upcoming = useApi<LeaveRequest[]>(`/leave-requests?scope=mine&from=${todayIso}`)
  const toApprove = useApi<LeaveRequest[]>(canApprove(user) ? '/leave-requests?scope=to_approve' : null)

  const myNext = (upcoming.data ?? [])
    .filter((r) => r.status === 'approved' || r.status === 'pending')
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 4)

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.full_name.split(' ')[0]}`}
        subtitle={`${user.job_title} · ${DEPARTMENT_LABEL[user.department]}${user.manager_name ? ` · Your manager: ${user.manager_name}` : ''}`}
        action={
          <div className="flex gap-2">
            <Link to="/availability" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-white">
              Plan a site visit
            </Link>
            <Link to="/request" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
              + Request leave
            </Link>
          </div>
        }
      />

      {toApprove.data && toApprove.data.length > 0 && (
        <Link
          to="/approvals"
          data-tour="approvals-banner"
          className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 hover:bg-amber-100"
        >
          <span>
            <strong>{plural(toApprove.data.length, 'request')}</strong>{user.role === 'hr' ? '' : ' from your team'}{' '}
            {toApprove.data.length === 1 ? 'is' : 'are'} waiting for your decision.
          </span>
          <span className="font-medium">Review →</span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <div data-tour="balance"><BalanceCard employeeId={user.id} /></div>
          <div data-tour="upcoming">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-500">My upcoming leave</h2>
              <Link to="/my-requests" className="text-sm text-blue-600 hover:underline">See all</Link>
            </div>
            {upcoming.loading && <Loading />}
            {upcoming.error && <ErrorBox message={upcoming.error} />}
            {upcoming.data && myNext.length === 0 && <p className="mt-3 text-sm text-slate-500">Nothing planned yet.</p>}
            <ul className="mt-3 space-y-3">
              {myNext.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{fmtRange(r.start_date, r.end_date)}</p>
                    <div className="mt-1"><TypeBadge type={r.type} pending={r.status === 'pending'} /></div>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          </Card>
          </div>
        </div>
        <div className="lg:col-span-2" data-tour="out-of-office">
          <WhoIsAway userDepartment={user.department} today={today} />
        </div>
      </div>
    </>
  )
}

function WhoIsAway({ userDepartment, today }: { userDepartment: string; today: Date }) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const monday = isWeekend(today) ? nextMonday(today) : startOfWeek(today, { weekStartsOn: 1 })
  const friday = addDays(monday, 4)
  const dept = scope === 'mine' ? `&department=${userDepartment}` : ''
  const { data, error, loading } = useApi<Calendar>(`/calendar?start=${isoDate(monday)}&end=${isoDate(friday)}${dept}`)
  const todayIso = isoDate(today)

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Out of the office {isWeekend(today) ? 'next week' : 'this week'}
        </h2>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
          {(['mine', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1 ${scope === s ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
            >
              {s === 'mine' ? 'My department' : 'Everyone'}
            </button>
          ))}
        </div>
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <ul className="mt-4 divide-y divide-slate-100">
          {data.days.map((day) => {
            const away: { e: EmployeeBrief; a: CalendarAbsence }[] = []
            for (const row of data.rows)
              for (const a of row.absences)
                if (a.start_date <= day.date && a.end_date >= day.date) away.push({ e: row.employee, a })
            const isToday = day.date === todayIso
            return (
              <li key={day.date} className="flex gap-4 py-3">
                <div className={`w-20 shrink-0 text-sm ${isToday ? 'font-semibold text-blue-700' : 'text-slate-600'}`}>
                  {format(parseISO(day.date), 'EEEE')}
                  <span className="block text-xs text-slate-400">{isToday ? 'Today' : format(parseISO(day.date), 'd MMM')}</span>
                </div>
                <div className="flex flex-1 flex-wrap gap-2">
                  {day.holiday_name ? (
                    <span className="text-sm text-slate-500">🎉 {day.holiday_name}: office closed</span>
                  ) : away.length === 0 ? (
                    <span className="text-sm text-slate-400">Everyone is in</span>
                  ) : (
                    away.map(({ e, a }) => (
                      <span
                        key={`${e.id}-${a.id}`}
                        title={`${e.full_name} · ${a.status === 'pending' ? 'not approved yet' : 'approved'}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pr-2.5 pl-0.5 text-sm"
                      >
                        <Avatar name={e.full_name} size="sm" />
                        {e.full_name}
                        <TypeBadge type={a.type} pending={a.status === 'pending'} />
                      </span>
                    ))
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {data && data.rows.length === 0 && <Empty>No one in this group.</Empty>}
    </Card>
  )
}
