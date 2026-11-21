import { BotAvatar, ChatThread } from '../components/chat/ChatThread'
import { ConversationList } from '../components/chat/Conversations'
import { useChat } from '../context/ChatContext'

/** Full-page assistant: saved conversations on the left, the open one on the right. */
export function Assistant() {
  const { online } = useChat()

  return (
    <section className="flex h-[calc(100vh-11rem)] min-h-[540px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white">
        <span className="rounded-full ring-2 ring-white/40"><BotAvatar size={42} /></span>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Ask the rules</h1>
          <p className="flex items-center gap-1.5 text-sm text-blue-100">
            <span className={`h-2 w-2 rounded-full ${online === false ? 'bg-amber-300' : 'bg-emerald-300'}`} />
            {online === false
              ? 'The local AI is offline: your questions are kept and can be sent to HR'
              : 'Leave · expenses · IT · onboarding · purchasing · English, français, Nederlands'}
          </p>
        </div>
        <p className="hidden max-w-56 text-right text-xs text-blue-100 lg:block">Runs on Corvalis computers: nothing is sent outside.</p>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
        <aside className="hidden min-h-0 border-r border-slate-200 bg-white md:block">
          <ConversationList />
        </aside>
        {/* min-w-0: the scrolling suggestion row must not stretch the column */}
        <div className="min-h-0 min-w-0">
          <ChatThread />
        </div>
      </div>
    </section>
  )
}
