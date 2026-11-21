import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useChat } from '../../context/ChatContext'
import { useUser } from '../../context/CurrentUser'
import { ChatIcon, CloseIcon, ExpandIcon, ListIcon } from '../icons'
import { BotAvatar, ChatThread } from './ChatThread'
import { ConversationList } from './Conversations'

const TEASER_KEY = 'corvalis.chatTeaser.dismissed'

function teaserDismissed() {
  try {
    return localStorage.getItem(TEASER_KEY) === '1'
  } catch {
    return false
  }
}

/** Floating "ask the rules" button, bottom right of every page, opening a chat panel. */
export function ChatWidget() {
  const { pathname } = useLocation()
  const { online, unreadHR } = useChat()
  const user = useUser()
  const [open, setOpen] = useState(false)
  const [teaser, setTeaser] = useState(false)
  const [view, setView] = useState<'chat' | 'list'>('chat')

  // Pop the little message after a moment, once, until the user dismisses it or opens the chat.
  useEffect(() => {
    if (teaserDismissed()) return
    const t = setTimeout(() => setTeaser(true), 1500)
    return () => clearTimeout(t)
  }, [])

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const dismissTeaser = () => {
    setTeaser(false)
    try {
      localStorage.setItem(TEASER_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const toggle = () => {
    dismissTeaser()
    setOpen((o) => !o)
  }

  if (pathname === '/assistant') return null // the full page is already open


  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Ask the rules"
          className="animate-pop-in fixed inset-0 z-40 flex flex-col overflow-hidden bg-white shadow-2xl sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[min(640px,calc(100vh-8rem))] sm:w-[400px] sm:rounded-2xl sm:ring-1 sm:ring-slate-200"
        >
          <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-white">
            <span className="rounded-full ring-2 ring-white/40"><BotAvatar size={36} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Corvalis assistant</p>
              <p className="flex items-center gap-1.5 text-xs text-blue-100">
                <span className={`h-2 w-2 rounded-full ${online === false ? 'bg-amber-300' : 'bg-emerald-300'}`} />
                {online === false ? 'Offline: questions go to HR' : 'Answers from the company rules · EN · FR · NL'}
              </p>
            </div>
            <button onClick={() => setView((v) => (v === 'list' ? 'chat' : 'list'))} aria-label="Conversations" title="Conversations"
              aria-pressed={view === 'list'}
              className={`relative rounded-md p-1.5 hover:bg-white/15 hover:text-white ${view === 'list' ? 'bg-white/20 text-white' : 'text-blue-100'}`}>
              <ListIcon size={18} />
              {unreadHR > 0 && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-rose-400" />}
            </button>
            <Link to="/assistant" onClick={() => setOpen(false)} aria-label="Open full page" title="Open full page"
              className="rounded-md p-1.5 text-blue-100 hover:bg-white/15 hover:text-white">
              <ExpandIcon size={18} />
            </Link>
            <button onClick={() => setOpen(false)} aria-label="Close the chat" className="rounded-md p-1.5 text-blue-100 hover:bg-white/15 hover:text-white">
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {view === 'list' ? <ConversationList onPicked={() => setView('chat')} /> : <ChatThread compact />}
          </div>
        </div>
      )}

      <div className={`fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6 ${open ? 'max-sm:hidden' : ''}`}>
        {teaser && !open && (
          <div className="animate-pop-in relative max-w-[260px] rounded-2xl rounded-br-md bg-white px-4 py-3 pr-8 text-sm shadow-xl ring-1 ring-slate-200">
            <button onClick={dismissTeaser} aria-label="Hide this message"
              className="absolute top-1.5 right-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <CloseIcon size={14} />
            </button>
            <p className="font-semibold text-slate-900">👋 Hi {user.full_name.split(' ')[0]}!</p>
            <p className="mt-0.5 text-slate-600">
              Questions about leave, expenses or IT? <button onClick={toggle} className="font-medium text-blue-600 hover:underline">Ask me</button>, in English, français or Nederlands.
            </p>
          </div>
        )}

        <button
          onClick={toggle}
          data-tour="chat-launcher"
          aria-label={open ? 'Close the assistant' : 'Ask the rules: open the assistant'}
          aria-expanded={open}
          className={`group relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-600/40 transition hover:scale-105 hover:shadow-xl focus:ring-4 focus:ring-blue-300 focus:outline-none ${teaser && !open ? 'animate-wiggle' : ''}`}
        >
          {!open && <span className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-30 [animation-duration:2.5s]" aria-hidden />}
          <span className="relative">{open ? <CloseIcon size={26} /> : <ChatIcon size={28} />}</span>
          {!open && (
            <span className={`absolute top-1 right-1 h-3.5 w-3.5 rounded-full ring-2 ring-white ${online === false ? 'bg-amber-400' : 'bg-emerald-400'}`} aria-hidden />
          )}
          {!open && unreadHR > 0 && (
            <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold ring-2 ring-white" title="Answers from HR">
              {unreadHR}
            </span>
          )}
          <span className="pointer-events-none absolute right-full mr-3 hidden rounded-lg bg-slate-900 px-2.5 py-1 text-xs whitespace-nowrap opacity-0 transition group-hover:opacity-100 sm:block">
            Ask the rules
          </span>
        </button>
      </div>
    </>
  )
}
