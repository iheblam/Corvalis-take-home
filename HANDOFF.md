# HANDOFF: progress tracker

Tick each task as it is done (`[x]`) and add a one-line note if something changed from the plan.
Time budget: ~3h, 4h max. Started: 2026-11-21.

## Scope (validated)
- **P8 Leave & availability** (main app): request / approve leave, balances, team calendar, "who's available" for site visits.
- **P1 Internal rules assistant**: local RAG over `docs/*.md` with Ollama (`qwen3.5:4b`) + HR ticket escalation.
- Stack: FastAPI + SQLModel + SQLite (Python 3.12 via uv) · React + Vite + TS + Tailwind v4.
- Out of scope: real login/SSO (user switcher instead), half days, part-time pro-rata, notifications, Outlook sync, Excel import/export.

## 0. Setup (0:00–0:15)
- [x] Project folder, policies copied to `docs/`
- [x] Frontend scaffold: Vite + React 19 + TS, Tailwind v4 (`@tailwindcss/vite`), react-router, date-fns, `/api` proxy
- [x] Backend skeleton: `pyproject.toml` (py 3.12), `config.py` (.env), `db.py`, `main.py` with `/api/health`
- [x] `.gitignore`, `.env.example` (backend + frontend), `HANDOFF.md`, README outline
- [x] uv installed (via pip), `uv sync` OK on Python 3.12.16, `/api/health` returns ok, frontend builds
- [x] Git repo created (github.com/iheblam/Corvalis-take-home) + first commit pushed

## 1. Backend: leave (0:15–1:00)
- [ ] `models.py`: Employee, LeaveAllowance, LeaveRequest, PublicHoliday (+ enums)
- [ ] `services/workdays.py`: Belgian holidays (Easter-based), Sunday replacement day, working-day count
- [ ] `services/leave_rules.py`: balance (carry-over until 31 Mar), validation, permissions
- [ ] `deps.py`: current user from `X-User-Id`
- [ ] Routers: employees, leave-requests (+ preview / approve / reject / cancel / certificate), calendar, availability, holidays
- [ ] `seed.py`: 50 employees (3/18/14/5/10), holidays 2026–2027, ~100 requests
- [ ] Tests: workdays, leave rules, API happy path + error cases

## 2. Frontend: leave (1:00–2:00)
- [ ] Layout, nav, user switcher (`X-User-Id`), API client + types
- [ ] Home: who's out today / this week, my balance, my pending
- [ ] Request leave: form + live preview (days, warnings, errors)
- [ ] My requests (cancel)
- [ ] Approvals (manager / HR): approve, reject with note, certificate received
- [ ] Team calendar: month grid, filter by department / office
- [ ] Who's available: date + department / office → available / absent / remote

## 3. Assistant: P1 (2:00–2:50)
- [ ] Models: QuestionLog, HRTicket
- [ ] RAG pipeline (design to be discussed): chunk docs → retrieve → Ollama answer with sources
- [ ] Endpoints: ask, feedback, my questions, escalate, HR tickets list / answer
- [ ] Pages: Ask the rules (+ My questions), HR inbox
- [ ] Graceful message when Ollama is not running
- [ ] Seed: ~10 questions, 3 open + 2 answered tickets

## 4. Finish (2:50–3:30)
- [ ] Empty / loading / error states, responsive check
- [ ] README: problem & why, how to run, what works, what doesn't, what's next
- [ ] 2–3 min recording
- [ ] Export AI conversations

## Decisions log
- No auth: header user switcher, documented as a demo stand-in for SSO.
- Balance is computed, never stored; pending annual days count as reserved.
- Sick leave auto-approved; certificate required when > 1 working day.
- Remote work: max 2 days/week, never Tue/Thu (team days), needs approval.
- One HR ticket per question (`question_log_id` unique).

## Notes / issues
- uv was not on the machine: installed with `py -m pip install --user uv` (binary in `%APPDATA%PythonPython314Scripts`, not on PATH). `uv python install 3.12` failed on a Windows link error, so `uv sync --python <path to downloaded 3.12 python.exe>` was used once; afterwards plain `uv sync` / `uv run` work.
