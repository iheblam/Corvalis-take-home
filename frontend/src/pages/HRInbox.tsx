import { useState } from 'react'
import { api, useApi } from '../api/client'
import type { AssistantStats, Question } from '../api/types'
import { notifyTicketsChanged } from '../components/Layout'
import { QuestionBody } from '../components/QuestionCard'
import { Button, Card, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'

export function HRInbox() {
  const [tab, setTab] = useState<'open' | 'answered'>('open')
  const tickets = useApi<Question[]>(`/hr-tickets?status=${tab}`)
  const stats = useApi<AssistantStats>('/assistant/stats')
  const s = stats.data
  const share = s && s.questions ? Math.round((100 * s.answered_by_assistant) / s.questions) : 0

  const done = () => {
    tickets.reload()
    stats.reload()
    notifyTicketsChanged()
  }

  return (
    <>
      <PageHeader title="HR inbox" subtitle="Questions the assistant could not settle. Your answer goes straight to the employee." />

      <div data-tour="hr-stats" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Questions asked', value: s?.questions },
          { label: 'Answered by the assistant', value: s ? `${s.answered_by_assistant} (${share}%)` : undefined },
          { label: 'Sent to HR', value: s?.sent_to_hr },
          { label: 'Waiting for you', value: s?.open_tickets, highlight: !!s?.open_tickets },
        ].map((k) => (
          <Card key={k.label} className={`!p-4 ${k.highlight ? 'border-amber-300 bg-amber-50' : ''}`}>
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold">{k.value ?? '…'}</p>
          </Card>
        ))}
      </div>

      <div className="mb-4 inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(['open', 'answered'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 ${tab === t ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
            {t === 'open' ? 'To answer' : 'Answered'}
          </button>
        ))}
      </div>

      {tickets.loading && !tickets.data && <Loading />}
      {tickets.error && <ErrorBox message={tickets.error} onRetry={tickets.reload} />}
      {tickets.data?.length === 0 && <Empty>{tab === 'open' ? '🎉 No questions waiting. Inbox zero!' : 'Nothing answered yet.'}</Empty>}
      <div className="space-y-3">
        {tickets.data?.map((q, i) => (
          <div key={q.id} data-tour={i === 0 ? 'hr-ticket' : undefined}>
            <Card className="!p-4">
              <QuestionBody q={q} showAsker />
              {q.ticket?.status === 'open' && <Reply ticketId={q.ticket.id} name={q.employee.full_name} onDone={done} />}
            </Card>
          </div>
        ))}
      </div>
    </>
  )
}

function Reply({ ticketId, name, onDone }: { ticketId: number; name: string; onDone: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(`/hr-tickets/${ticketId}/answer`, { method: 'POST', body: { answer: text.trim() } })
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <label className="text-sm font-medium text-slate-700">
        Your answer to {name.split(' ')[0]}
        <textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
      </label>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="mt-2 flex justify-end">
        <Button disabled={busy || text.trim().length < 2} onClick={send}>{busy ? 'Sending…' : 'Send answer'}</Button>
      </div>
    </div>
  )
}
