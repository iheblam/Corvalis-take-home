import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { canApprove, useUser } from '../context/CurrentUser'
import { TYPE_COLOR } from '../labels'
import {
  ApproveIcon, CalendarIcon, ChatIcon, CloseIcon, HelpIcon, HomeIcon, InboxIcon, ListIcon, PeopleIcon, RequestIcon, SparkIcon, UserSwitchIcon,
} from './icons'
import { TourOverlay } from './Tour'
import { SHORTCUTS, TOUR_STEPS, type TourStep } from './tourSteps'
import { Button, StatusBadge, TypeBadge } from './ui'

const SEEN_KEY = 'corvalis.guide.v1.seen'

interface Section {
  id: string
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  path?: string
  audience?: string
  intro: string
  steps?: string[]
  extra?: ReactNode
  tips?: string[]
}

const SECTIONS: Section[] = [
  {
    id: 'welcome',
    icon: SparkIcon,
    title: 'Welcome',
    intro:
      'This app replaces leave emails and the HR Excel file. Ask for leave, follow your requests, and see who is in or out, all in one place.',
  },
  {
    id: 'overview',
    icon: HomeIcon,
    title: 'Overview',
    path: '/',
    intro: 'Your start page. Everything important at a glance.',
    steps: [
      'My holidays: the big number is the days you have left this year. Days waiting for approval are already counted, so you never ask twice for the same days.',
      'A yellow note reminds you to use carried-over days before 31 March, otherwise they are lost.',
      'My upcoming leave: your next absences and whether they are approved.',
      'Out of the office this week: who is on holiday, sick or working from home, day by day. Switch between “My department” and “Everyone”.',
      'Managers: a yellow banner tells you when requests are waiting for you.',
    ],
  },
  {
    id: 'request',
    icon: RequestIcon,
    title: 'Request leave',
    path: '/request',
    intro: 'Ask for a holiday, working from home, unpaid leave, or report that you are sick.',
    steps: [
      'Choose the kind of absence by clicking a card.',
      'Pick the first and the last day.',
      'Read the check at the bottom. A red ⛔ message means the request is not possible as it is (change the dates). A yellow ℹ️ message is just information.',
      'Click “Send request”. Your manager is asked to approve it. Sick leave is recorded straight away.',
    ],
    extra: (
      <div className="grid gap-2 sm:grid-cols-2">
        {(['annual', 'remote', 'sick', 'unpaid'] as const).map((t) => (
          <div key={t} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">
            <TypeBadge type={t} />
            <span className="text-slate-600">
              {{ annual: 'Paid, from your 20 days.', remote: 'Max 2 days a week, never Tue/Thu.', sick: 'Certificate needed from day 2.', unpaid: 'Needs HR’s agreement.' }[t]}
            </span>
          </div>
        ))}
      </div>
    ),
    tips: [
      'Weekends and public holidays are never counted: a Monday–Friday week with a holiday costs 4 days.',
      'Your balance on the right shows how many days you still have.',
    ],
  },
  {
    id: 'my-requests',
    icon: ListIcon,
    title: 'My requests',
    path: '/my-requests',
    intro: 'Follow everything you asked for. Use the Upcoming / Past / All tabs.',
    extra: (
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-3"><StatusBadge status="pending" /> Your manager has not decided yet.</li>
        <li className="flex items-center gap-3"><StatusBadge status="approved" /> All good, enjoy!</li>
        <li className="flex items-center gap-3"><StatusBadge status="rejected" /> Your manager’s reason is shown below the request.</li>
        <li className="flex items-center gap-3"><StatusBadge status="cancelled" /> You cancelled it.</li>
      </ul>
    ),
    tips: [
      'Click “Cancel” to withdraw a request: any time while it waits, or before it starts once approved.',
      'For sick leave, you can see whether HR has received your medical certificate.',
    ],
  },
  {
    id: 'calendar',
    icon: CalendarIcon,
    title: 'Team calendar',
    path: '/calendar',
    intro: 'One shared view of who is away, month by month: no more asking around.',
    steps: [
      'Use ← and → to change month, “Today” to come back.',
      'Filter by department or office, or tick “Only people with an absence” for a short list.',
      'Hover a coloured box to see the details.',
    ],
    extra: (
      <div className="flex flex-wrap gap-3 text-sm text-slate-600">
        {(['annual', 'remote', 'sick', 'away', 'unpaid'] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5"><TypeBadge type={t} /></span>
        ))}
        <span className="flex items-center gap-1.5"><span className={`h-4 w-6 rounded ${TYPE_COLOR.annual.light}`} /> light = not approved yet</span>
        <span className="flex items-center gap-1.5"><span className="h-4 w-6 rounded bg-slate-200" /> weekend / public holiday</span>
      </div>
    ),
    tips: ['For privacy, colleagues see sick leave as “Away”. Only you, your manager and HR see the reason.'],
  },
  {
    id: 'availability',
    icon: PeopleIcon,
    title: "Who's available?",
    path: '/availability',
    intro: 'Planning a site visit or a meeting? Check who is in before you invite people.',
    steps: [
      'Pick a day (or click Today / Tomorrow / Next Monday).',
      'Choose a department or an office if you need to.',
      'Read the three columns: Available, Working from home (reachable but not on site), and Away with the day they come back.',
    ],
    tips: ['Requests that are not approved yet count as “Away”, to be on the safe side.', 'Type a name or a job title (e.g. “HVAC”) to find the right person.'],
  },
  {
    id: 'approvals',
    icon: ApproveIcon,
    title: 'Approvals',
    path: '/approvals',
    audience: 'Managers and HR',
    intro: 'Decide on your team’s requests. The number on the tab shows how many are waiting.',
    steps: [
      'Each request shows who, what, when and how many working days.',
      'The orange line tells you who else in the department is away that day, to avoid an empty team.',
      'Click “✓ Approve”, or “Refuse” and write a short reason: the employee will see it.',
      'HR also sees sick leave whose medical certificate is missing, and clicks “Certificate received” when it arrives.',
    ],
  },
  {
    id: 'assistant',
    icon: ChatIcon,
    title: 'Ask the rules',
    path: '/assistant',
    intro: 'A local AI assistant that answers questions about the Corvalis policies: leave, expenses, IT, onboarding and purchasing.',
    steps: [
      'Click the round blue chat button at the bottom right of any page, or open “Ask the rules” in the menu.',
      'Type your question in English, French or Dutch, then press Enter. You can also click one of the suggestions.',
      'The answer is short and comes only from the Corvalis policies. The small numbers [1] show where it comes from: click one to read the exact rule.',
      'Say if it helped with 👍 or 👎.',
      'Each conversation is saved. Use “+ New” to start another one and “End conversation” when you are done; old ones stay in the Conversations list.',
      'If the policies do not cover your question, or the answer did not help, click “Send to HR”. HR’s reply appears in the same conversation, in green.',
    ],
    tips: [
      'It also knows your own holiday balance: try “How many holiday days do I have left?”.',
      'It never invents a rule: when it does not know, it says so and offers to ask HR.',
      'Everything runs on Corvalis computers: your questions are not sent to any outside service.',
    ],
  },
  {
    id: 'hr-inbox',
    icon: InboxIcon,
    title: 'HR inbox',
    path: '/hr-inbox',
    audience: 'HR',
    intro: 'The questions the assistant could not settle. The number on the tab shows how many are waiting.',
    steps: [
      'The figures at the top show how many questions the assistant answered on its own, and how many came to HR.',
      'Each question shows who asked, the assistant’s attempt with its sources, and the employee’s note.',
      'Write your answer and click “Send answer”: the employee sees it under their question.',
    ],
  },
  {
    id: 'help',
    icon: HelpIcon,
    title: 'Help & switching user',
    intro: 'You can come back to this guide at any time.',
    steps: [
      'Click the ? “Help” button at the top right to reopen this guide.',
      'The name at the top right is who you are signed in as. In this demo you can switch to another colleague there, for example a manager to try approvals.',
    ],
    extra: (
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <UserSwitchIcon size={22} className="text-slate-500" /> In the real company app, you would be signed in automatically with your Corvalis account.
      </div>
    ),
  },
]

