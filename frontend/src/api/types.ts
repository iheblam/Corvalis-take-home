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
