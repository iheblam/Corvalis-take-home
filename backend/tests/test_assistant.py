"""P1 assistant: pipeline logic (fake LLM + fake retriever) and the question / HR ticket API."""

import pytest
from sqlmodel import select

from app.config import settings
from app.models import HRTicket, QuestionLog, TicketStatus
from app.rag import assistant, llm
from app.rag.assistant import Answer, answer_question, detect_language
from app.rag.chunking import load_corpus
from app.rag.retrieval import Hit
from tests.conftest import as_user

CHUNKS = {c.id: c for c in load_corpus(settings.docs_dir)}


class FakeRetriever:
    def __init__(self, ids, score=0.9):
        self.hits = [Hit(CHUNKS[i], score) for i in ids]

    def search(self, query, mode=None, top_k=None):
        return self.hits[: top_k or 3]


@pytest.fixture
def fake_llm(monkeypatch):
    calls = []

    def install(reply=None, error=False):
        def chat(system, user, schema=None):
            calls.append({"system": system, "user": user})
            if error:
                raise llm.LLMUnavailable("down")
            return reply

        monkeypatch.setattr(llm, "chat", chat)
        return calls

    return install


# ------------------------------------------------------------------ pipeline


@pytest.mark.parametrize("q,lang", [
    ("Can I take a taxi at night?", "en"),
    ("Puis-je prendre un taxi la nuit ?", "fr"),
    ("Mag ik 's nachts een taxi nemen?", "nl"),
    ("VPN?", "en"),  # no clue -> English
])
def test_detect_language(q, lang):
    assert detect_language(q) == lang


def test_answer_with_citations(fake_llm):
    calls = fake_llm("Alcohol is never reimbursed [1]. Taxis only late at night [3]. Ignore [9].")
    r = FakeRetriever(["expenses.md#meals", "expenses.md#approval", "expenses.md#travel"])
    a = answer_question("Can I expense a beer?", personal="Alice: 12 days left", retriever=r)
    assert a.answered and a.reason is None and a.language == "en"
    assert [s["id"] for s in a.sources] == ["expenses.md#meals", "expenses.md#travel"]  # [9] is not an extract
    assert [s["n"] for s in a.sources] == [1, 3]
    assert "Reply in English" in calls[0]["system"]
    assert "[1] Expense policy > Meals" in calls[0]["user"] and "Alice: 12 days left" in calls[0]["user"]


def test_reply_language_follows_the_question(fake_llm):
    calls = fake_llm("Non, l'alcool n'est jamais remboursé [1].")
    a = answer_question("L'alcool est-il remboursé ?", retriever=FakeRetriever(["expenses.md#meals"]))
    assert a.language == "fr" and "Reply in French" in calls[0]["system"]


def test_no_citation_falls_back_to_the_best_extract(fake_llm):
    fake_llm("Twenty days per year.")
    a = answer_question("Holidays?", retriever=FakeRetriever(["leave.md#annual-leave", "leave.md#sick-leave"]))
    assert [s["id"] for s in a.sources] == ["leave.md#annual-leave"]


def test_llm_says_not_found(fake_llm):
    fake_llm("NOT_FOUND")
    a = answer_question("Wat is het wifi-wachtwoord voor gasten?", retriever=FakeRetriever(["it-security.md#passwords"]))
    assert not a.answered and a.reason == "not_found" and a.language == "nl" and a.sources == []
    assert "HR" in a.text


def test_low_score_skips_the_llm(fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "retrieval_mode", "dense")
    calls = fake_llm("should not be called")
    a = answer_question("Où se trouve le parking vélo ?", retriever=FakeRetriever(["expenses.md#travel"], score=0.5))
    assert calls == [] and a.reason == "not_found" and a.language == "fr"


def test_structured_reply_not_found_even_with_polite_wording(fake_llm):
    """The model may write "the documents say nothing about pets" instead of NOT_FOUND: found=false decides."""
    fake_llm('{"found": false, "answer": "De documenten zeggen niets over huisdieren [1].", "citations": [1]}')
    a = answer_question("Mag ik mijn hond meebrengen?", retriever=FakeRetriever(["leave.md#remote-work"]))
    assert not a.answered and a.reason == "not_found" and a.language == "nl"


def test_structured_reply_found(fake_llm):
    calls = fake_llm('{"found": true, "answer": "Taxis only late at night [1].", "citations": [1, 2, 7]}')
    a = answer_question("Taxi?", retriever=FakeRetriever(["expenses.md#travel", "expenses.md#meals"]))
    assert a.answered and a.text == "Taxis only late at night [1]."
    assert [s["n"] for s in a.sources] == [1, 2]  # 7 is not an extract
    assert "Return JSON" in calls[0]["system"]


def test_llm_offline(fake_llm):
    fake_llm(error=True)
    a = answer_question("Can I take a cab?", retriever=FakeRetriever(["expenses.md#travel"]))
    assert not a.answered and a.reason == "offline" and "not available" in a.text


# ------------------------------------------------------------------ API


@pytest.fixture
def fake_answer(monkeypatch):
    seen = {}

    def install(answered=True):
        def fake(question, personal=None, retriever=None):
            seen["personal"] = personal
            if answered:
                src = {"n": 1, "id": "expenses.md#meals", "doc": "expenses.md", "doc_title": "Expense policy",
                       "section": "Meals", "text": "Alcohol is never reimbursed."}
                return Answer("No, alcohol is never reimbursed [1].", True, None, "en", [src], 1234)
            return Answer("I couldn't find this…", False, "not_found", "en", [], 50)

        monkeypatch.setattr(assistant, "answer_question", fake)
        return seen

    return install


def ask(client, user, question="Can I expense a beer?"):
    return client.post("/api/assistant/ask", json={"question": question}, headers=as_user(user))


