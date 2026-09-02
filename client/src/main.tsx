import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './auth/useSession.js'
import { SignupPage } from './routes/SignupPage.js'
import { LoginPage } from './routes/LoginPage.js'
import { ProjectListPage } from './routes/ProjectListPage.js'
import { BoardPage } from './routes/BoardPage.js'
import { TicketPage } from './routes/TicketPage.js'

function App() {
  const { user, loading, refresh } = useSession()

  if (loading) return <p>Loading...</p>

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage onDone={refresh} />} />
        <Route path="/login" element={<LoginPage onDone={refresh} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<ProjectListPage user={user} onSignOut={refresh} />} />
      <Route path="/projects/:id" element={<BoardPage />} />
      <Route path="/tickets/:id" element={<TicketPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </StrictMode>,
)
