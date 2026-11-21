import { useState } from 'react'
import { BotAvatar, ChatThread } from '../components/chat/ChatThread'
import { ConversationList } from '../components/chat/Conversations'
import { ListIcon } from '../components/icons'
import { useChat } from '../context/ChatContext'

/** Full-page assistant: saved conversations on the left, the open one on the right. */
export function Assistant() {
  const { online, unreadHR } = useChat()
  // Phones have no room for the sidebar: the list replaces the chat while open.
  const [showList, setShowList] = useState(false)

  return (
    <section className="flex h-[calc(100vh-11rem)] min-h-[540px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-4 text-white sm:px-5">
        <span className="rounded-full ring-2 ring-white/40"><BotAvatar size={42} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">Ask the rules</h1>
          <p className="flex items-center gap-1.5 text-sm text-blue-100">
            <span className={`h-2 w-2 shrink-0 rounded-full ${online === false ? 'bg-amber-300' : 'bg-emerald-300'}`} />
            <span className="truncate">
              {online === false
                ? 'The local AI is offline: your questions are kept and can be sent to HR'
                : 'Leave · expenses · IT · onboarding · purchasing · English, français, Nederlands'}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowList((v) => !v)}
          aria-pressed={showList}
          aria-label="Conversations"
          className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm md:hidden ${showList ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
        >
          <ListIcon size={18} />
          {unreadHR > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-400 ring-2 ring-indigo-600" />}
        </button>
        <p className="hidden max-w-56 text-right text-xs text-blue-100 lg:block">Runs on Corvalis computers: nothing is sent outside.</p>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
        <aside className={`min-h-0 border-r border-slate-200 bg-white md:block ${showList ? 'block' : 'hidden'}`}>
          <ConversationList onPicked={() => setShowList(false)} />
        </aside>
        {/* min-w-0: the scrolling suggestion row must not stretch the column */}
        <div className={`min-h-0 min-w-0 md:block ${showList ? 'hidden' : 'block'}`}>
          <ChatThread />
        </div>
      </div>
    </section>
  )
}
