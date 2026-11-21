from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.models import Department, Employee, LeaveAllowance, Office, PublicHoliday, Role
from app.services import workdays

TODAY = date(2026, 11, 16)  # a Monday


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(workdays, "today", lambda: TODAY)


def memory_engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def empty_session():
    """A brand-new database with no data at all (for the seed tests)."""
    with Session(memory_engine()) as s:
        yield s


@pytest.fixture
def session():
    with Session(memory_engine()) as s:
        for year in (2026, 2027):
            for d, name, repl in workdays.belgian_holidays(year):
                s.add(PublicHoliday(date=d, name=name, is_replacement_day=repl))
        yield s


@pytest.fixture
def people(session):
    """hr · manager (Max) · alice and carol report to Max · bob has no manager."""

    def make(name, role=Role.employee, manager=None, department=Department.structures, office=Office.brussels):
        e = Employee(full_name=name, email=f"{name.lower()}@corvalis.be", job_title="Engineer",
                     department=department, office=office, role=role,
                     manager_id=manager.id if manager else None)
        session.add(e)
        session.commit()
        session.refresh(e)
        return e

    hr = make("Hanna", Role.hr, department=Department.office)
    manager = make("Max", Role.manager)
    alice = make("Alice", manager=manager)
    bob = make("Bob")
    carol = make("Carol", manager=manager, department=Department.building_services, office=Office.liege)
    session.add(LeaveAllowance(employee_id=alice.id, year=2026, annual_days=20, carried_over_days=0))
    session.commit()
    return {"hr": hr, "manager": manager, "alice": alice, "bob": bob, "carol": carol}


@pytest.fixture
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def as_user(e: Employee) -> dict[str, str]:
    return {"X-User-Id": str(e.id)}


def create(client, user, **body):
    return client.post("/api/leave-requests", json=body, headers=as_user(user))
