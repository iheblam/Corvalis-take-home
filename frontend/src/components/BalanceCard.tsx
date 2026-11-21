import { format, parseISO } from 'date-fns'
import { useApi } from '../api/client'
import type { Balance } from '../api/types'
import { Card, ErrorBox, Loading } from './ui'

export function BalanceCard({ employeeId, year, title = 'My holidays' }: { employeeId: number; year?: number; title?: string }) {
  const { data: b, error, loading } = useApi<Balance>(
    `/employees/${employeeId}/balance${year ? `?year=${year}` : ''}`,
  )

  return (
    <Card>
      <h2 className="text-sm font-medium text-slate-500">
        {title} {b && <span className="text-slate-400">· {b.year}</span>}
      </h2>
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {b && <BalanceBody b={b} />}
    </Card>
  )
}

function BalanceBody({ b }: { b: Balance }) {
  const total = b.annual_days + b.carried_over_days
  const carryLive = b.carried_over_days - b.carried_over_used - b.carried_over_expired
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(total, 1)) * 100))}%`

  return (
    <>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
        {b.available_days}
        <span className="ml-2 text-base font-normal text-slate-500">days left</span>
      </p>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="bg-sky-500" style={{ width: pct(b.taken_days) }} />
        <div className="bg-sky-200" style={{ width: pct(b.pending_days) }} />
        <div className="bg-slate-300" style={{ width: pct(b.carried_over_expired) }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full bg-sky-500" />Taken</dt>
        <dd className="text-right font-medium">{b.taken_days}</dd>
        <dt className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full bg-sky-200" />Waiting for approval</dt>
        <dd className="text-right font-medium">{b.pending_days}</dd>
        <dt className="text-slate-600">Yearly allowance</dt>
        <dd className="text-right font-medium">{b.annual_days}</dd>
        {b.carried_over_days > 0 && (
          <>
            <dt className="text-slate-600">Carried over from {b.year - 1}</dt>
            <dd className="text-right font-medium">{b.carried_over_days}</dd>
          </>
        )}
      </dl>
      {carryLive > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Use your {carryLive} carried-over day{carryLive > 1 ? 's' : ''} before{' '}
          {format(parseISO(b.carry_over_deadline), 'd MMMM')}, or they are lost.
        </p>
      )}
      {b.carried_over_expired > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {b.carried_over_expired} carried-over day(s) expired on {format(parseISO(b.carry_over_deadline), 'd MMMM')}.
        </p>
      )}
    </>
  )
}
