import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { AssistantStatus, Question } from '../api/types'

/** One conversation, shared by the floating chat panel and the "Ask the rules" page. */
export type ChatItem =
  | { kind: 'question'; q: Question }
  | { kind: 'pending'; id: string; text: string }
  | { kind: 'error'; id: string; text: string; message: string }

interface ChatValue {
  items: ChatItem[]
  loading: boolean
  asking: boolean
  online: boolean | null
  ask: (text: string) => Promise<void>
  retry: (id: string) => void
  feedback: (q: Question, helpful: boolean) => Promise<void>
  escalate: (q: Question, note: string) => Promise<void>
}

const Ctx = createContext<ChatValue | null>(null)
const HISTORY = 20

export function ChatProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    api<Question[]>(`/questions?scope=mine&limit=${HISTORY}`)
      .then((qs) => setItems(qs.reverse().map((q) => ({ kind: 'question', q }))))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
    api<AssistantStatus>('/assistant/status')
      .then((s) => setOnline(s.ollama && s.model_available))
      .catch(() => setOnline(false))
  }, [])

  const replace = useCallback((q: Question) => {
    setItems((all) => all.map((it) => (it.kind === 'question' && it.q.id === q.id ? { kind: 'question', q } : it)))
  }, [])

  const ask = useCallback(async (text: string) => {
    const question = text.trim()
    if (question.length < 3) return
    const id = `p${Date.now()}`
    setAsking(true)
    setItems((all) => [...all.filter((it) => it.kind !== 'error'), { kind: 'pending', id, text: question }])
    try {
      const q = await api<Question>('/assistant/ask', { method: 'POST', body: { question } })
      setItems((all) => all.map((it) => (it.kind === 'pending' && it.id === id ? { kind: 'question', q } : it)))
    } catch (e) {
      setItems((all) =>
        all.map((it) => (it.kind === 'pending' && it.id === id ? { kind: 'error', id, text: question, message: (e as Error).message } : it)),
      )
    } finally {
      setAsking(false)
    }
  }, [])

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

  return (
    <Ctx.Provider value={{ items, loading, asking, online, ask, retry, feedback, escalate }}>{children}</Ctx.Provider>
  )
}

export function useChat() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useChat outside ChatProvider')
  return v
}
