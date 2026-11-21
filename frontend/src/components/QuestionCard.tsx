import { format, parseISO } from 'date-fns'
import { Fragment, useState } from 'react'
import type { Question, Source } from '../api/types'

const LANG_FLAG: Record<Question['language'], string> = { en: 'EN', fr: 'FR', nl: 'NL' }

/** Answer text with [1] citations turned into small clickable chips. */
export function AnswerText({ text, sources, onCite }: { text: string; sources: Source[]; onCite?: (n: number) => void }) {
  const known = new Set(sources.map((s) => s.n))
  return (
    <p className="leading-relaxed text-slate-800">
      {text.split(/(\[\d+\])/).map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        if (!m) return <Fragment key={i}>{part}</Fragment>
        const n = Number(m[1])
        return known.has(n) ? (
          <button key={i} type="button" onClick={() => onCite?.(n)} title="See the source"
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-blue-100 px-1 align-text-top text-xs font-semibold text-blue-700 hover:bg-blue-200">
            {n}
          </button>
        ) : null
      })}
    </p>
  )
}

export function Sources({ sources, open, onToggle }: { sources: Source[]; open: number | null; onToggle: (n: number) => void }) {
  if (sources.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">From the Corvalis policies</p>
      {sources.map((s) => (
        <div key={s.n} className="rounded-lg border border-slate-200 bg-slate-50">
          <button type="button" onClick={() => onToggle(s.n)} aria-expanded={open === s.n}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-blue-100 text-xs font-semibold text-blue-700">{s.n}</span>
            <span className="font-medium text-slate-700">{s.doc_title}</span>
            <span className="text-slate-400">›</span>
            <span className="text-slate-700">{s.section}</span>
            <span className="ml-auto text-xs text-slate-400">{open === s.n ? 'Hide' : 'Read the rule'}</span>
          </button>
          {open === s.n && <p className="border-t border-slate-200 px-3 py-2 text-sm whitespace-pre-line text-slate-600">{s.text}</p>}
        </div>
      ))}
    </div>
  )
}

export function QuestionStatus({ q }: { q: Question }) {
  if (q.ticket?.status === 'answered') return <Badge tone="emerald">HR answered</Badge>
  if (q.ticket) return <Badge tone="amber">Waiting for HR</Badge>
  if (q.answered) return <Badge tone="blue">Answered by the assistant</Badge>
  return <Badge tone="slate">Not in the policies</Badge>
}

function Badge({ tone, children }: { tone: 'emerald' | 'amber' | 'blue' | 'slate'; children: string }) {
  const c = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    blue: 'bg-blue-50 text-blue-800 ring-blue-200',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  }[tone]
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${c}`}>{children}</span>
}

export function LangTag({ lang }: { lang: Question['language'] }) {
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{LANG_FLAG[lang]}</span>
}

/** Question + assistant answer + sources + HR reply. Used in the history and in the HR inbox. */
export function QuestionBody({ q, showAsker = false }: { q: Question; showAsker?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const toggle = (n: number) => setOpen((o) => (o === n ? null : n))
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-slate-900">
          <LangTag lang={q.language} /> {q.question}
        </p>
        <QuestionStatus q={q} />
      </div>
      <p className="mt-0.5 text-xs text-slate-400">
        {showAsker && `${q.employee.full_name} · `}
        {format(parseISO(q.created_at), "EEE d MMM 'at' HH:mm")}
      </p>
      {q.answer && (
        <div className={`mt-3 rounded-lg p-3 ${q.answered ? 'bg-blue-50/60' : 'bg-slate-50'}`}>
          <p className="mb-1 text-xs font-medium text-slate-500">Assistant</p>
          <AnswerText text={q.answer} sources={q.sources} onCite={toggle} />
          <Sources sources={q.sources} open={open} onToggle={toggle} />
        </div>
      )}
      {q.ticket?.employee_note && (
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium">Note for HR:</span> “{q.ticket.employee_note}”
        </p>
      )}
      {q.ticket?.hr_answer && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-1 text-xs font-medium text-emerald-800">
            {q.ticket.answered_by_name ?? 'HR'} (HR)
            {q.ticket.answered_at && ` · ${format(parseISO(q.ticket.answered_at), 'd MMM')}`}
          </p>
          <p className="text-slate-800">{q.ticket.hr_answer}</p>
        </div>
      )}
    </>
  )
}
