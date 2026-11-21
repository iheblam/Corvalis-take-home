// Search and URL-filter helpers shared by the calendar and "Who's available?". Pure functions (unit-tested).
import { isValid, parse } from 'date-fns'
import type { Department, EmployeeBrief, Office } from './api/types'
import { DEPARTMENT_LABEL, OFFICE_LABEL } from './labels'

/** Lower-case and strip accents: "Liège" → "liege", "Amélie" → "amelie". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Every word of the query must appear in the name, job title, department or office. */
export function matchesSearch(e: EmployeeBrief, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalize(
    `${e.full_name} ${e.job_title} ${DEPARTMENT_LABEL[e.department]} ${OFFICE_LABEL[e.office]}`,
  )
  return words.every((w) => haystack.includes(w))
}

/** "2026-12-07" → same string if it is a real date, otherwise null. */
export function parseDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return isValid(parse(value, 'yyyy-MM-dd', new Date())) ? value : null
}

/** "2026-12" → first day of that month, otherwise null. */
export function parseMonth(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const d = parse(value, 'yyyy-MM', new Date())
  return isValid(d) ? d : null
}

/** URL value → department filter. Missing = the user's own department, "all" = no filter. */
export function parseDepartment(value: string | null, fallback: Department): Department | '' {
  if (value === 'all') return ''
  return value && Object.hasOwn(DEPARTMENT_LABEL, value) ? (value as Department) : fallback
}

export function parseOffice(value: string | null): Office | '' {
  return value && Object.hasOwn(OFFICE_LABEL, value) ? (value as Office) : ''
}
