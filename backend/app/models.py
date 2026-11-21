"""Database tables (SQLModel). The leave balance is never stored: it is computed from requests."""

import datetime as dt
from datetime import UTC, date, datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel, UniqueConstraint


class Department(StrEnum):
    management = "management"
    structures = "structures"
    building_services = "building_services"
    drawing_office = "drawing_office"
    office = "office"


class Office(StrEnum):
    brussels = "brussels"
    liege = "liege"


class Role(StrEnum):
    employee = "employee"
    manager = "manager"  # approves the requests of their direct reports
    hr = "hr"  # sees and approves everything


class LeaveType(StrEnum):
    annual = "annual"
    sick = "sick"
    remote = "remote"
    unpaid = "unpaid"


class LeaveStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


ACTIVE_STATUSES = (LeaveStatus.pending, LeaveStatus.approved)


class Employee(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    full_name: str = Field(index=True)
    email: str = Field(unique=True)
    job_title: str
    department: Department = Field(index=True)
    office: Office
    role: Role = Role.employee
    manager_id: int | None = Field(default=None, foreign_key="employee.id")


class LeaveAllowance(SQLModel, table=True):
    """Yearly entitlement. Carried-over days can only be used until 31 March of `year`."""

    __table_args__ = (UniqueConstraint("employee_id", "year"),)

    id: int | None = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="employee.id", index=True)
    year: int
    annual_days: int = 20
    carried_over_days: int = 0


class LeaveRequest(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="employee.id", index=True)
    type: LeaveType
    start_date: date = Field(index=True)
    end_date: date = Field(index=True)
    working_days: int  # computed by the server (weekends and public holidays excluded)
    status: LeaveStatus = Field(default=LeaveStatus.pending, index=True)
    comment: str | None = None

    decided_by_id: int | None = Field(default=None, foreign_key="employee.id")
    decided_at: datetime | None = None
    decision_note: str | None = None

    certificate_required: bool = False  # sick leave longer than one working day
    certificate_received: bool = False

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PublicHoliday(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    date: dt.date = Field(unique=True, index=True)
    name: str
    is_replacement_day: bool = False  # replaces a holiday that fell on a Sunday


# ---------------------------------------------------------------- P1: questions about internal rules


class TicketStatus(StrEnum):
    open = "open"
    answered = "answered"


class QuestionLog(SQLModel, table=True):
    """Every question asked to the assistant, with what it answered (the HR 'FAQ' of real questions)."""

    id: int | None = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="employee.id", index=True)
    question: str
    answer: str | None = None
    answered: bool = False  # False = the documents do not cover it, or the assistant was offline
    reason: str | None = None  # "not_found" | "offline" when not answered
    sources: str = "[]"  # JSON list of {"id", "doc", "section"}
    language: str = "en"
    helpful: bool | None = None  # employee feedback
    latency_ms: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)


class HRTicket(SQLModel, table=True):
    """A question the assistant could not settle, sent to HR. One ticket per question."""

    id: int | None = Field(default=None, primary_key=True)
    question_log_id: int = Field(foreign_key="questionlog.id", unique=True)
    status: TicketStatus = Field(default=TicketStatus.open, index=True)
    employee_note: str | None = None
    hr_answer: str | None = None
    answered_by_id: int | None = Field(default=None, foreign_key="employee.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    answered_at: datetime | None = None
