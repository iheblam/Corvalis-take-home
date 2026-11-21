// Spotlight tour: each step points at a real element marked with data-tour="<target>".

export interface TourStep {
  id: string
  section: string // matches a guide section id
  path: string // page to open before highlighting
  target: string // data-tour value
  title: string
  body: string
  only?: 'approver' | 'hr'
  /** Not part of the section / full tour; only reached from an "I want to…" shortcut. */
  shortcutOnly?: boolean
}

export const TOUR_STEPS: TourStep[] = [
  // Overview
  { id: 'ov-nav', section: 'overview', path: '/', target: 'nav-overview', title: 'Overview',
    body: 'Your start page. Click here any time to come back to it.' },
  { id: 'ov-balance', section: 'overview', path: '/', target: 'balance', title: 'Your holidays',
    body: 'The big number is how many days you have left this year. Days waiting for approval are already counted.' },
  { id: 'ov-upcoming', section: 'overview', path: '/', target: 'upcoming', title: 'Your upcoming leave',
    body: 'Your next absences, and whether they are approved yet.' },
  { id: 'ov-out', section: 'overview', path: '/', target: 'out-of-office', title: 'Who is out this week',
    body: 'Holiday, sick or working from home, day by day. Switch between your department and everyone.' },
  { id: 'ov-banner', section: 'overview', path: '/', target: 'approvals-banner', only: 'approver', title: 'Requests waiting for you',
    body: 'When your team asks for leave, this banner appears. Click it to decide.' },

  // Request leave
  { id: 'rq-nav', section: 'request', path: '/request', target: 'nav-request', title: 'Request leave',
    body: 'Holiday, working from home, unpaid leave or sick leave: everything starts here.' },
  { id: 'rq-types', section: 'request', path: '/request', target: 'leave-types', title: '1. Choose the kind of absence',
    body: 'Click one card. Each card says the rule that applies to it.' },
  { id: 'rq-sick', section: 'request', path: '/request', target: 'type-sick', shortcutOnly: true, title: 'Sick? Choose this card',
    body: 'Then pick the first day. Sick leave is recorded straight away. From the second day, send a medical certificate to HR.' },
  { id: 'rq-remote', section: 'request', path: '/request', target: 'type-remote', shortcutOnly: true, title: 'Working from home? Choose this card',
    body: 'Up to 2 days a week, never on Tuesday or Thursday (team days at the office). Your manager approves it.' },
  { id: 'rq-dates', section: 'request', path: '/request', target: 'leave-dates', title: '2. Pick your dates',
    body: 'First and last day. Weekends and public holidays are not counted.' },
  { id: 'rq-check', section: 'request', path: '/request', target: 'leave-check', title: '3. Check, then send',
    body: 'A red ⛔ line means you must change something. A yellow ℹ️ line is just information. Then click Send: your manager is asked to approve.' },
  { id: 'rq-balance', section: 'request', path: '/request', target: 'leave-balance', title: 'Your balance, always in view',
    body: 'See how many days you have left while you choose your dates.' },

  // My requests
  { id: 'mr-nav', section: 'my-requests', path: '/my-requests', target: 'nav-my-requests', title: 'My requests',
    body: 'Follow everything you asked for.' },
  { id: 'mr-tabs', section: 'my-requests', path: '/my-requests', target: 'request-tabs', title: 'Upcoming, past or all',
    body: 'Switch between what is coming, what is done, or everything.' },
  { id: 'mr-list', section: 'my-requests', path: '/my-requests', target: 'request-list', title: 'Status of each request',
    body: 'Waiting for approval, Approved, or Refused with your manager’s reason. Click “Cancel” to withdraw a request.' },

  // Team calendar
  { id: 'cal-nav', section: 'calendar', path: '/calendar', target: 'nav-calendar', title: 'Team calendar',
    body: 'One shared view of who is away, month by month.' },
  { id: 'cal-filters', section: 'calendar', path: '/calendar', target: 'calendar-filters', title: 'Choose what you see',
    body: 'Change month with ← →, filter by department or office, or show only people with an absence.' },
  { id: 'cal-legend', section: 'calendar', path: '/calendar', target: 'calendar-legend', title: 'What the colours mean',
    body: 'Each colour is a kind of absence. A light colour = not approved yet. Grey = weekend or public holiday.' },
  { id: 'cal-grid', section: 'calendar', path: '/calendar', target: 'calendar-grid', title: 'One row per person',
    body: 'One column per day. Move your mouse over a coloured box to see the details.' },

  // Who's available
  { id: 'av-nav', section: 'availability', path: '/availability', target: 'nav-availability', title: "Who's available?",
    body: 'Planning a site visit or a meeting? Check who is in first.' },
  { id: 'av-filters', section: 'availability', path: '/availability', target: 'availability-filters', title: 'Pick a day',
    body: 'Or click Today / Tomorrow / Next Monday. Narrow it down by department, office or name.' },
  { id: 'av-columns', section: 'availability', path: '/availability', target: 'availability-columns', title: 'Who is in, who is not',
    body: 'Available, working from home (reachable but not on site), and away, with the day they come back.' },

  // Approvals
  { id: 'ap-nav', section: 'approvals', path: '/approvals', target: 'nav-approvals', only: 'approver', title: 'Approvals',
    body: 'The number shows how many requests are waiting for your decision.' },
  { id: 'ap-card', section: 'approvals', path: '/approvals', target: 'approval-card', only: 'approver', title: 'Decide in one click',
    body: 'Approve, or Refuse with a short reason the employee will see. The orange line shows who else is away that day.' },
  { id: 'ap-certs', section: 'approvals', path: '/approvals', target: 'certificates', only: 'hr', title: 'Medical certificates',
    body: 'HR: sick leave longer than one day needs a certificate. Tick it when it arrives.' },

  // Ask the rules (P1)
  { id: 'as-launcher', section: 'assistant', path: '/', target: 'chat-launcher', title: 'Ask from any page',
    body: 'This button is on every page. Click it to ask a question about the Corvalis rules without leaving what you are doing.' },
  { id: 'as-nav', section: 'assistant', path: '/assistant', target: 'nav-assistant', title: 'Ask the rules',
    body: 'Questions about leave, expenses, IT, onboarding or purchasing, answered from the Corvalis policies.' },
  { id: 'as-sessions', section: 'assistant', path: '/assistant', target: 'chat-sessions', title: 'Saved conversations',
    body: 'Every conversation is saved. Start a new one, reopen an old one, and see at a glance where HR has replied.' },
  { id: 'as-history', section: 'assistant', path: '/assistant', target: 'my-questions', title: 'Your conversation',
    body: 'Your questions on the right, the answers on the left with their source, and HR’s replies in green when you sent a question to HR.' },
  { id: 'as-examples', section: 'assistant', path: '/assistant', target: 'ask-examples', title: 'Not sure what to ask?',
    body: 'Click a suggestion to try it. You can even ask how many holiday days you have left.' },
  { id: 'as-box', section: 'assistant', path: '/assistant', target: 'ask-box', title: 'Type your question',
    body: 'In English, French or Dutch, then press Enter. Click a small number [1] in the answer to read the exact rule.' },

  // HR inbox
  { id: 'hr-nav', section: 'hr-inbox', path: '/hr-inbox', target: 'nav-hr-inbox', only: 'hr', title: 'HR inbox',
    body: 'Questions the assistant could not settle. The number shows how many wait for HR.' },
  { id: 'hr-stats', section: 'hr-inbox', path: '/hr-inbox', target: 'hr-stats', only: 'hr', title: 'What the assistant saves you',
    body: 'How many questions it answered on its own, and how many came to HR.' },
  { id: 'hr-ticket', section: 'hr-inbox', path: '/hr-inbox', target: 'hr-ticket', only: 'hr', title: 'Answer in one place',
    body: 'See the question, the assistant’s attempt and its sources, then write your answer: the employee sees it right away.' },

  // Help
  { id: 'help-btn', section: 'help', path: '/', target: 'help', title: 'Forgot something?',
    body: 'Click Help any time to reopen this guide and replay any part of the tour.' },
  { id: 'help-user', section: 'help', path: '/', target: 'user-switcher', title: 'Who you are',
    body: 'The colleague you are signed in as. In this demo you can switch here, for example to a manager to try approvals.' },
]

/** Shortcut ("I want to…") → steps to show. A section id means all of its steps. */
export const SHORTCUTS: { want: string; steps: string[] | string; only?: 'approver' | 'hr' }[] = [
  { want: 'See how many holiday days I have left', steps: ['ov-balance'] },
  { want: 'Take a day off or a holiday', steps: 'request' },
  { want: 'Work from home', steps: ['rq-nav', 'rq-remote', 'rq-dates', 'rq-check'] },
  { want: 'Report that I am sick', steps: ['rq-nav', 'rq-sick', 'rq-check'] },
  { want: 'Check if my request was approved', steps: ['mr-nav', 'mr-list'] },
  { want: 'Cancel a request', steps: ['mr-list'] },
  { want: 'See who is on holiday this month', steps: 'calendar' },
  { want: 'Plan a site visit with people who are in', steps: 'availability' },
  { want: "Approve my team's leave", steps: 'approvals', only: 'approver' },
  { want: 'Ask a question about the company rules', steps: 'assistant' },
  { want: "Answer employees' questions", steps: 'hr-inbox', only: 'hr' },
]
