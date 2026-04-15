import React, { useMemo } from 'react'
import ReactDOM from 'react-dom'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import stylesText from './styles.css?inline'
import { DpEmbedContext, readWindowDpBidCollectionsContext } from './context/DpEmbedContext'
import ShadowRoot from './components/ShadowRoot'

function StandaloneRoot() {
  const embed = useMemo(() => readWindowDpBidCollectionsContext(), [])
  return (
    <ShadowRoot stylesText={stylesText}>
      <DpEmbedContext.Provider value={embed}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DpEmbedContext.Provider>
    </ShadowRoot>
  )
}

// React 17: `react-dom/client` is React 18+ only.
ReactDOM.render(
  <React.StrictMode>
    <StandaloneRoot />
  </React.StrictMode>,
  document.getElementById('root')
)
