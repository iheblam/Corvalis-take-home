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


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for year in (2026, 2027):
            for d, name, repl in workdays.belgian_holidays(year):
                s.add(PublicHoliday(date=d, name=name, is_replacement_day=repl))
        yield s


@pytest.fixture
def people(session):
    def make(name, role=Role.employee, manager=None):
        e = Employee(full_name=name, email=f"{name.lower()}@corvalis.be", job_title="Engineer",
                     department=Department.structures, office=Office.brussels, role=role,
                     manager_id=manager.id if manager else None)
        session.add(e)
        session.commit()
        session.refresh(e)
        return e

    hr = make("Hanna", Role.hr)
    manager = make("Max", Role.manager)
    alice = make("Alice", manager=manager)
    bob = make("Bob")  # not managed by Max
    session.add(LeaveAllowance(employee_id=alice.id, year=2026, annual_days=20, carried_over_days=0))
    session.commit()
    return {"hr": hr, "manager": manager, "alice": alice, "bob": bob}


@pytest.fixture
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def as_user(e: Employee) -> dict[str, str]:
    return {"X-User-Id": str(e.id)}
