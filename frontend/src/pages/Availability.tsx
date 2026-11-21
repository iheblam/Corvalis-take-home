import { addDays, format, isWeekend, nextMonday, parseISO } from 'date-fns'
import { useState } from 'react'
import { useApi } from '../api/client'
import type { Availability as AvailabilityData, Department, EmployeeBrief, Office } from '../api/types'
import { Avatar, Card, ErrorBox, Loading, PageHeader, Select, TypeBadge } from '../components/ui'
import { useUser } from '../context/CurrentUser'
import { DEPARTMENT_LABEL, fmtDay, isoDate, OFFICE_LABEL } from '../labels'

function nextWorkday(d: Date) {
  let x = d
  while (isWeekend(x)) x = addDays(x, 1)
  return x
}

export function Availability() {
  const user = useUser()
  const today = new Date()
  const [day, setDay] = useState(isoDate(nextWorkday(today)))
  const [department, setDepartment] = useState<Department | ''>(user.department)
  const [office, setOffice] = useState<Office | ''>('')
  const [search, setSearch] = useState('')

  const params = new URLSearchParams({ date: day })
  if (department) params.set('department', department)
  if (office) params.set('office', office)
  const { data, error, loading, reload } = useApi<AvailabilityData>(day ? `/availability?${params}` : null)

  const match = (e: EmployeeBrief) =>
    !search || `${e.full_name} ${e.job_title}`.toLowerCase().includes(search.toLowerCase())

  const shortcuts = [
    { label: 'Today', d: today },
    { label: 'Tomorrow', d: addDays(today, 1) },
    { label: 'Next Monday', d: nextMonday(today) },
  ]

  return (
    <>
      <PageHeader title="Who's available?" subtitle="Planning a site visit or a meeting? Pick a day to see who is in." />

      <Card className="mb-6 !p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Day
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 font-normal shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
          </label>
          <div className="flex gap-1 pb-0.5">
            {shortcuts.map((s) => (
              <button key={s.label} onClick={() => setDay(isoDate(s.d))}
                className={`rounded-full px-3 py-1.5 text-sm ${day === isoDate(s.d) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <Select label="Department" value={department} onChange={setDepartment}
            options={[{ value: '', label: 'All departments' }, ...Object.entries(DEPARTMENT_LABEL).map(([v, l]) => ({ value: v as Department, label: l }))]} />
          <Select label="Office" value={office} onChange={setOffice}
            options={[{ value: '', label: 'Both offices' }, ...Object.entries(OFFICE_LABEL).map(([v, l]) => ({ value: v as Office, label: l }))]} />
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
            Find someone
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or job title"
              className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 font-normal shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
          </label>
        </div>
      </Card>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <>
          <h2 className="mb-3 text-lg font-semibold">{format(parseISO(data.date), 'EEEE d MMMM yyyy')}</h2>
          {!data.is_working_day && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              {data.holiday_name ? `${data.holiday_name}: the office is closed.` : 'This is a weekend day.'}
            </div>
          )}
          <div className={`grid gap-6 md:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
            <Column title="Available" tone="emerald" people={data.available.filter(match)} hint="In the office or on site." />
            <Column title="Working from home" tone="violet" people={data.remote.filter(match)} hint="Reachable, but not on site." />
            <Card className="!p-0">
              <ColumnHeader title="Away" tone="rose" count={data.absent.filter((a) => match(a.employee)).length} hint="Pending requests are included." />
              <ul className="divide-y divide-slate-100">
                {data.absent.filter((a) => match(a.employee)).map((a) => (
                  <li key={a.employee.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={a.employee.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.employee.full_name}</p>
                      <p className="text-xs text-slate-500">{a.back_on ? `Back ${fmtDay(a.back_on)}` : ''}</p>
                    </div>
                    <TypeBadge type={a.type} pending={a.status === 'pending'} />
                  </li>
                ))}
                {data.absent.filter((a) => match(a.employee)).length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-slate-400">Nobody</li>
                )}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  )
}

const TONE = {
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-400',
  rose: 'bg-rose-500',
}

function ColumnHeader({ title, tone, count, hint }: { title: string; tone: keyof typeof TONE; count: number; hint: string }) {
  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <p className="flex items-center gap-2 font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${TONE[tone]}`} />
        {title}
        <span className="ml-auto rounded-full bg-slate-100 px-2 text-sm font-medium text-slate-700">{count}</span>
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
    </div>
  )
}

function Column({ title, tone, people, hint }: { title: string; tone: keyof typeof TONE; people: EmployeeBrief[]; hint: string }) {
  return (
    <Card className="!p-0">
      <ColumnHeader title={title} tone={tone} count={people.length} hint={hint} />
      <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
        {people.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={e.full_name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{e.full_name}</p>
              <p className="truncate text-xs text-slate-500">{e.job_title} · {OFFICE_LABEL[e.office]}</p>
            </div>
          </li>
        ))}
        {people.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Nobody</li>}
      </ul>
    </Card>
  )
}
