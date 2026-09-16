import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import App from './App.tsx'
import { initializeAppearance } from './settings/appearance'
import { initializeTappingPrecision } from './settings/tappingPrecision'
import { preloadDestination } from './navigation/routeModules'

initializeAppearance()
initializeTappingPrecision()
void preloadDestination(window.location.pathname)
// Data router supplies navigation blocking for unsaved editor changes.
const router = createBrowserRouter([{ path: '*', element: <App /> }])
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
