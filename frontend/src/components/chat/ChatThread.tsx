import { format, isToday, parseISO } from 'date-fns'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Question } from '../../api/types'
import { useChat, type ChatItem } from '../../context/ChatContext'
import { useUser } from '../../context/CurrentUser'
import { AnswerText, Sources } from '../QuestionCard'
import { BotIcon, SendIcon, ThumbDownIcon, ThumbUpIcon } from '../icons'
import { Avatar } from '../ui'
import { EndedFooter, SessionBar } from './Conversations'

export const SUGGESTIONS = [
  'How many holiday days do I have left?',
  'Can I take a taxi to the station?',
  'Combien de jours de télétravail par semaine ?',
  'Wanneer heb ik een doktersbriefje nodig?',
  'I lost my laptop, what should I do?',
  'Faut-il des devis pour un achat de 3 000 euros ?',
]

const WAITING = ['Looking in the Corvalis policies', 'Reading the matching rules', 'Writing a short answer']

function when(iso: string) {
  const d = parseISO(iso)
  return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM, HH:mm')
}

export function BotAvatar({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BotIcon size={size * 0.6} />
    </span>
  )
}

/** The conversation + composer. `compact` = inside the floating panel. */
export function ChatThread({ compact = false }: { compact?: boolean }) {
  const { items, loading, asking, ask, retry, current } = useChat()
  const user = useUser()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: items.length > 1 ? 'smooth' : 'auto' })
  }, [items, loading])

  const firstName = user.full_name.split(' ')[0]

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <SessionBar compact={compact} />
      <div ref={scrollRef} className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${compact ? 'px-3 py-4' : 'px-4 py-6 sm:px-6'}`} data-tour="my-questions">
        <AssistantBubble>
          <p>
            Hi {firstName} 👋 I answer questions about the <strong>Corvalis rules</strong>: leave, expenses, IT, onboarding and purchasing.
          </p>
          <p className="mt-1 text-slate-600">Ask in English, français or Nederlands. If the rules don’t cover it, I’ll pass your question to HR.</p>
        </AssistantBubble>

        {loading && <p className="text-center text-xs text-slate-400">Loading your conversation…</p>}

        {items.map((it) => (
          <ChatEntry key={it.kind === 'question' ? `q${it.q.id}` : it.id} item={it} onRetry={retry} />
        ))}
      </div>

      {current && !current.active ? (
        <EndedFooter />
      ) : (
        <Composer compact={compact} asking={asking} onSend={ask} showSuggestions={!compact || items.length === 0} />
      )}
    </div>
  )
}

function ChatEntry({ item, onRetry }: { item: ChatItem; onRetry: (id: string) => void }) {
  if (item.kind === 'pending') {
    return (
      <>
        <UserBubble text={item.text} />
        <Typing />
      </>
    )
  }
  if (item.kind === 'error') {
    return (
      <>
        <UserBubble text={item.text} />
        <AssistantBubble tone="error">
          <p>{item.message}</p>
          <button onClick={() => onRetry(item.id)} className="mt-1 text-sm font-medium text-rose-700 underline">Try again</button>
        </AssistantBubble>
      </>
    )
  }
  return <QuestionExchange q={item.q} />
}

function UserBubble({ text, time }: { text: string; time?: string }) {
  const user = useUser()
  return (
    <div className="animate-slide-up flex items-end justify-end gap-2">
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-white shadow-sm">{text}</div>
        {time && <p className="mt-1 text-right text-[11px] text-slate-400">{time}</p>}
      </div>
      <Avatar name={user.full_name} size="sm" />
    </div>
  )
}

function AssistantBubble({ children, tone = 'default', footer }: { children: React.ReactNode; tone?: 'default' | 'warn' | 'error'; footer?: React.ReactNode }) {
  const toneCls = {
    default: 'bg-white border-slate-200',
    warn: 'bg-amber-50 border-amber-200',
    error: 'bg-rose-50 border-rose-200 text-rose-900',
  }[tone]
  return (
    <div className="animate-slide-up flex items-start gap-2">
      <BotAvatar />
      <div className="max-w-[88%] min-w-0">
        <div className={`rounded-2xl rounded-tl-md border px-4 py-3 text-[15px] shadow-sm ${toneCls}`}>{children}</div>
        {footer}
      </div>
    </div>
  )
}

function Typing() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, WAITING.length - 1)), 1600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="animate-slide-up flex items-center gap-2" role="status" aria-live="polite">
      <BotAvatar />
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
        <span className="text-sm text-slate-500">{WAITING[step]}…</span>
      </div>
    </div>
  )
}

function QuestionExchange({ q }: { q: Question }) {
  const { feedback } = useChat()
  const [open, setOpen] = useState<number | null>(null)
  const toggle = (n: number) => setOpen((o) => (o === n ? null : n))
  const canEscalate = !q.ticket && (!q.answered || q.helpful === false)

  return (
    <div className="space-y-3">
      <UserBubble text={q.question} time={when(q.created_at)} />
      <AssistantBubble
        tone={q.answered ? 'default' : 'warn'}
        footer={
          q.answered && !q.ticket ? (
            <div className="mt-1 flex items-center gap-1 pl-1 text-[11px] text-slate-400">
              {q.helpful === null ? (
                <>
                  <span className="mr-1">Helpful?</span>
                  <IconButton label="Yes, helpful" onClick={() => feedback(q, true)}><ThumbUpIcon size={14} /></IconButton>
                  <IconButton label="Not helpful" onClick={() => feedback(q, false)}><ThumbDownIcon size={14} /></IconButton>
                </>
              ) : (
                <span>{q.helpful ? '👍 Thanks!' : '👎 Noted'}</span>
              )}
              {q.latency_ms != null && <span className="ml-2">· {(q.latency_ms / 1000).toFixed(1)} s</span>}
            </div>
          ) : null
        }
      >
        <AnswerText text={q.answer ?? ''} sources={q.sources} onCite={toggle} />
        {q.sources.length > 0 && <Sources sources={q.sources} open={open} onToggle={toggle} />}
        {canEscalate && <EscalateForm q={q} />}
        {q.ticket && !q.ticket.hr_answer && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-amber-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Sent to HR. Their answer will appear here.
          </p>
        )}
      </AssistantBubble>
      {q.ticket?.hr_answer && (
        <div className="animate-slide-up flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white" aria-hidden>HR</span>
          <div className="max-w-[88%]">
            <div className="rounded-2xl rounded-tl-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] shadow-sm">
              <p className="mb-0.5 text-xs font-semibold text-emerald-800">{q.ticket.answered_by_name ?? 'HR'} · HR</p>
              <p className="text-slate-800">{q.ticket.hr_answer}</p>
            </div>
            {q.ticket.answered_at && <p className="mt-1 pl-1 text-[11px] text-slate-400">{when(q.ticket.answered_at)}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
      {children}
    </button>
  )
}

function EscalateForm({ q }: { q: Question }) {
  const { escalate } = useChat()
  const [open, setOpen] = useState(!q.answered)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-medium text-blue-700 hover:underline">
        Ask HR instead →
      </button>
    )
  }
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await escalate(q, note)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Anything HR should know? (optional)"
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none" />
      {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={busy} onClick={send}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
          {busy ? 'Sending…' : 'Send to HR'}
        </button>
      </div>
    </div>
  )
}

function Composer({ compact, asking, onSend, showSuggestions }: { compact: boolean; asking: boolean; onSend: (t: string) => Promise<void>; showSuggestions: boolean }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-grow up to ~5 lines.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
    el.style.overflowY = el.scrollHeight > 128 ? 'auto' : 'hidden' // no scroll arrows on a short question
  }, [text])

  const send = (value = text) => {
    if (value.trim().length < 3 || asking) return
    setText('')
    void onSend(value)
    ref.current?.focus()
  }

  return (
    <div className="border-t border-slate-200 bg-white">
      {showSuggestions && (
        <div data-tour="ask-examples" className={`flex gap-2 overflow-x-auto pt-3 pb-1 ${compact ? 'px-3' : 'px-4 sm:px-6'}`}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" disabled={asking} onClick={() => send(s)}
              className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs whitespace-nowrap text-blue-800 transition hover:border-blue-400 hover:bg-blue-100 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}
      <form data-tour="ask-box" onSubmit={(e) => { e.preventDefault(); send() }}
        className={`flex items-end gap-2 ${compact ? 'p-3' : 'px-4 py-3 sm:px-6'}`}>
        <label htmlFor={compact ? 'chat-q-panel' : 'chat-q'} className="sr-only">Your question</label>
        <textarea
          id={compact ? 'chat-q-panel' : 'chat-q'}
          ref={ref}
          rows={1}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Ask about leave, expenses, IT…"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[15px] focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />
        <button type="submit" aria-label="Send question" disabled={asking || text.trim().length < 3}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none">
          <SendIcon size={18} />
        </button>
      </form>
      {!compact && <p className="px-6 pb-2 text-[11px] text-slate-400">Answers come only from the Corvalis policies, on this computer. Enter to send, Shift + Enter for a new line.</p>}
    </div>
  )
}
