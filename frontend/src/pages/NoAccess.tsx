import { Link } from 'react-router'
import { useUser } from '../context/CurrentUser'

/** Shown when someone opens a page their role does not allow (e.g. /approvals as an engineer). */
export function NoAccess() {
  const user = useUser()
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl" aria-hidden>🔒</span>
      <h1 className="text-xl font-semibold">This page is for managers and HR</h1>
      <p className="mt-2 text-slate-600">
        {user.full_name.split(' ')[0]}, you don’t have anyone to approve.
        {user.manager_name && ` Your requests are approved by ${user.manager_name}.`}
      </p>
      <Link to="/" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Back to the overview
      </Link>
    </div>
  )
}
