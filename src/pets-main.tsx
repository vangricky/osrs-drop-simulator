import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PetSimApp from './PetSimApp.tsx'
import { GameDataProvider } from './contexts/GameDataContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameDataProvider>
      <PetSimApp />
    </GameDataProvider>
  </StrictMode>,
)
