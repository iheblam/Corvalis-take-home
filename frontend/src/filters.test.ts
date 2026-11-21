import { describe, expect, it } from 'vitest'
import type { EmployeeBrief } from './api/types'
import { matchesSearch, normalize, parseDay, parseDepartment, parseMonth, parseOffice } from './filters'

const amelie: EmployeeBrief = {
  id: 1, full_name: 'Amélie Fontaine', job_title: 'Structural Engineer', department: 'structures', office: 'liege',
}
const kevin: EmployeeBrief = {
  id: 2, full_name: 'Kevin Maes', job_title: 'Head of Building Services', department: 'building_services', office: 'brussels',
}

describe('normalize', () => {
  it('ignores accents, case and spaces', () => {
    expect(normalize('  Liège ')).toBe('liege')
    expect(normalize('AMÉLIE')).toBe('amelie')
    expect(normalize('Gaëlle Remacle')).toBe('gaelle remacle')
  })
})

describe('matchesSearch', () => {
  it('matches everything when the query is empty', () => {
    expect(matchesSearch(amelie, '')).toBe(true)
    expect(matchesSearch(amelie, '   ')).toBe(true)
  })
  it('finds names without accents and in any case', () => {
    expect(matchesSearch(amelie, 'amelie')).toBe(true)
    expect(matchesSearch(amelie, 'FONTAINE')).toBe(true)
    expect(matchesSearch(kevin, 'amelie')).toBe(false)
  })
  it('searches job title, department and office', () => {
    expect(matchesSearch(amelie, 'structural')).toBe(true)
    expect(matchesSearch(amelie, 'liege')).toBe(true) // office label "Liège"
    expect(matchesSearch(kevin, 'building services')).toBe(true)
    expect(matchesSearch(kevin, 'brussels')).toBe(true)
  })
  it('requires every word (AND), in any order', () => {
    expect(matchesSearch(amelie, 'engineer liege')).toBe(true)
    expect(matchesSearch(amelie, 'engineer brussels')).toBe(false)
  })
  it('treats regex characters as plain text', () => {
    expect(matchesSearch(amelie, '.*')).toBe(false)
    expect(matchesSearch(amelie, '(')).toBe(false)
  })
})

describe('URL parsers fall back safely on bad values', () => {
  it('parseDay', () => {
    expect(parseDay('2026-12-07')).toBe('2026-12-07')
    expect(parseDay('2026-02-30')).toBeNull()
    expect(parseDay('07/12/2026')).toBeNull()
    expect(parseDay("2026-12-07' OR 1=1")).toBeNull()
    expect(parseDay(null)).toBeNull()
  })
  it('parseMonth', () => {
    expect(parseMonth('2026-12')?.getMonth()).toBe(11)
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseMonth('december')).toBeNull()
  })
  it('parseDepartment: missing = own department, "all" = no filter, unknown = own department', () => {
    expect(parseDepartment(null, 'office')).toBe('office')
    expect(parseDepartment('all', 'office')).toBe('')
    expect(parseDepartment('structures', 'office')).toBe('structures')
    expect(parseDepartment('marketing', 'office')).toBe('office')
    expect(parseDepartment('__proto__', 'office')).toBe('office')
  })
  it('parseOffice', () => {
    expect(parseOffice('liege')).toBe('liege')
    expect(parseOffice('paris')).toBe('')
    expect(parseOffice(null)).toBe('')
  })
})
