"""P1: ask the internal rules, give feedback, escalate to HR; HR answers tickets."""

import json
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import Session, col, func, select

from app.deps import CurrentUser, HRUser, SessionDep
from app.models import ChatSession, Employee, HRTicket, QuestionLog, Role, TicketStatus
from app.presenters import brief, employees_by_id
from app.rag import assistant, llm
from app.schemas import (
    AskInSession,
    AssistantStats,
    ChatSessionDetail,
    ChatSessionRead,
    AssistantStatus,
    EscalateIn,
    FeedbackIn,
    HRAnswerIn,
    QuestionRead,
    SourceRead,
    TicketRead,
)
from app.services import workdays
from app.services.leave_rules import compute_balance

router = APIRouter(prefix="/api", tags=["assistant"])


# ------------------------------------------------------------------ helpers


def personal_context(session: Session, user: Employee) -> str:
    """The asker's own leave data, so "how many days do I have left?" gets a real answer."""
    b = compute_balance(session, user.id, workdays.today().year)
    manager = session.get(Employee, user.manager_id) if user.manager_id else None
    return (
        # No name on purpose: with a name, the small model answers "Camille can…" instead of "you can…".
        f"Job: {user.job_title}. Holidays {b.year}: {b.available_days} days left "
        f"({b.taken_days} taken, {b.pending_days} waiting for approval, allowance {b.annual_days}"
        f"{f' + {b.carried_over_days} carried over' if b.carried_over_days else ''}). "
        f"Manager: {manager.full_name if manager else 'none'}."
    )


def question_reads(session: Session, logs: list[QuestionLog]) -> list[QuestionRead]:
    tickets = {
        t.question_log_id: t
        for t in session.exec(select(HRTicket).where(col(HRTicket.question_log_id).in_([q.id for q in logs]))).all()
    } if logs else {}
    people = employees_by_id(session, [q.employee_id for q in logs] + [t.answered_by_id for t in tickets.values()])
    out = []
    for q in logs:
        t = tickets.get(q.id)
        out.append(QuestionRead(
            id=q.id, session_id=q.session_id, employee=brief(people[q.employee_id]), question=q.question, answer=q.answer,
            answered=q.answered, reason=q.reason, language=q.language,
            sources=[SourceRead(**s) for s in json.loads(q.sources)], helpful=q.helpful,
            latency_ms=q.latency_ms, created_at=q.created_at,
            ticket=TicketRead(
                id=t.id, status=t.status, employee_note=t.employee_note, hr_answer=t.hr_answer,
                answered_by_name=people[t.answered_by_id].full_name if t.answered_by_id else None,
                created_at=t.created_at, answered_at=t.answered_at,
            ) if t else None,
        ))
    return out


def _own_question(session: Session, user: Employee, question_id: int) -> QuestionLog:
    q = session.get(QuestionLog, question_id)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    if q.employee_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This is not your question.")
    return q


# ------------------------------------------------------------------ employee side


@router.get("/assistant/status", response_model=AssistantStatus)
def assistant_status():
    return AssistantStatus(**llm.status(), retrieval_ready=assistant._retriever is not None)


# ------------------------------------------------------------------ chat sessions


def _session_reads(session: Session, chats: list[ChatSession]) -> list[ChatSessionRead]:
    ids = [c.id for c in chats]
    stats: dict[int, dict[str, int]] = {i: {"questions": 0, "waiting_for_hr": 0, "hr_replies": 0} for i in ids}
    if ids:
        rows = session.exec(
            select(QuestionLog.session_id, HRTicket.status)
            .join(HRTicket, HRTicket.question_log_id == QuestionLog.id, isouter=True)
            .where(col(QuestionLog.session_id).in_(ids))
        ).all()
        for sid, ticket_status in rows:
            stats[sid]["questions"] += 1
            if ticket_status == TicketStatus.open:
                stats[sid]["waiting_for_hr"] += 1
            elif ticket_status == TicketStatus.answered:
                stats[sid]["hr_replies"] += 1
    return [
        ChatSessionRead(id=c.id, title=c.title or "New conversation", created_at=c.created_at,
                        last_activity_at=c.last_activity_at, ended_at=c.ended_at, active=c.ended_at is None,
                        **stats[c.id])
        for c in chats
    ]


