from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import settings

# check_same_thread=False: FastAPI may use the connection from different threads.
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


def create_db_and_tables(target=None) -> None:
    target = target or engine
    SQLModel.metadata.create_all(target)
    migrate(target)


def migrate(target) -> None:
    """Tiny in-place migrations for databases created by an older version (no Alembic for a demo)."""
    from app.models import ChatSession, QuestionLog

    columns = {c["name"] for c in inspect(target).get_columns("questionlog")}
    if "session_id" not in columns:
        with target.begin() as conn:
            conn.execute(text("ALTER TABLE questionlog ADD COLUMN session_id INTEGER REFERENCES chatsession(id)"))

    # Questions asked before chat sessions existed: one ended "Earlier questions" session per employee.
    with Session(target) as s:
        orphans = s.exec(select(QuestionLog).where(QuestionLog.session_id == None)).all()  # noqa: E711
        by_employee: dict[int, list[QuestionLog]] = {}
        for q in orphans:
            by_employee.setdefault(q.employee_id, []).append(q)
        for employee_id, qs in by_employee.items():
            qs.sort(key=lambda q: q.created_at)
            session = ChatSession(employee_id=employee_id, title="Earlier questions", created_at=qs[0].created_at,
                                  last_activity_at=qs[-1].created_at, ended_at=qs[-1].created_at)
            s.add(session)
            s.flush()
            for q in qs:
                q.session_id = session.id
                s.add(q)
        s.commit()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
