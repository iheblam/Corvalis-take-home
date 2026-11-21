import { format, isThisYear, isToday, isYesterday, parseISO } from 'date-fns'
import { useState } from 'react'
import { useChat } from '../../context/ChatContext'

function day(iso: string) {
  const d = parseISO(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy')
}

/** Saved conversations, newest activity first. */
export function ConversationList({ onPicked }: { onPicked?: () => void }) {
  const { sessions, current, openSession, newSession, unreadFor } = useChat()

  return (
    <div className="flex h-full min-h-0 flex-col" data-tour="chat-sessions">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        <p className="text-sm font-semibold text-slate-900">Conversations</p>
        <button
          type="button"
          onClick={async () => { await newSession(); onPicked?.() }}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
        >
          + New conversation
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {sessions.length === 0 && <li className="px-2 py-6 text-center text-sm text-slate-400">No conversation yet. Ask your first question!</li>}
        {sessions.map((s) => {
          const unread = unreadFor(s)
          const selected = current?.id === s.id
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={async () => { await openSession(s.id); onPicked?.() }}
                aria-current={selected ? 'true' : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left transition ${selected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-100'}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-slate-300'}`} title={s.active ? 'Active' : 'Ended'} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{s.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      {day(s.last_activity_at)} · {s.questions} question{s.questions === 1 ? '' : 's'}
                      {s.waiting_for_hr > 0 && <span className="rounded bg-amber-100 px-1.5 text-amber-800">Waiting for HR</span>}
                      {unread > 0 ? (
                        <span className="rounded bg-rose-500 px-1.5 font-semibold text-white">New HR reply</span>
                      ) : s.hr_replies > 0 ? (
                        <span className="rounded bg-emerald-100 px-1.5 text-emerald-800">HR replied</span>
                      ) : null}
                    </span>
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Title + status of the open conversation, with New / End. */
export function SessionBar({ compact = false }: { compact?: boolean }) {
  const { current, items, newSession, endSession } = useChat()
  const [confirming, setConfirming] = useState(false)
  const hasMessages = items.some((it) => it.kind === 'question')

  return (
    <div className={`flex items-center gap-2 border-b border-slate-200 bg-white ${compact ? 'px-3 py-2' : 'px-4 py-2.5 sm:px-6'}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{current?.title ?? 'New conversation'}</p>
        <p className="text-[11px] text-slate-500">
          {!current
            ? 'Starts with your first question'
            : current.active
              ? `Active · started ${format(parseISO(current.created_at), 'd MMM, HH:mm')}`
              : `Ended ${format(parseISO(current.ended_at!), 'd MMM, HH:mm')} · saved`}
        </p>
      </div>
      {confirming ? (
        <span className="flex items-center gap-1 text-xs">
          <span className="text-slate-600">End it?</span>
          <button type="button" onClick={async () => { await endSession(); setConfirming(false) }}
            className="rounded-md bg-rose-600 px-2 py-1 font-medium text-white hover:bg-rose-700">End</button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">Keep</button>
        </span>
      ) : (
        <>
          {current?.active && hasMessages && (
            <button type="button" onClick={() => setConfirming(true)} data-tour="chat-end"
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 ring-inset hover:bg-slate-50">
              End conversation
            </button>
          )}
          {(hasMessages || !current?.active) && (
            <button type="button" onClick={() => void newSession()}
              className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
              + New
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** Replaces the input box when the open conversation has ended. */
export function EndedFooter() {
  const { current, newSession } = useChat()
  if (!current?.ended_at) return null
  return (
    <div className="border-t border-slate-200 bg-white px-4 py-4 text-center">
      <p className="text-sm text-slate-600">
        This conversation ended on {format(parseISO(current.ended_at), 'd MMMM')}. It is saved, and HR replies still arrive here.
      </p>
      <button type="button" onClick={() => void newSession()}
        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
        Start a new conversation
      </button>
    </div>
  )
}
