import { addMonths, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { Fragment, useState } from 'react'
import { useApi } from '../api/client'
import type { Calendar, CalendarAbsence, Department, Office, VisibleType } from '../api/types'
import { Avatar, Button, Card, Empty, ErrorBox, Loading, PageHeader, Select } from '../components/ui'
import { useUser } from '../context/CurrentUser'
import { DEPARTMENT_LABEL, isoDate, OFFICE_LABEL, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL } from '../labels'

const LEGEND: VisibleType[] = ['annual', 'remote', 'sick', 'away', 'unpaid']

export function TeamCalendar() {
  const user = useUser()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [department, setDepartment] = useState<Department | ''>(user.department)
  const [office, setOffice] = useState<Office | ''>('')
  const [onlyAway, setOnlyAway] = useState(false)

  const params = new URLSearchParams({ start: isoDate(month), end: isoDate(endOfMonth(month)) })
  if (department) params.set('department', department)
  if (office) params.set('office', office)
  const { data, error, loading, reload } = useApi<Calendar>(`/calendar?${params}`)

  const todayIso = isoDate(new Date())
  const rows = (data?.rows ?? []).filter((r) => !onlyAway || r.absences.length > 0)

  const absenceOn = (absences: CalendarAbsence[], day: string) =>
    absences.find((a) => a.start_date <= day && a.end_date >= day)

  return (
    <>
      <PageHeader title="Team calendar" subtitle="Who is away, and when. Light colours are not approved yet." />

      <Card className="mb-4 !p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-1">
            <Button variant="secondary" className="!px-3" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>←</Button>
            <span className="w-36 text-center font-semibold">{format(month, 'MMMM yyyy')}</span>
            <Button variant="secondary" className="!px-3" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>→</Button>
            <Button variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          </div>
          <Select label="Department" value={department} onChange={setDepartment}
            options={[{ value: '', label: 'All departments' }, ...Object.entries(DEPARTMENT_LABEL).map(([v, l]) => ({ value: v as Department, label: l }))]} />
          <Select label="Office" value={office} onChange={setOffice}
            options={[{ value: '', label: 'Both offices' }, ...Object.entries(OFFICE_LABEL).map(([v, l]) => ({ value: v as Office, label: l }))]} />
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyAway} onChange={(e) => setOnlyAway(e.target.checked)} className="h-4 w-4 rounded" />
            Only people with an absence
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
          {LEGEND.map((t) => (
            <span key={t} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${TYPE_COLOR[t].dot}`} />{TYPE_LABEL[t]}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-slate-200" />Weekend / public holiday</span>
        </div>
      </Card>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && rows.length === 0 && <Empty>Nobody to show with these filters.</Empty>}

      {data && rows.length > 0 && (
        <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-48 border-b border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-600">
                  {rows.length} people
                </th>
                {data.days.map((d) => (
                  <th key={d.date} title={d.holiday_name ?? undefined}
                    className={`min-w-7 border-b border-slate-200 px-0 py-1 text-center font-normal ${
                      d.date === todayIso ? 'bg-blue-600 text-white' : d.is_working_day ? 'text-slate-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                    <span className="block text-[10px] uppercase">{format(parseISO(d.date), 'EEEEE')}</span>
                    <span className="block font-semibold">{format(parseISO(d.date), 'd')}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const newGroup = i === 0 || rows[i - 1].employee.department !== row.employee.department
                return (
                  <Fragment key={row.employee.id}>
                    {newGroup && !department && (
                      <tr>
                        <td colSpan={data.days.length + 1} className="bg-slate-50 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                          {DEPARTMENT_LABEL[row.employee.department]}
                        </td>
                      </tr>
                    )}
                    <tr className={row.employee.id === user.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}>
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-inherit px-3 py-1.5">
                        <div className="flex items-center gap-2 bg-inherit">
                          <Avatar name={row.employee.full_name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{row.employee.full_name}</p>
                            <p className="truncate text-[11px] text-slate-500">{OFFICE_LABEL[row.employee.office]}</p>
                          </div>
                        </div>
                      </td>
                      {data.days.map((d) => {
                        const a = absenceOn(row.absences, d.date)
                        const off = !d.is_working_day
                        const show = a && !off
                        return (
                          <td key={d.date} className={`border-b border-l border-slate-100 p-0.5 ${off ? 'bg-slate-100' : ''}`}
                            title={show ? `${row.employee.full_name}: ${TYPE_LABEL[a.type]} (${STATUS_LABEL[a.status]})` : d.holiday_name ?? undefined}>
                            {show && (
                              <div className={`h-6 rounded ${a.status === 'pending' ? `${TYPE_COLOR[a.type].light} opacity-80` : TYPE_COLOR[a.type].dot}`} />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
