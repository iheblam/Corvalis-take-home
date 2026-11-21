import { useState } from 'react'
import { api, useApi } from '../api/client'
import type { Availability, LeaveRequest } from '../api/types'
import { notifyApprovalsChanged } from '../components/Layout'
import { Avatar, Button, Card, Empty, ErrorBox, Loading, PageHeader, TypeBadge } from '../components/ui'
import { useUser } from '../context/CurrentUser'
import { DEPARTMENT_LABEL, fmtDay, fmtRange, plural } from '../labels'

export function Approvals() {
  const user = useUser()
  const todo = useApi<LeaveRequest[]>('/leave-requests?scope=to_approve')
  const sick = useApi<LeaveRequest[]>(user.role === 'hr' ? '/leave-requests?scope=all&type=sick&status=approved' : null)
  const missingCertificates = (sick.data ?? []).filter((r) => r.certificate_required && !r.certificate_received)

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={user.role === 'hr' ? 'Requests from everyone, and sick leave to follow up.' : 'Requests from the people in your team.'}
      />

      <div className="flex flex-col">
      <section>
        <h2 className="mb-3 font-semibold">
          Waiting for your decision {todo.data && todo.data.length > 0 && <span className="text-slate-400">({todo.data.length})</span>}
        </h2>
        {todo.loading && <Loading />}
        {todo.error && <ErrorBox message={todo.error} onRetry={todo.reload} />}
        {todo.data?.length === 0 && <Empty>🎉 Nothing to approve. You're all caught up.</Empty>}
        <div className="space-y-3">
          {todo.data?.map((r) => (
            <ApprovalCard key={r.id} request={r} onDone={() => { todo.reload(); notifyApprovalsChanged() }} />
          ))}
        </div>
      </section>

      {user.role === 'hr' && (
        <section className="order-first mb-10">
          <h2 className="mb-1 font-semibold">Medical certificates to collect</h2>
          <p className="mb-3 text-sm text-slate-600">Sick leave of more than one day needs a certificate from the second day.</p>
          {sick.loading && <Loading />}
          {sick.error && <ErrorBox message={sick.error} />}
          {sick.data && missingCertificates.length === 0 && <Empty>All certificates received.</Empty>}
          <div className="space-y-2">
            {missingCertificates.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 !p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={r.employee.full_name} />
                  <div>
                    <p className="font-medium">{r.employee.full_name}</p>
                    <p className="text-sm text-slate-500">Sick {fmtRange(r.start_date, r.end_date)} · {plural(r.working_days, 'day')}</p>
                  </div>
                </div>
                <Button variant="secondary" onClick={() => api(`/leave-requests/${r.id}/certificate`, { method: 'POST' }).then(sick.reload)}>
                  ✓ Certificate received
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
      </div>
    </>
  )
}

function ApprovalCard({ request: r, onDone }: { request: LeaveRequest; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Who else from the same department is away on the first day: helps decide.
  const others = useApi<Availability>(`/availability?date=${r.start_date}&department=${r.employee.department}`)
  const alsoAway = (others.data?.absent ?? []).filter((a) => a.employee.id !== r.employee.id)

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true)
    setError(null)
    try {
      await api(`/leave-requests/${r.id}/${action}`, { method: 'POST', body: { note: note.trim() || null } })
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <Avatar name={r.employee.full_name} />
          <div className="space-y-1">
            <p className="font-medium">
              {r.employee.full_name}{' '}
              <span className="font-normal text-slate-500">· {r.employee.job_title}, {DEPARTMENT_LABEL[r.employee.department]}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={r.type} />
              <span className="font-medium">{fmtRange(r.start_date, r.end_date)}</span>
              <span className="text-sm text-slate-500">· {plural(r.working_days, 'working day')}</span>
            </div>
            {r.comment && <p className="text-sm text-slate-600">“{r.comment}”</p>}
            {alsoAway.length > 0 && (
              <p className="text-sm text-amber-700">
                Also away on {fmtDay(r.start_date)}: {alsoAway.map((a) => a.employee.full_name).join(', ')}
              </p>
            )}
            <p className="text-xs text-slate-400">Asked on {fmtDay(r.created_at.slice(0, 10))}</p>
          </div>
        </div>
        {!rejecting && (
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy} onClick={() => setRejecting(true)}>Refuse</Button>
            <Button variant="success" disabled={busy} onClick={() => decide('approve')}>✓ Approve</Button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
            Why are you refusing? (shown to {r.employee.full_name.split(' ')[0]})
            <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
              placeholder="e.g. Client deadline that week, can you move it?"
              className="rounded-lg border border-slate-300 px-3 py-2 font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
            <Button variant="danger" disabled={busy || !note.trim()} onClick={() => decide('reject')}>Refuse request</Button>
          </div>
        </div>
      )}
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
    </Card>
  )
}