def _own_chat(session: Session, user: Employee, chat_id: int) -> ChatSession:
    c = session.get(ChatSession, chat_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")
    if c.employee_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This is not your conversation.")
    return c


def _active_chat(session: Session, user: Employee) -> ChatSession | None:
    return session.exec(
        select(ChatSession).where(ChatSession.employee_id == user.id, ChatSession.ended_at == None)  # noqa: E711
        .order_by(col(ChatSession.last_activity_at).desc())
    ).first()


@router.get("/chat-sessions", response_model=list[ChatSessionRead])
def list_chats(session: SessionDep, user: CurrentUser):
    """My conversations, most recent activity first."""
    chats = session.exec(
        select(ChatSession).where(ChatSession.employee_id == user.id)
        .order_by(col(ChatSession.last_activity_at).desc())
    ).all()
    return _session_reads(session, list(chats))


@router.post("/chat-sessions", response_model=ChatSessionRead, status_code=status.HTTP_201_CREATED)
def start_chat(session: SessionDep, user: CurrentUser):
    """Start a new conversation. The previous active one is ended (it stays saved and readable)."""
    now = datetime.now(UTC)
    previous = _active_chat(session, user)
    if previous and previous.title is None:
        return _session_reads(session, [previous])[0]  # still empty: reuse it instead of piling up blanks
    if previous:
        previous.ended_at = now
        session.add(previous)
    chat = ChatSession(employee_id=user.id, created_at=now, last_activity_at=now)
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return _session_reads(session, [chat])[0]


@router.get("/chat-sessions/{chat_id}", response_model=ChatSessionDetail)
def get_chat(chat_id: int, session: SessionDep, user: CurrentUser):
    chat = _own_chat(session, user, chat_id)
    logs = session.exec(
        select(QuestionLog).where(QuestionLog.session_id == chat.id).order_by(col(QuestionLog.created_at).asc())
    ).all()
    return ChatSessionDetail(**_session_reads(session, [chat])[0].model_dump(),
                             messages=question_reads(session, list(logs)))


@router.post("/chat-sessions/{chat_id}/end", response_model=ChatSessionRead)
def end_chat(chat_id: int, session: SessionDep, user: CurrentUser):
    chat = _own_chat(session, user, chat_id)
    if chat.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This conversation has already ended.")
    chat.ended_at = datetime.now(UTC)
    session.add(chat)
    session.commit()
    return _session_reads(session, [chat])[0]


# ------------------------------------------------------------------ asking


@router.post("/assistant/ask", response_model=QuestionRead, status_code=status.HTTP_201_CREATED)
def ask(body: AskInSession, session: SessionDep, user: CurrentUser):
    question = " ".join(body.question.split())
    if body.session_id is not None:
        chat = _own_chat(session, user, body.session_id)
        if chat.ended_at is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This conversation has ended. Start a new one to ask again.")
    else:
        chat = _active_chat(session, user) or ChatSession(employee_id=user.id)
    a = assistant.answer_question(question, personal=personal_context(session, user))
    now = datetime.now(UTC)
    chat.title = chat.title or (question if len(question) <= 60 else question[:57].rstrip() + "…")
    chat.last_activity_at = now
    session.add(chat)
    session.flush()
    log = QuestionLog(
        employee_id=user.id, session_id=chat.id, question=question, answer=a.text, answered=a.answered,
        reason=a.reason, language=a.language, sources=json.dumps(a.sources, ensure_ascii=False),
        latency_ms=a.latency_ms, created_at=now,
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return question_reads(session, [log])[0]


@router.get("/questions", response_model=list[QuestionRead])
def list_questions(session: SessionDep, user: CurrentUser, scope: Literal["mine", "all"] = "mine", limit: int = 50):
    query = select(QuestionLog).order_by(col(QuestionLog.created_at).desc()).limit(min(max(limit, 1), 200))
    if scope == "mine":
        query = query.where(QuestionLog.employee_id == user.id)
    elif user.role != Role.hr:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only HR can see everyone's questions.")
    return question_reads(session, list(session.exec(query).all()))


@router.post("/questions/{question_id}/feedback", response_model=QuestionRead)
def feedback(question_id: int, body: FeedbackIn, session: SessionDep, user: CurrentUser):
    q = _own_question(session, user, question_id)
    q.helpful = body.helpful
    session.add(q)
    session.commit()
    return question_reads(session, [q])[0]


@router.post("/questions/{question_id}/escalate", response_model=QuestionRead, status_code=status.HTTP_201_CREATED)
def escalate(question_id: int, body: EscalateIn, session: SessionDep, user: CurrentUser):
    q = _own_question(session, user, question_id)
    if session.exec(select(HRTicket).where(HRTicket.question_log_id == q.id)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "This question was already sent to HR.")
    note = (body.note or "").strip() or None
    session.add(HRTicket(question_log_id=q.id, employee_note=note))
    session.commit()
    return question_reads(session, [q])[0]


# ------------------------------------------------------------------ HR side


@router.get("/hr-tickets", response_model=list[QuestionRead])
def hr_tickets(session: SessionDep, _: HRUser, status_: Annotated[Literal["open", "answered"], Query(alias="status")] = "open"):
    """Questions sent to HR, oldest open first (answered: newest first)."""
    order = col(HRTicket.created_at).asc() if status_ == "open" else col(HRTicket.answered_at).desc()
    logs = session.exec(
        select(QuestionLog).join(HRTicket, HRTicket.question_log_id == QuestionLog.id)
        .where(HRTicket.status == status_).order_by(order)
    ).all()
    return question_reads(session, list(logs))


@router.post("/hr-tickets/{ticket_id}/answer", response_model=QuestionRead)
def answer_ticket(ticket_id: int, body: HRAnswerIn, session: SessionDep, user: HRUser):
    t = session.get(HRTicket, ticket_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found.")
    if t.status == TicketStatus.answered:
        raise HTTPException(status.HTTP_409_CONFLICT, "This ticket was already answered.")
    t.status = TicketStatus.answered
    t.hr_answer = body.answer.strip()
    t.answered_by_id = user.id
    t.answered_at = datetime.now(UTC)
    session.add(t)
    log = session.get(QuestionLog, t.question_log_id)
    chat = session.get(ChatSession, log.session_id) if log and log.session_id else None
    if chat:
        chat.last_activity_at = t.answered_at  # the conversation moves up in the employee's list
        session.add(chat)
    session.commit()
    return question_reads(session, [session.get(QuestionLog, t.question_log_id)])[0]


@router.get("/assistant/stats", response_model=AssistantStats)
def stats(session: SessionDep, _: HRUser):
    """What the assistant saves HR: how many questions it settled vs. sent to HR."""
    count = lambda *where: session.exec(select(func.count()).select_from(QuestionLog).where(*where)).one()  # noqa: E731
    return AssistantStats(
        questions=count(),
        answered_by_assistant=count(QuestionLog.answered == True),  # noqa: E712
        sent_to_hr=session.exec(select(func.count()).select_from(HRTicket)).one(),
        open_tickets=session.exec(select(func.count()).select_from(HRTicket).where(HRTicket.status == TicketStatus.open)).one(),
        helpful=count(QuestionLog.helpful == True),  # noqa: E712
        not_helpful=count(QuestionLog.helpful == False),  # noqa: E712
    )
