import React, { useState } from 'react'
import AdminDashboard from './components/AdminDashboard'
import HealthAssistant from './components/HealthAssistant'
import './App.css'

function App() {
  const [view, setView] = useState('assistant')

  return (
    <div className="App">
      <nav className="app-nav">
        <button
          type="button"
          className={view === 'assistant' ? 'active' : ''}
          onClick={() => setView('assistant')}
        >
          Health Assistant
        </button>
        <button
          type="button"
          className={view === 'admin' ? 'active' : ''}
          onClick={() => setView('admin')}
        >
          Admin Panel
        </button>
      </nav>
      {view === 'assistant' ? <HealthAssistant /> : <AdminDashboard />}
    </div>
  )
}

export default App
