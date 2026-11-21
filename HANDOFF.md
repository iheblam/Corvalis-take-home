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
- [x] `models.py`: Employee, LeaveAllowance, LeaveRequest, PublicHoliday (+ enums). Timestamps stored in UTC (SQLModel requires tz-aware datetimes).
- [x] `services/workdays.py`: Belgian holidays (Easter-based), Sunday replacement day = next working day, working-day count
- [x] `services/leave_rules.py`: balance (carry-over only covers days ≤ 31 Mar), validation (errors + warnings), permissions
- [x] `deps.py`: current user from `X-User-Id`
- [x] Routers: employees (+ balance), leave-requests (list scopes mine/team/to_approve/all, preview, create, approve, reject with reason, cancel, certificate), calendar + availability + holidays (one file: `routers/calendar.py`); `presenters.py` hides sick reason from colleagues ("away")
- [x] `seed.py`: 50 employees (3/18/14/5/10) with managers, holidays prev/current/next year, ~340 requests generated around today (fixed random seed). Reset: `uv run python -m app.seed --reset`
- [x] Tests: 16 passing (workdays, leave rules, API flow, permissions, privacy)

## 2. Frontend: leave (1:00–2:00)
- [x] Layout, nav (Approvals tab + pending badge for managers/HR), user switcher (`X-User-Id`), Welcome screen ("who are you?" with engineer / manager / HR shortcuts), API client + `useApi` hook + types
- [x] Overview: greeting, holiday balance card (carry-over warning), my upcoming leave, "out of the office this week" (my department / everyone), banner for pending approvals
- [x] Request leave: type cards with policy hints, dates, note, live preview (working days, ⛔ errors, ℹ️ warnings), "Good to know" from leave.md
- [x] My requests: upcoming / past / all, decision + note, certificate status, cancel
- [x] Approvals: approve, refuse with required reason, "also away" hint per request; HR: medical certificates to collect (shown first)
- [x] Team calendar: month grid, department / office filters, only-absent toggle, holidays & weekends shaded, pending = light colour
- [x] Who's available: day + shortcuts, department / office / name filters → available / working from home / away (back on …)
- [x] "How to use the app" guide: opens once automatically (remembered in the browser), then any time from the ? Help icon in the header. "I want to…" quick finder + one section per page (steps, badges/legend, tips, "Go to" button); same icons in the nav and in the guide; keyboard ←/→/Esc; full-screen on phones
- [x] Spotlight tour (`Tour.tsx`, `tourSteps.ts`): "Show me around" (25 steps for HR, fewer for others), "Show me on screen" per section, and every "I want to…" shortcut opens the right page and circles the real element (`data-tour` markers) while the rest is dimmed + blurred; steps missing on screen (e.g. nothing to approve) are skipped. Verified all 25 steps find their element.
- [x] Tested in the browser as engineer → manager → HR (request, approve, refuse, calendar, availability, certificates) + phone width. No console errors.

## 2b. Quality gate before the assistant (validated)
- [x] Backend hardening: cancel/decide on someone else's request → 403 (was 409); readable 422 messages; security headers (nosniff, DENY framing, no-referrer, no-store on /api); CORS limited to the frontend origin, GET/POST, `Content-Type` + `X-User-Id`; requests > 2 years ahead refused
- [x] pytest: **82 tests**: employees, leave (create/preview/list scopes/filters/approve/reject/cancel/certificate), calendar & availability, holidays, security (anonymous → 401 on every protected route, cross-role → 403, injection strings → 422, CORS, headers), seed integrity (org chart, no overlaps, remote rules, nobody over allowance), persistence after restart (file DB reopened)
- [x] Bugs found by the new tests and fixed: "Thursday and Tuesday" word order; `?department=__proto__` accepted by the URL parser
- [x] Search & filters: accent-insensitive multi-word search (name, job, department, office), same search box on calendar + availability, filters synced to the URL (survive refresh / back / shareable link), invalid URL values fall back to defaults, "Clear filters"
- [x] Forbidden page: `/approvals` for non-approvers shows a "managers and HR only" page; backend refuses the same calls (403)
- [x] Vitest: **13 tests** (search, URL parsers, tour targets exist in the code); `npm run build` OK; oxlint 0 errors (8 style warnings)
- [x] Browser end-to-end: search results identical to the same filter on raw API data; URL ↔ search box ↔ counts in sync; reload keeps filters; garbage URL → defaults; engineer on /approvals blocked in UI and API

## 3. Assistant: P1 (2:00–2:50)
- [x] `.env`: `OLLAMA_MODEL=qwen3.5:4b`, `EMBEDDING_MODEL`, `RERANKER_MODEL`, `RETRIEVAL_MODE`, `RETRIEVAL_TOP_K`, `RERANK_CANDIDATES`, `RETRIEVAL_MIN_SCORE`, `MODELS_CACHE_DIR` (models in `backend/data/models`, gitignored)
- [x] Chunking (`app/rag/chunking.py`): one chunk per `##` section, prefixed "Document > Section" → 21 chunks; regex handling of CRLF/BOM, intro text, `###`, empty/duplicate sections, long sections, markdown noise
- [x] BM25 (`rank_bm25`) with regex tokenizer for EN/FR/NL (`app/rag/text.py`): accents, elisions, `2,500`/`2.500`/`4 000`, `€`, stop-words, light plural stripping
- [x] Dense (fastembed, CPU) + multilingual cross-encoder reranker (fastembed, CPU) + hybrid RRF (`app/rag/retrieval.py`), 6 modes behind one `search()`
- [x] Evaluation (`app/rag/evaluate.py`): 50 labelled questions (21 EN / 18 FR / 11 NL) + 12 off-topic; Hit@1/3, MRR, latency, answerability AUC; 6 modes × 2 embedding models + reranker candidate sweep
- [x] **Report: `reports/rag-evaluation.md` → dense `multilingual-e5-large`, no reranker: 100% top-1 in EN/FR/NL, ~46 ms; BM25 fails across languages (FR 33%, NL 18%); hybrid hurts on this small corpus; reranker best at 5 candidates (lighter alternative)**
- [x] Tests: `tests/test_rag.py` (20 tests: chunker edge cases, tokenizer, BM25, every mode, accuracy regression ≥95% per language, off-topic gate) → backend total 102 passing
- [ ] Models: QuestionLog, HRTicket
- [ ] Generation: prompt with the 3 extracts + sources, answer in the question's language, "not in the documents" → offer HR ticket; Ollama call
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
- uv was not on the machine: installed with `py -m pip install --user uv` (binary in `%APPDATA%\Python\Python314\Scripts`, not on PATH). `uv python install 3.12` failed on a Windows link error, so `uv sync --python <path to downloaded 3.12 python.exe>` was used once; afterwards plain `uv sync` / `uv run` work.