// ------------------------------------------------------------------ context

/** 'all' = full tour, a section id = that section, a list = those step ids. */
export type TourSpec = 'all' | string | string[]

const GuideCtx = createContext<{ openGuide: (section?: string) => void; startTour: (spec: TourSpec) => void } | null>(null)

export function useGuide() {
  const v = useContext(GuideCtx)
  if (!v) throw new Error('useGuide outside GuideProvider')
  return v
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}

function hasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true // storage blocked: don't pop the guide on every page load
  }
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const [section, setSection] = useState<string | null>(() => (hasSeen() ? null : 'welcome'))
  const [tour, setTour] = useState<TourStep[] | null>(null)
  const openGuide = useCallback((s = 'welcome') => setSection(s), [])

  const startTour = useCallback(
    (spec: TourSpec) => {
      const allowed = (st: TourStep) =>
        !st.only || (st.only === 'approver' ? canApprove(user) : user.role === 'hr')
      const steps = Array.isArray(spec)
        ? spec.map((id) => TOUR_STEPS.find((st) => st.id === id)).filter((st): st is TourStep => !!st)
        : TOUR_STEPS.filter((st) => !st.shortcutOnly && (spec === 'all' || st.section === spec))
      const visible = steps.filter(allowed)
      if (visible.length === 0) return
      markSeen()
      setSection(null)
      setTour(visible)
    },
    [user],
  )
  const close = () => {
    setSection(null)
    markSeen()
  }
  return (
    <GuideCtx.Provider value={{ openGuide, startTour }}>
      {children}
      {section && <GuideModal section={section} onSection={setSection} onClose={close} onTour={startTour} />}
      {tour && <TourOverlay key={tour.map((t) => t.id).join()} steps={tour} onClose={() => setTour(null)} />}
    </GuideCtx.Provider>
  )
}

