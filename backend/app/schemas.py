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


# ---------------------------------------------------------------- assistant (P1)


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class SourceRead(BaseModel):
    n: int
    id: str
    doc: str
    doc_title: str
    section: str
    text: str


class TicketRead(BaseModel):
    id: int
    status: str
    employee_note: str | None
    hr_answer: str | None
    answered_by_name: str | None
    created_at: datetime
    answered_at: datetime | None


class QuestionRead(BaseModel):
    id: int
    session_id: int | None = None
    employee: EmployeeBrief
    question: str
    answer: str | None
    answered: bool
    reason: str | None
    language: str
    sources: list[SourceRead]
    helpful: bool | None
    latency_ms: int | None
    created_at: datetime
    ticket: TicketRead | None


class FeedbackIn(BaseModel):
    helpful: bool


class EscalateIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class HRAnswerIn(BaseModel):
    answer: str = Field(min_length=2, max_length=2000)


class AssistantStatus(BaseModel):
    ollama: bool
    model: str
    model_available: bool
    retrieval_ready: bool


class AssistantStats(BaseModel):
    questions: int
    answered_by_assistant: int
    sent_to_hr: int
    open_tickets: int
    helpful: int
    not_helpful: int


class AskInSession(AskIn):
    session_id: int | None = None  # None = continue the active conversation (or start one)


class ChatSessionRead(BaseModel):
    id: int
    title: str
    created_at: datetime
    last_activity_at: datetime
    ended_at: datetime | None
    active: bool
    questions: int
    waiting_for_hr: int
    hr_replies: int


class ChatSessionDetail(ChatSessionRead):
    messages: list[QuestionRead]
