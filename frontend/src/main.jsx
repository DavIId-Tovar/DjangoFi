/**
 * Punto de arranque: busca <div id="root"> en index.html y monta <App /> dentro.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css' // estilos base del mapa
import './styles.css'             // nuestro diseño
import App from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
