"""Data is kept after a restart (brief requirement R2): write through the API, reopen the file."""

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.db import get_session
from app.main import app
from app.models import Department, Employee, LeaveRequest, Office


def test_request_survives_a_restart(tmp_path):
    url = f"sqlite:///{(tmp_path / 'corvalis.db').as_posix()}"

    # First "run" of the server.
    engine = create_engine(url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        e = Employee(full_name="Alice", email="a@corvalis.be", job_title="Engineer",
                     department=Department.structures, office=Office.brussels)
        s.add(e)
        s.commit()
        user_id = e.id

    def session_override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = session_override
    try:
        r = TestClient(app).post(
            "/api/leave-requests",
            json={"type": "annual", "start_date": "2026-12-07", "end_date": "2026-12-08", "comment": "Persist me"},
            headers={"X-User-Id": str(user_id)},
        )
        assert r.status_code == 201
    finally:
        app.dependency_overrides.clear()
    engine.dispose()  # "stop" the server

    # Second run: a fresh engine on the same file sees the data.
    engine2 = create_engine(url)
    with Session(engine2) as s:
        saved = s.exec(select(LeaveRequest)).one()
        assert saved.comment == "Persist me" and saved.working_days == 2
    engine2.dispose()
