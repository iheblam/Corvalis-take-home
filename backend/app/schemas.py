"""API input/output shapes (separate from the tables so the API stays stable)."""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import Department, LeaveStatus, LeaveType, Office, Role


class EmployeeBrief(BaseModel):
    id: int
    full_name: str
    job_title: str
    department: Department
    office: Office


class EmployeeRead(EmployeeBrief):
    email: str
    role: Role
    manager_id: int | None
    manager_name: str | None = None
    direct_reports: int = 0


class BalanceRead(BaseModel):
    employee_id: int
    year: int
    annual_days: int
    carried_over_days: int
    carry_over_deadline: date
    taken_days: int
    pending_days: int
    carried_over_used: int
    carried_over_expired: int
    available_days: int


class LeaveRequestIn(BaseModel):
    type: LeaveType
    start_date: date
    end_date: date
    comment: str | None = Field(default=None, max_length=500)


class LeavePreview(BaseModel):
    ok: bool
    working_days: int
    certificate_required: bool
    errors: list[str]
    warnings: list[str]


class LeaveRequestRead(BaseModel):
    id: int
    employee: EmployeeBrief
    type: LeaveType
    start_date: date
    end_date: date
    working_days: int
    status: LeaveStatus
    comment: str | None
    decided_by_name: str | None
    decided_at: datetime | None
    decision_note: str | None
    certificate_required: bool
    certificate_received: bool
    created_at: datetime
    can_decide: bool = False
    can_cancel: bool = False


class LeaveRequestCreated(BaseModel):
    request: LeaveRequestRead
    warnings: list[str]


class DecisionIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class HolidayRead(BaseModel):
    date: date
    name: str
    is_replacement_day: bool


class CalendarDay(BaseModel):
    date: date
    is_working_day: bool
    holiday_name: str | None = None


class CalendarAbsence(BaseModel):
    id: int
    # "away" hides the reason (e.g. sickness) from colleagues who are not manager/HR.
    type: LeaveType | str
    status: LeaveStatus
    start_date: date
    end_date: date


class CalendarRow(BaseModel):
    employee: EmployeeBrief
    absences: list[CalendarAbsence]


class CalendarRead(BaseModel):
    start: date
    end: date
    days: list[CalendarDay]
    rows: list[CalendarRow]


class AbsentPerson(BaseModel):
    employee: EmployeeBrief
    type: LeaveType | str
    status: LeaveStatus
    back_on: date | None  # first working day after the absence


class AvailabilityRead(BaseModel):
    date: date
    is_working_day: bool
    holiday_name: str | None
    available: list[EmployeeBrief]
    remote: list[EmployeeBrief]
    absent: list[AbsentPerson]
