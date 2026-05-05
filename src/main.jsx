// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/UI/ErrorBoundary'
import { AlbumPage } from './components/Album/AlbumPage'
import { ThemeProvider } from './contexts/ThemeContext'

const albumCode = new URLSearchParams(window.location.search).get('album')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {albumCode
        ? <ThemeProvider><AlbumPage albumCode={albumCode} /></ThemeProvider>
        : <App />
      }
    </ErrorBoundary>
  </StrictMode>
)