// ------------------------------------------------------------------ modal

function GuideModal({ section, onSection, onClose, onTour }: {
  section: string
  onSection: (s: string) => void
  onClose: () => void
  onTour: (spec: TourSpec) => void
}) {
  const user = useUser()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const sections = SECTIONS.filter((s) => (s.id !== 'approvals' || canApprove(user)) && (s.id !== 'hr-inbox' || user.role === 'hr'))
  const index = Math.max(0, sections.findIndex((s) => s.id === section))
  const s = sections[index]
  const Icon = s.icon

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < sections.length - 1) onSection(sections[index + 1].id)
      if (e.key === 'ArrowLeft' && index > 0) onSection(sections[index - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, sections, onClose, onSection])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [section])

  const go = (path: string) => {
    navigate(path)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl outline-none sm:h-[min(640px,90vh)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <HelpIcon className="text-blue-600" /> How to use the app
          </p>
          <button onClick={onClose} aria-label="Close the guide" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Topic list: sidebar on desktop, scrollable strip on phones */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2 sm:w-56 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0 sm:p-3">
            {sections.map((t, i) => {
              const TIcon = t.icon
              const active = t.id === s.id
              return (
                <button
                  key={t.id}
                  onClick={() => onSection(t.id)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                    active ? 'bg-white font-medium text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  <TIcon size={18} className={active ? 'text-blue-600' : 'text-slate-400'} />
                  <span className="whitespace-nowrap">{t.title}</span>
                  <span className="ml-auto hidden text-xs text-slate-400 sm:inline">{i + 1}</span>
                </button>
              )
            })}
          </nav>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon size={26} />
              </span>
              <div>
                <h2 id="guide-title" className="text-xl font-semibold text-slate-900">{s.title}</h2>
                {s.audience && <p className="mt-0.5 text-xs font-medium tracking-wide text-amber-700 uppercase">For {s.audience}</p>}
                <p className="mt-1 text-slate-600">{s.intro}</p>
              </div>
            </div>

            {s.id === 'welcome' && (
              <div className="mt-6">
                <button onClick={() => onTour('all')}
                  className="flex w-full items-center gap-4 rounded-xl bg-blue-600 p-4 text-left text-white shadow-sm transition hover:bg-blue-700">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg">▶</span>
                  <span className="flex-1">
                    <span className="block font-semibold">Show me around</span>
                    <span className="block text-sm text-blue-100">A 2-minute guided tour: we point at each part of the screen.</span>
                  </span>
                </button>
                <p className="mt-6 mb-2 text-sm font-medium text-slate-500">Or show me how to…</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SHORTCUTS.filter((q) => !q.only || (q.only === 'hr' ? user.role === 'hr' : canApprove(user))).map((q) => {
                    const first = Array.isArray(q.steps) ? TOUR_STEPS.find((t) => t.id === q.steps[0])?.section : q.steps
                    const target = sections.find((x) => x.id === first)
                    const QIcon = target?.icon ?? HelpIcon
                    return (
                      <button key={q.want} onClick={() => onTour(q.steps)}
                        className="group flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm transition hover:border-blue-400 hover:bg-blue-50/50">
                        <QIcon size={18} className="shrink-0 text-blue-600" />
                        <span className="flex-1">{q.want}</span>
                        <span className="text-xs text-slate-400 group-hover:text-blue-600">Show me →</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {s.steps && (
              <ol className="mt-6 space-y-3">
                {s.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{i + 1}</span>
                    <span className="text-slate-700">{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {s.extra && <div className="mt-6">{s.extra}</div>}

            {s.tips && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-1 text-sm font-semibold text-amber-900">Good to know</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {s.tips.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            )}

            {s.id !== 'welcome' && (
              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => onTour(s.id)}>▶ Show me on screen</Button>
                {s.path && (
                  <Button variant="secondary" onClick={() => go(s.path!)}>
                    Go to {s.title}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${sections.length}`}>
            {sections.map((t, i) => (
              <span key={t.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-blue-600' : 'w-1.5 bg-slate-300'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && <Button variant="ghost" onClick={() => onSection(sections[index - 1].id)}>Back</Button>}
            {index < sections.length - 1 ? (
              <Button variant={index === 0 ? 'secondary' : 'primary'} onClick={() => onSection(sections[index + 1].id)}>{index === 0 ? 'Read the guide' : 'Next'}</Button>
            ) : (
              <Button onClick={onClose}>Got it, let’s start</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
