import { initializeFocusVisibility } from "./ui/focusVisibility";
import { initializeSoundPreferences } from "./settings/soundPreferences";
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./query/queryClient"
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import App from './App.tsx'
import { initializeAppearance } from './settings/appearance'
import { initializeTappingPrecision } from './settings/tappingPrecision'
import { preloadDestination } from './navigation/routeModules'

const disposeFocusVisibility = initializeFocusVisibility(document)
if (import.meta.hot) import.meta.hot.dispose(disposeFocusVisibility)

initializeAppearance()
initializeTappingPrecision()
initializeSoundPreferences()
void preloadDestination(window.location.pathname)
// Data router supplies navigation blocking for unsaved editor changes.
const router = createBrowserRouter([{ path: '*', element: <App /> }])
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
  </StrictMode>,
)
