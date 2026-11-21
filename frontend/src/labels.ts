import { format, parseISO } from 'date-fns'
import type { Department, LeaveStatus, Office, VisibleType } from './api/types'

export const TYPE_LABEL: Record<VisibleType, string> = {
  annual: 'Holiday',
  sick: 'Sick',
  remote: 'Working from home',
  unpaid: 'Unpaid leave',
  away: 'Away',
}

/** Tailwind classes per type: solid (approved) and light (pending). */
export const TYPE_COLOR: Record<VisibleType, { solid: string; light: string; dot: string }> = {
  annual: { solid: 'bg-sky-500 text-white', light: 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-300', dot: 'bg-sky-500' },
  sick: { solid: 'bg-rose-500 text-white', light: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-300', dot: 'bg-rose-500' },
  away: { solid: 'bg-slate-500 text-white', light: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300', dot: 'bg-slate-500' },
  remote: { solid: 'bg-violet-400 text-white', light: 'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-300', dot: 'bg-violet-400' },
  unpaid: { solid: 'bg-amber-500 text-white', light: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300', dot: 'bg-amber-500' },
}

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Refused',
  cancelled: 'Cancelled',
}

export const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export const DEPARTMENT_LABEL: Record<Department, string> = {
  management: 'Management',
  structures: 'Structures',
  building_services: 'Building services',
  drawing_office: 'Drawing office',
  office: 'Office',
}

export const OFFICE_LABEL: Record<Office, string> = { brussels: 'Brussels', liege: 'Liège' }

export const fmtDay = (iso: string) => format(parseISO(iso), 'EEE d MMM')
export const fmtDayYear = (iso: string) => format(parseISO(iso), 'EEE d MMM yyyy')
export const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

export function fmtRange(start: string, end: string) {
  return start === end ? fmtDay(start) : `${fmtDay(start)} → ${fmtDay(end)}`
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
