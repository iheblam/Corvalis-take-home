import { useEffect, useRef, useState } from 'react'
import { api, useApi } from '../api/client'
import type { AssistantStatus, Question } from '../api/types'
import { notifyTicketsChanged } from '../components/Layout'
import { AnswerText, QuestionBody, Sources } from '../components/QuestionCard'
import { Button, Card, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'

const EXAMPLES = [
  'Can I expense a beer with a client?',
  'Combien de jours de télétravail par semaine ?',
  'Wanneer heb ik een doktersbriefje nodig?',
  'How many holiday days do I have left?',
  'Faut-il des devis pour un achat de 3 000 euros ?',
  'I lost my laptop, what should I do?',
]

const WAITING = ['Looking in the Corvalis policies…', 'Reading the rules that match…', 'Writing a short answer…']

export function Assistant() {
  const status = useApi<AssistantStatus>('/assistant/status')
  const history = useApi<Question[]>('/questions?scope=mine')
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<Question | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!asking) return
    setStep(0)
    const t = setInterval(() => setStep((s) => Math.min(s + 1, WAITING.length - 1)), 1400)
    return () => clearInterval(t)
  }, [asking])

  const submit = async (text = question) => {
    const q = text.trim()
    if (q.length < 3 || asking) return
    setAsking(true)
    setError(null)
    setLatest(null)
    try {
      const answer = await api<Question>('/assistant/ask', { method: 'POST', body: { question: q } })
      setLatest(answer)
      setQuestion('')
      history.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAsking(false)
    }
  }

  const offline = status.data && !(status.data.ollama && status.data.model_available)
  const older = (history.data ?? []).filter((q) => q.id !== latest?.id)

  return (
    <>
      <PageHeader
        title="Ask the rules"
        subtitle="Questions about leave, expenses, IT, onboarding or purchasing. In English, français or Nederlands."
      />

      {offline && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The assistant is offline right now (the local AI model is not running). You can still ask: your question will be saved and you can send it to HR.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div data-tour="ask-box">
            <Card>
              <form onSubmit={(e) => { e.preventDefault(); submit() }}>
                <label htmlFor="question" className="text-sm font-medium text-slate-700">Your question</label>
                <textarea
                  id="question"
                  ref={inputRef}
                  rows={2}
                  maxLength={500}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit()
                    }
                  }}
                  placeholder="e.g. Can I take a taxi to the station?"
                  className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">Enter to send · answers come only from the Corvalis policies</span>
                  <Button type="submit" disabled={asking || question.trim().length < 3}>{asking ? 'Asking…' : 'Ask'}</Button>
                </div>
              </form>

              <div className="mt-4" data-tour="ask-examples">
                <p className="mb-2 text-xs font-medium text-slate-500">Try one:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" disabled={asking} onClick={() => { setQuestion(ex); submit(ex) }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {asking && (
            <Card>
              <p className="flex items-center gap-3 text-slate-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                {WAITING[step]}
              </p>
            </Card>
          )}
          {error && <ErrorBox message={error} />}
          {latest && <LatestAnswer q={latest} onChange={(q) => { setLatest(q); history.reload() }} />}
        </div>

        <aside data-tour="my-questions">
          <h2 className="mb-3 font-semibold">My questions</h2>
          {history.loading && !history.data && <Loading />}
          {history.error && <ErrorBox message={history.error} onRetry={history.reload} />}
          {history.data && older.length === 0 && <Empty>Your questions and HR’s answers will appear here.</Empty>}
          <div className="space-y-3">
            {older.map((q) => (
              <Card key={q.id} className="!p-4">
                <QuestionBody q={q} />
                {!q.ticket && <SendToHR q={q} compact onSent={history.reload} />}
              </Card>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}

function LatestAnswer({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  const [open, setOpen] = useState<number | null>(null)
  const toggle = (n: number) => setOpen((o) => (o === n ? null : n))
  const feedback = async (helpful: boolean) => onChange(await api<Question>(`/questions/${q.id}/feedback`, { method: 'POST', body: { helpful } }))

  return (
    <Card className={q.answered ? '' : 'border-amber-200'}>
      <p className="text-sm text-slate-500">You asked</p>
      <p className="font-medium text-slate-900">{q.question}</p>
      <div className="mt-4">
        <AnswerText text={q.answer ?? ''} sources={q.sources} onCite={toggle} />
        <Sources sources={q.sources} open={open} onToggle={toggle} />
      </div>
      {q.answered && !q.ticket && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
          {q.helpful === null ? (
            <>
              Was this helpful?
              <Button variant="secondary" className="!px-3 !py-1" onClick={() => feedback(true)}>👍 Yes</Button>
              <Button variant="secondary" className="!px-3 !py-1" onClick={() => feedback(false)}>👎 No</Button>
            </>
          ) : (
            <span>{q.helpful ? 'Thanks for your feedback!' : 'Sorry about that. HR can answer you personally:'}</span>
          )}
          {q.latency_ms != null && <span className="ml-auto text-xs text-slate-400">answered in {(q.latency_ms / 1000).toFixed(1)} s</span>}
        </div>
      )}
      {(!q.answered || q.helpful === false) && !q.ticket && <SendToHR q={q} onSent={() => api<Question[]>('/questions?scope=mine').then((all) => onChange(all.find((x) => x.id === q.id) ?? q))} />}
      {q.ticket && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Sent to HR. Their answer will appear in “My questions”.
        </p>
      )}
    </Card>
  )
}

function SendToHR({ q, onSent, compact = false }: { q: Question; onSent: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(!compact)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (compact && q.answered && q.helpful !== false) return null
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm font-medium text-blue-600 hover:underline">
        Ask HR instead →
      </button>
    )
  }
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(`/questions/${q.id}/escalate`, { method: 'POST', body: { note: note.trim() || null } })
      notifyTicketsChanged()
      onSent()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-700">Send this question to HR</p>
      <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Anything HR should know? (optional)"
        className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
      {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        {compact && <Button variant="ghost" className="!px-3 !py-1" onClick={() => setOpen(false)}>Cancel</Button>}
        <Button className="!px-3 !py-1.5" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send to HR'}</Button>
      </div>
    </div>
  )
}
