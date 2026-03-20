import { StrictMode } from 'react'

import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.tsx'
import './refresh-trigger.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
