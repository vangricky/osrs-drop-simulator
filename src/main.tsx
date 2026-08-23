import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GameDataProvider } from './contexts/GameDataContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameDataProvider>
      <App />
    </GameDataProvider>
  </StrictMode>,
)
