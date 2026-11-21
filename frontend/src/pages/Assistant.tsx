import { BotAvatar, ChatThread } from '../components/chat/ChatThread'
import { Card } from '../components/ui'
import { useChat } from '../context/ChatContext'

/** Full-page version of the assistant (same conversation as the floating chat). */
export function Assistant() {
  const { online, items } = useChat()
  const asked = items.filter((it) => it.kind === 'question').length
  const withHR = items.filter((it) => it.kind === 'question' && it.q.ticket).length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="flex h-[calc(100vh-11rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white">
          <span className="rounded-full ring-2 ring-white/40"><BotAvatar size={42} /></span>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Ask the rules</h1>
            <p className="flex items-center gap-1.5 text-sm text-blue-100">
              <span className={`h-2 w-2 rounded-full ${online === false ? 'bg-amber-300' : 'bg-emerald-300'}`} />
              {online === false
                ? 'The local AI is offline: your questions are kept and can be sent to HR'
                : 'Answers from the Corvalis policies · English · français · Nederlands'}
            </p>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <ChatThread />
        </div>
      </section>

      <aside className="space-y-4">
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">What I know</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li>🏖️ Leave, sick leave, remote work</li>
            <li>💶 Expenses, meals, travel, mileage</li>
            <li>🔐 Passwords, VPN, lost devices</li>
            <li>👋 Onboarding, buddy, probation</li>
            <li>🛒 Purchases, quotes, subscriptions</li>
            <li>📅 Your own holiday balance</li>
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm text-slate-600">
            <li>I look up the rule in the Corvalis policies.</li>
            <li>I answer in your language and show the source: click <span className="rounded bg-blue-100 px-1 text-xs font-semibold text-blue-700">1</span> to read it.</li>
            <li>Not covered? Send it to HR in one click; their answer appears in this conversation.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">Runs on Corvalis computers: nothing is sent outside.</p>
        </Card>
        {asked > 0 && (
          <Card className="!p-4">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{asked}</strong> question{asked > 1 ? 's' : ''} asked
              {withHR > 0 && <> · <strong className="text-slate-900">{withHR}</strong> sent to HR</>}
            </p>
          </Card>
        )}
      </aside>
    </div>
  )
}
