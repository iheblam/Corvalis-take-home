import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { api, useApi } from '../api/client'
import type { LeaveRequest, LeaveType } from '../api/types'
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge, TypeBadge } from '../components/ui'
import { fmtRange, isoDate, plural } from '../labels'

type Tab = 'upcoming' | 'past' | 'all'

export function MyRequests() {
  const { data, error, loading, reload } = useApi<LeaveRequest[]>('/leave-requests?scope=mine')
  const [tab, setTab] = useState<Tab>('upcoming')
  const [actionError, setActionError] = useState<string | null>(null)
  const created = (useLocation().state as { created?: LeaveType } | null)?.created
  const today = isoDate(new Date())

  const rows = (data ?? []).filter((r) =>
    tab === 'all' ? true : tab === 'upcoming' ? r.end_date >= today : r.end_date < today,
  )
  if (tab === 'upcoming') rows.sort((a, b) => a.start_date.localeCompare(b.start_date))

  const cancel = async (r: LeaveRequest) => {
    if (!confirm(`Cancel this request (${fmtRange(r.start_date, r.end_date)})?`)) return
    setActionError(null)
    try {
      await api(`/leave-requests/${r.id}/cancel`, { method: 'POST' })
      reload()
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        title="My requests"
        action={<Link to="/request" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">+ Request leave</Link>}
      />
      {created && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          ✓ {created === 'sick' ? 'Your sick leave is recorded. Get well soon!' : 'Your request was sent to your manager.'}
        </div>
      )}
      {actionError && <div className="mb-4"><ErrorBox message={actionError} /></div>}

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:inline-flex">
        {(['upcoming', 'past', 'all'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-4 py-1.5 capitalize ${tab === t ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && rows.length === 0 && <Empty>No requests here.</Empty>}

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className="!p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={r.type} pending={r.status === 'pending'} />
                  <span className="font-medium">{fmtRange(r.start_date, r.end_date)}</span>
                  <span className="text-sm text-slate-500">· {plural(r.working_days, 'working day')}</span>
                </div>
                {r.comment && <p className="text-sm text-slate-600">“{r.comment}”</p>}
                {r.decided_by_name && (
                  <p className="text-sm text-slate-500">
                    {r.status === 'approved' ? 'Approved' : 'Refused'} by {r.decided_by_name}
                    {r.decision_note && <>: “{r.decision_note}”</>}
                  </p>
                )}
                {r.certificate_required && (
                  <p className={`text-sm ${r.certificate_received ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {r.certificate_received ? '✓ Medical certificate received by HR' : '⚠ Please send your medical certificate to HR'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                {r.can_cancel && <Button variant="ghost" className="!px-2 !py-1" onClick={() => cancel(r)}>Cancel</Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
