// Mirrors backend/app/schemas.py

export type Department = 'management' | 'structures' | 'building_services' | 'drawing_office' | 'office'
export type Office = 'brussels' | 'liege'
export type Role = 'employee' | 'manager' | 'hr'
export type LeaveType = 'annual' | 'sick' | 'remote' | 'unpaid'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
/** "away" = a colleague's sick leave, reason hidden */
export type VisibleType = LeaveType | 'away'

export interface EmployeeBrief {
  id: number
  full_name: string
  job_title: string
  department: Department
  office: Office
}

export interface Employee extends EmployeeBrief {
  email: string
  role: Role
  manager_id: number | null
  manager_name: string | null
  direct_reports: number
}

export interface Balance {
  employee_id: number
  year: number
  annual_days: number
  carried_over_days: number
  carry_over_deadline: string
  taken_days: number
  pending_days: number
  carried_over_used: number
  carried_over_expired: number
  available_days: number
}

export interface LeaveRequestIn {
  type: LeaveType
  start_date: string
  end_date: string
  comment?: string | null
}

export interface LeavePreview {
  ok: boolean
  working_days: number
  certificate_required: boolean
  errors: string[]
  warnings: string[]
}

export interface LeaveRequest {
  id: number
  employee: EmployeeBrief
  type: LeaveType
  start_date: string
  end_date: string
  working_days: number
  status: LeaveStatus
  comment: string | null
  decided_by_name: string | null
  decided_at: string | null
  decision_note: string | null
  certificate_required: boolean
  certificate_received: boolean
  created_at: string
  can_decide: boolean
  can_cancel: boolean
}

export interface CalendarDay {
  date: string
  is_working_day: boolean
  holiday_name: string | null
}

export interface CalendarAbsence {
  id: number
  type: VisibleType
  status: LeaveStatus
  start_date: string
  end_date: string
}

export interface Calendar {
  start: string
  end: string
  days: CalendarDay[]
  rows: { employee: EmployeeBrief; absences: CalendarAbsence[] }[]
}

export interface Availability {
  date: string
  is_working_day: boolean
  holiday_name: string | null
  available: EmployeeBrief[]
  remote: EmployeeBrief[]
  absent: { employee: EmployeeBrief; type: VisibleType; status: LeaveStatus; back_on: string | null }[]
}

// ---------------------------------------------------------------- assistant (P1)

export interface Source {
  n: number
  id: string
  doc: string
  doc_title: string
  section: string
  text: string
}

export interface Ticket {
  id: number
  status: 'open' | 'answered'
  employee_note: string | null
  hr_answer: string | null
  answered_by_name: string | null
  created_at: string
  answered_at: string | null
}

export interface Question {
  id: number
  employee: EmployeeBrief
  question: string
  answer: string | null
  answered: boolean
  reason: 'not_found' | 'offline' | null
  language: 'en' | 'fr' | 'nl'
  sources: Source[]
  helpful: boolean | null
  latency_ms: number | null
  created_at: string
  ticket: Ticket | null
}

export interface AssistantStatus {
  ollama: boolean
  model: string
  model_available: boolean
  retrieval_ready: boolean
}

export interface AssistantStats {
  questions: number
  answered_by_assistant: number
  sent_to_hr: number
  open_tickets: number
  helpful: number
  not_helpful: number
}
