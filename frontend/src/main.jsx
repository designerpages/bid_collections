import React, { useMemo } from 'react'
import ReactDOM from 'react-dom'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { DpEmbedContext, readWindowDpBidCollectionsContext } from './context/DpEmbedContext'

function StandaloneRoot() {
  const embed = useMemo(() => readWindowDpBidCollectionsContext(), [])
  return (
    <DpEmbedContext.Provider value={embed}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </DpEmbedContext.Provider>
  )
}

// React 17: `react-dom/client` is React 18+ only.
ReactDOM.render(
  <React.StrictMode>
    <StandaloneRoot />
  </React.StrictMode>,
  document.getElementById('root')
)
