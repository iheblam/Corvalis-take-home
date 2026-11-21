import { addDays, isWeekend } from 'date-fns'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { LeavePreview, LeaveRequestIn, LeaveType } from '../api/types'
import { BalanceCard } from '../components/BalanceCard'
import { Button, Card, ErrorBox, PageHeader } from '../components/ui'
import { useUser } from '../context/CurrentUser'
import { fmtDayYear, isoDate, plural, TYPE_COLOR, TYPE_LABEL } from '../labels'

const TYPES: { type: LeaveType; help: string }[] = [
  { type: 'annual', help: 'Paid holiday, taken from your 20 days. Your manager approves it.' },
  { type: 'remote', help: 'Up to 2 days a week, not on Tuesday or Thursday (team days).' },
  { type: 'sick', help: 'Report it on the first day. Recorded straight away.' },
  { type: 'unpaid', help: 'Not taken from your holidays. Needs HR’s agreement.' },
]

function nextWorkday(d: Date) {
  let x = d
  while (isWeekend(x)) x = addDays(x, 1)
  return x
}

export function RequestLeave() {
  const user = useUser()
  const navigate = useNavigate()
  const [type, setType] = useState<LeaveType>('annual')
  const [start, setStart] = useState(isoDate(nextWorkday(addDays(new Date(), 1))))
  const [end, setEnd] = useState(start)
  const [comment, setComment] = useState('')
  const [preview, setPreview] = useState<LeavePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const body: LeaveRequestIn = { type, start_date: start, end_date: end, comment: comment.trim() || null }

  // Live check while the form changes (debounced).
  useEffect(() => {
    if (!start || !end) return
    const t = setTimeout(() => {
      api<LeavePreview>('/leave-requests/preview', { method: 'POST', body: { type, start_date: start, end_date: end } })
        .then((p) => {
          setPreview(p)
          setPreviewError(null)
        })
        .catch((e: Error) => setPreviewError(e.message))
    }, 250)
    return () => clearTimeout(t)
  }, [type, start, end])

  const onStart = (v: string) => {
    setStart(v)
    if (!end || v > end) setEnd(v)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      await api('/leave-requests', { method: 'POST', body })
      navigate('/my-requests', { state: { created: type } })
    } catch (err) {
      setSaveError((err as Error).message)
      setSaving(false)
    }
  }

  const cta = type === 'sick' ? 'Report sick leave' : 'Send request'

  return (
    <>
      <PageHeader title="Request leave" subtitle="Choose what kind of absence, then the dates. We check the rules for you." />
      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={submit} className="space-y-6 lg:col-span-2">
          <div data-tour="leave-types"><Card>
            <h2 className="mb-3 font-semibold">1. What kind of absence?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map((t) => (
                <label
                  key={t.type}
                  data-tour={`type-${t.type}`}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                    type === t.type ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input type="radio" name="type" className="sr-only" checked={type === t.type} onChange={() => setType(t.type)} />
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${TYPE_COLOR[t.type].dot}`} />
                  <span>
                    <span className="block font-medium">{TYPE_LABEL[t.type]}</span>
                    <span className="block text-sm text-slate-600">{t.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card></div>

          <div data-tour="leave-dates"><Card>
            <h2 className="mb-3 font-semibold">2. When?</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                First day
                <input type="date" required value={start} onChange={(e) => onStart(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 font-normal shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Last day
                <input type="date" required value={end} min={start} onChange={(e) => setEnd(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 font-normal shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
              </label>
            </div>
            <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-slate-700">
              Note for your manager <span className="font-normal text-slate-400">(optional)</span>
              <textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder={type === 'annual' ? 'e.g. Family holiday' : ''}
                className="rounded-lg border border-slate-300 px-3 py-2 font-normal shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
            </label>
          </Card></div>

          <div data-tour="leave-check"><Card className={preview && !preview.ok ? 'border-rose-200' : ''}>
            <h2 className="mb-3 font-semibold">3. Check and send</h2>
            {previewError && <ErrorBox message={previewError} />}
            {preview && (
              <div className="space-y-3">
                <p className="text-slate-700">
                  {TYPE_LABEL[type]} from <strong>{fmtDayYear(start)}</strong> to <strong>{fmtDayYear(end)}</strong>:{' '}
                  <strong>{plural(preview.working_days, 'working day')}</strong>
                  {type === 'annual' && preview.working_days > 0 && ' taken from your holidays'}.
                  <span className="block text-sm text-slate-500">Weekends and public holidays are not counted.</span>
                </p>
                {preview.errors.map((m) => (
                  <p key={m} className="flex gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800"><span aria-hidden>⛔</span>{m}</p>
                ))}
                {preview.warnings.map((m) => (
                  <p key={m} className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"><span aria-hidden>ℹ️</span>{m}</p>
                ))}
              </div>
            )}
            {saveError && <div className="mt-3"><ErrorBox message={saveError} /></div>}
            <div className="mt-5 flex items-center gap-3">
              <Button type="submit" disabled={!preview?.ok || saving}>{saving ? 'Sending…' : cta}</Button>
              {type !== 'sick' && user.manager_name && (
                <span className="text-sm text-slate-500">{user.manager_name} will be asked to approve it.</span>
              )}
            </div>
          </Card></div>
        </form>

        <aside className="space-y-6">
          <div data-tour="leave-balance"><BalanceCard employeeId={user.id} year={Number(start.slice(0, 4)) || undefined} /></div>
          <Card>
            <h2 className="text-sm font-medium text-slate-500">Good to know</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              <li>20 days of paid holiday per year.</li>
              <li>Unused days can be carried over until 31 March.</li>
              <li>Sick: tell your manager before 9:00; a medical certificate is needed from day 2.</li>
              <li>Working from home: max 2 days a week, never Tuesday or Thursday.</li>
              <li>The office is closed on the 10 Belgian public holidays.</li>
            </ul>
            <p className="mt-3 text-xs text-slate-400">From the Corvalis leave policy.</p>
          </Card>
        </aside>
      </div>
    </>
  )
}
