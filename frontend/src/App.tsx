import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { GuideProvider } from './components/Guide'
import { Layout } from './components/Layout'
import { ErrorBox, Loading } from './components/ui'
import { canApprove, CurrentUserProvider, useCurrentUser } from './context/CurrentUser'
import { Approvals } from './pages/Approvals'
import { Availability } from './pages/Availability'
import { MyRequests } from './pages/MyRequests'
import { Overview } from './pages/Overview'
import { RequestLeave } from './pages/RequestLeave'
import { TeamCalendar } from './pages/TeamCalendar'
import { Welcome } from './pages/Welcome'

function Shell() {
  const { user, loading, error } = useCurrentUser()
  if (loading) return <div className="mx-auto max-w-xl p-10"><Loading /></div>
  if (error) return <div className="mx-auto max-w-xl p-10"><ErrorBox message={error} onRetry={() => location.reload()} /></div>
  if (!user) return <Welcome />

  return (
    <GuideProvider>
    <Layout>
      {/* key: every page reloads its data when you switch user */}
      <Routes key={user.id}>
        <Route path="/" element={<Overview />} />
        <Route path="/request" element={<RequestLeave />} />
        <Route path="/my-requests" element={<MyRequests />} />
        <Route path="/calendar" element={<TeamCalendar />} />
        <Route path="/availability" element={<Availability />} />
        {canApprove(user) && <Route path="/approvals" element={<Approvals />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    </GuideProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <CurrentUserProvider>
        <Shell />
      </CurrentUserProvider>
    </BrowserRouter>
  )
}
