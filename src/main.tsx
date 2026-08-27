import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { site } from './site'
import { applySiteTheme } from './themes'

document.title = site.siteTitle
document.querySelector('meta[name="description"]')?.setAttribute('content', site.description)
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', site.themeColor)
applySiteTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
