import { useState } from 'react'
import { useCurrentUser } from '../context/CurrentUser'
import { DEPARTMENT_LABEL } from '../labels'
import { Avatar, Button } from '../components/ui'

/** Shown when nobody is selected. Stands in for the company login (SSO) in this demo. */
export function Welcome() {
  const { employees, switchUser } = useCurrentUser()
  const [other, setOther] = useState('')

  const pick = (name: string) => employees.find((e) => e.full_name === name)
  const suggestions = [
    { who: pick('Camille Leroy'), as: 'an engineer', hint: 'Request leave and see your balance.' },
    { who: pick('Sophie Lambert'), as: 'a manager', hint: 'Approve your team’s requests.' },
    { who: pick('Nathalie Claes'), as: 'HR', hint: 'See everyone, follow sick leave.' },
  ].filter((s) => s.who)

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            C
          </span>
          <h1 className="text-2xl font-semibold">Corvalis · Leave & availability</h1>
          <p className="mt-2 text-slate-600">Who are you? (In the real app this comes from your company login.)</p>
        </div>

        <div className="space-y-3">
          {suggestions.map(({ who, as, hint }) => (
            <button
              key={who!.id}
              onClick={() => switchUser(who!.id)}
              className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
            >
              <Avatar name={who!.full_name} />
              <span className="flex-1">
                <span className="block font-medium">
                  {who!.full_name} <span className="font-normal text-slate-500">— {as}</span>
                </span>
                <span className="block text-sm text-slate-500">
                  {who!.job_title} · {hint}
                </span>
              </span>
              <span className="text-blue-600">→</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
            Or someone else
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            >
              <option value="">Choose a colleague…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} — {e.job_title}, {DEPARTMENT_LABEL[e.department]}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!other} onClick={() => switchUser(Number(other))}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
