// The guided tour points at elements by data-tour="…". If someone renames or removes one,
// this test fails instead of the tour silently skipping a step.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHORTCUTS, TOUR_STEPS } from './components/tourSteps'

function sources(dir: string): string {
  return readdirSync(dir)
    .map((f) => join(dir, f))
    .map((p) => (statSync(p).isDirectory() ? sources(p) : p.endsWith('.tsx') ? readFileSync(p, 'utf8') : ''))
    .join('\n')
}

const code = sources(join(__dirname))
const ROUTES = ['/', '/request', '/my-requests', '/calendar', '/availability', '/approvals']

describe('guided tour', () => {
  it('every step targets an element that exists in the code', () => {
    for (const step of TOUR_STEPS) {
      const literal = code.includes(`data-tour="${step.target}"`)
      const typeCard = step.target.startsWith('type-') && code.includes('data-tour={`type-${t.type}`}')
      const navLink = step.target.startsWith('nav-') && code.includes('data-tour={`nav-$')
      const approvalCard = step.target === 'approval-card' && code.includes("'approval-card'")
      expect(literal || typeCard || navLink || approvalCard, step.target).toBe(true)
    }
  })

  it('every step opens a real page', () => {
    for (const step of TOUR_STEPS) expect(ROUTES).toContain(step.path)
  })

  it('step ids are unique and shortcuts point at existing steps or sections', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sections = new Set(TOUR_STEPS.map((s) => s.section))
    for (const sc of SHORTCUTS) {
      if (Array.isArray(sc.steps)) for (const id of sc.steps) expect(ids, sc.want).toContain(id)
      else expect(sections.has(sc.steps), sc.want).toBe(true)
    }
  })
})
