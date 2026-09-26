import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let isReloadingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloadingForUpdate) return
    isReloadingForUpdate = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => registration.update())
  })
}
