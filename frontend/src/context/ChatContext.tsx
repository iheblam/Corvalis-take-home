import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { AssistantStatus, ChatSession, ChatSessionDetail, Question } from '../api/types'
import { useUser } from './CurrentUser'

/**
 * Saved conversations with the assistant, shared by the floating chat panel and the "Ask the rules" page.
 * One conversation is open at a time; ended ones stay readable and still receive HR replies.
 */
export type ChatItem =
  | { kind: 'question'; q: Question }
  | { kind: 'pending'; id: string; text: string }
  | { kind: 'error'; id: string; text: string; message: string }

interface ChatValue {
  sessions: ChatSession[]
  current: ChatSession | null // null = a fresh conversation, created on the first question
  items: ChatItem[]
  loading: boolean
  asking: boolean
  online: boolean | null
  unreadHR: number
  unreadFor: (s: ChatSession) => number
  ask: (text: string) => Promise<void>
  retry: (id: string) => void
  feedback: (q: Question, helpful: boolean) => Promise<void>
  escalate: (q: Question, note: string) => Promise<void>
  openSession: (id: number) => Promise<void>
  newSession: () => Promise<void>
  endSession: () => Promise<void>
}

const Ctx = createContext<ChatValue | null>(null)

function seenKey(userId: number) {
  return `corvalis.hrSeen.${userId}`
}
function readSeen(userId: number): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) ?? '{}')
  } catch {
    return {}
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [items, setItems] = useState<ChatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [seen, setSeen] = useState<Record<number, number>>(() => readSeen(user.id))

  const markSeen = useCallback(
    (s: ChatSession) => {
      setSeen((prev) => {
        if ((prev[s.id] ?? 0) >= s.hr_replies) return prev
        const next = { ...prev, [s.id]: s.hr_replies }
        try {
          localStorage.setItem(seenKey(user.id), JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [user.id],
  )

  const refreshSessions = useCallback(async () => {
    const list = await api<ChatSession[]>('/chat-sessions')
    setSessions(list)
    return list
  }, [])

  const openSession = useCallback(
    async (id: number) => {
      setLoading(true)
      try {
        const detail = await api<ChatSessionDetail>(`/chat-sessions/${id}`)
        setCurrentId(id)
        setItems(detail.messages.map((q) => ({ kind: 'question', q })))
        markSeen(detail)
      } finally {
        setLoading(false)
      }
    },
    [markSeen],
  )

  // First load: reopen the active conversation, otherwise start fresh.
  useEffect(() => {
    refreshSessions()
      .then((list) => {
        const active = list.find((s) => s.active)
        if (active) return openSession(active.id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    api<AssistantStatus>('/assistant/status')
      .then((s) => setOnline(s.ollama && s.model_available))
      .catch(() => setOnline(false))
    // Pick up HR replies when another page (the HR inbox) answers.
    const onTickets = () => void refreshSessions()
    window.addEventListener('tickets-changed', onTickets)
    return () => window.removeEventListener('tickets-changed', onTickets)
  }, [refreshSessions, openSession])

  const current = useMemo(() => sessions.find((s) => s.id === currentId) ?? null, [sessions, currentId])

  const replace = useCallback((q: Question) => {
    setItems((all) => all.map((it) => (it.kind === 'question' && it.q.id === q.id ? { kind: 'question', q } : it)))
  }, [])

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim()
      if (question.length < 3) return
      const id = `p${Date.now()}`
      setAsking(true)
      setItems((all) => [...all.filter((it) => it.kind !== 'error'), { kind: 'pending', id, text: question }])
      try {
        const q = await api<Question>('/assistant/ask', {
          method: 'POST',
          body: { question, session_id: current?.active ? current.id : null },
        })
        setCurrentId(q.session_id)
        setItems((all) => all.map((it) => (it.kind === 'pending' && it.id === id ? { kind: 'question', q } : it)))
        await refreshSessions()
      } catch (e) {
        setItems((all) =>
          all.map((it) => (it.kind === 'pending' && it.id === id ? { kind: 'error', id, text: question, message: (e as Error).message } : it)),
        )
      } finally {
        setAsking(false)
      }
    },
    [current, refreshSessions],
  )

  const retry = useCallback(
    (id: string) => {
      const failed = items.find((it) => it.kind === 'error' && it.id === id)
      if (failed && failed.kind === 'error') {
        setItems((all) => all.filter((it) => !(it.kind === 'error' && it.id === id)))
        void ask(failed.text)
      }
    },
    [items, ask],
  )

  const feedback = useCallback(
    async (q: Question, helpful: boolean) => replace(await api<Question>(`/questions/${q.id}/feedback`, { method: 'POST', body: { helpful } })),
    [replace],
  )

  const escalate = useCallback(
    async (q: Question, note: string) => {
      replace(await api<Question>(`/questions/${q.id}/escalate`, { method: 'POST', body: { note: note.trim() || null } }))
      window.dispatchEvent(new Event('tickets-changed'))
    },
    [replace],
  )

  const newSession = useCallback(async () => {
    const s = await api<ChatSession>('/chat-sessions', { method: 'POST' })
    setCurrentId(s.id)
    setItems([])
    await refreshSessions()
  }, [refreshSessions])

  const endSession = useCallback(async () => {
    if (!current?.active) return
    await api<ChatSession>(`/chat-sessions/${current.id}/end`, { method: 'POST' })
    await refreshSessions()
  }, [current, refreshSessions])

  const unreadFor = useCallback((s: ChatSession) => Math.max(0, s.hr_replies - (seen[s.id] ?? 0)), [seen])
  const unreadHR = sessions.reduce((n, s) => n + unreadFor(s), 0)

  return (
    <Ctx.Provider
      value={{ sessions, current, items, loading, asking, online, unreadHR, unreadFor, ask, retry, feedback, escalate, openSession, newSession, endSession }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useChat() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useChat outside ChatProvider')
  return v
}
