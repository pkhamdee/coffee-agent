import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import BaristaDashboard from './pages/BaristaDashboard.tsx'
import SetupPage from './pages/SetupPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/barista" element={<BaristaDashboard />} />
        <Route path="/setup" element={<SetupPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
