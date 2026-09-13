import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { initializeAppearance } from './settings/appearance'
import { initializeTappingPrecision } from './settings/tappingPrecision'

initializeAppearance()
initializeTappingPrecision()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