def test_ask_is_logged_with_personal_context(client, session, people, fake_answer):
    seen = fake_answer()
    r = ask(client, people["alice"], "  Can I   expense a beer?  ")
    assert r.status_code == 201
    body = r.json()
    assert body["question"] == "Can I expense a beer?"  # whitespace cleaned
    assert body["answered"] and body["sources"][0]["section"] == "Meals" and body["ticket"] is None
    assert "20 days left" in seen["personal"] and "Manager: Max" in seen["personal"]
    assert "Alice" not in seen["personal"]  # the model must say "you", not the name
    assert session.exec(select(QuestionLog)).one().latency_ms == 1234


def test_question_validation_and_auth(client, people, fake_answer):
    fake_answer()
    assert ask(client, people["alice"], "hi").status_code == 422
    assert ask(client, people["alice"], "x" * 501).status_code == 422
    assert client.post("/api/assistant/ask", json={"question": "Can I expense a beer?"}).status_code == 401


def test_my_questions_and_feedback(client, people, fake_answer):
    fake_answer()
    qid = ask(client, people["alice"]).json()["id"]
    ask(client, people["bob"])
    mine = client.get("/api/questions", headers=as_user(people["alice"])).json()
    assert [q["id"] for q in mine] == [qid]
    assert client.get("/api/questions?scope=all", headers=as_user(people["alice"])).status_code == 403
    assert len(client.get("/api/questions?scope=all", headers=as_user(people["hr"])).json()) == 2

    url = f"/api/questions/{qid}/feedback"
    assert client.post(url, json={"helpful": False}, headers=as_user(people["alice"])).json()["helpful"] is False
    assert client.post(url, json={"helpful": True}, headers=as_user(people["bob"])).status_code == 403
    assert client.post("/api/questions/999/feedback", json={"helpful": True}, headers=as_user(people["alice"])).status_code == 404


def test_escalation_and_hr_answer_flow(client, people, fake_answer):
    fake_answer(answered=False)
    alice, hr = people["alice"], people["hr"]
    qid = ask(client, alice, "How many days of paternity leave?").json()["id"]

    url = f"/api/questions/{qid}/escalate"
    assert client.post(url, json={}, headers=as_user(people["bob"])).status_code == 403  # not his question
    r = client.post(url, json={"note": "Baby due in February"}, headers=as_user(alice))
    assert r.status_code == 201 and r.json()["ticket"]["status"] == "open"
    assert client.post(url, json={}, headers=as_user(alice)).status_code == 409  # only once

    # HR inbox
    assert client.get("/api/hr-tickets", headers=as_user(alice)).status_code == 403
    assert client.get("/api/hr-tickets", headers=as_user(people["manager"])).status_code == 403
    inbox = client.get("/api/hr-tickets?status=open", headers=as_user(hr)).json()
    assert len(inbox) == 1 and inbox[0]["ticket"]["employee_note"] == "Baby due in February"
    tid = inbox[0]["ticket"]["id"]

    answer = f"/api/hr-tickets/{tid}/answer"
    assert client.post(answer, json={"answer": "x"}, headers=as_user(hr)).status_code == 422
    assert client.post(answer, json={"answer": "15 days."}, headers=as_user(alice)).status_code == 403
    done = client.post(answer, json={"answer": "15 days, to take within 4 months."}, headers=as_user(hr)).json()
    assert done["ticket"]["status"] == "answered" and done["ticket"]["answered_by_name"] == "Hanna"
    assert client.post(answer, json={"answer": "again"}, headers=as_user(hr)).status_code == 409
    assert client.post("/api/hr-tickets/999/answer", json={"answer": "hello"}, headers=as_user(hr)).status_code == 404

    # The employee sees HR's answer under their question.
    mine = client.get("/api/questions", headers=as_user(alice)).json()[0]
    assert mine["ticket"]["hr_answer"] == "15 days, to take within 4 months."
    assert client.get("/api/hr-tickets?status=open", headers=as_user(hr)).json() == []
    assert len(client.get("/api/hr-tickets?status=answered", headers=as_user(hr)).json()) == 1


def test_stats_for_hr(client, people, fake_answer):
    fake_answer()
    q1 = ask(client, people["alice"]).json()["id"]
    fake_answer(answered=False)
    q2 = ask(client, people["bob"]).json()["id"]
    client.post(f"/api/questions/{q1}/feedback", json={"helpful": True}, headers=as_user(people["alice"]))
    client.post(f"/api/questions/{q2}/escalate", json={}, headers=as_user(people["bob"]))
    assert client.get("/api/assistant/stats", headers=as_user(people["alice"])).status_code == 403
    s = client.get("/api/assistant/stats", headers=as_user(people["hr"])).json()
    assert s == {"questions": 2, "answered_by_assistant": 1, "sent_to_hr": 1, "open_tickets": 1, "helpful": 1, "not_helpful": 0}


def test_status_reports_offline_ollama(client, monkeypatch):
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:9")  # nothing listens there
    s = client.get("/api/assistant/status").json()
    assert s["ollama"] is False and s["model_available"] is False


def test_seeded_questions_and_tickets(empty_session):
    from app.seed import seed
    from tests.conftest import TODAY

    seed(empty_session, today=TODAY)
    logs = empty_session.exec(select(QuestionLog)).all()
    tickets = empty_session.exec(select(HRTicket)).all()
    assert len(logs) == 11 and {q.language for q in logs} == {"en", "fr", "nl"}
    assert sum(t.status == TicketStatus.open for t in tickets) == 3
    assert sum(t.status == TicketStatus.answered for t in tickets) == 2
    assert all(q.sources != "[]" for q in logs if q.answered)
