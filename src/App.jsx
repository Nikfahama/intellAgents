import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { IntelProvider } from './contexts/IntelContext'
import Layout from './components/Layout'
import PopoutLayout from './components/PopoutLayout'
import Dashboard from './pages/Dashboard'
import Feed from './pages/Feed'
import MapView from './pages/MapView'
import GlobeView from './pages/GlobeView'
import Flow from './pages/Flow'

function App() {
  return (
    <ThemeProvider>
      <IntelProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/map" element={<MapView />} />
              <Route path="/globe" element={<GlobeView />} />
              <Route path="/flow" element={<Flow />} />
            </Route>
            <Route element={<PopoutLayout />}>
              <Route path="/map-popout" element={<MapView popout />} />
              <Route path="/globe-popout" element={<GlobeView popout />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </IntelProvider>
    </ThemeProvider>
  )
}

export default App
