import { useEffect, useState } from 'react'

// Placeholder shell: checks that the frontend can reach the backend through the Vite proxy.
// Replaced by the real layout and routes in the frontend step.
export default function App() {
  const [status, setStatus] = useState('checking…')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { status: string }) => setStatus(d.status))
      .catch(() => setStatus('backend not reachable'))
  }, [])

  return (
    <main className="mx-auto max-w-xl p-10">
      <h1 className="text-2xl font-semibold">Corvalis · Leave &amp; availability</h1>
      <p className="mt-2 text-slate-600">
        Backend: <span className="font-mono">{status}</span>
      </p>
    </main>
  )
}
