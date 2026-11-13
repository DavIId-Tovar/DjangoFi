/**
 * Componente raíz. Tiene el ESTADO COMPARTIDO de la aplicación:
 *  - qué vista está activa (pestañas)
 *  - los filtros (los usan el Explorador y las Estadísticas: mismo subconjunto)
 *  - el usuario autenticado
 * y se lo pasa a cada vista por "props".
 */
import { useEffect, useMemo, useState } from 'react'
import { sesion } from './api'
import { useApi, useDebounce } from './hooks'
import { fmtEntero } from './formato'
import Filtros, { FILTROS_INICIALES } from './components/Filtros'
import Explorador from './components/Explorador'
import Estadisticas from './components/Estadisticas'
import Comparador from './components/Comparador'
import Operaciones from './components/Operaciones'

const VISTAS = [
  { id: 'explorador', nombre: 'Explorador' },
  { id: 'estadisticas', nombre: 'Estadísticas' },
  { id: 'comparador', nombre: 'Comparador' },
  { id: 'operaciones', nombre: 'Operaciones' },
]

// La vista activa se guarda en la URL (#estadisticas): se puede recargar o compartir.
const vistaDesdeHash = () => {
  const id = window.location.hash.replace('#', '')
  return VISTAS.some((v) => v.id === id) ? id : 'explorador'
}

export default function App() {
  const [vista, setVista] = useState(vistaDesdeHash)
  const [filtros, setFiltros] = useState(FILTROS_INICIALES)
  const [usuario, setUsuario] = useState(sesion.usuario)
  const opciones = useApi('/api/opciones/')

  useEffect(() => {
    const alCambiar = () => setVista(vistaDesdeHash())
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  // El texto de búsqueda espera 400 ms sin cambios antes de consultar.
  const busqueda = useDebounce(filtros.search, 400)
  const filtrosEfectivos = useMemo(() => ({ ...filtros, search: busqueda.trim() }), [filtros, busqueda])

  const conFiltros = vista === 'explorador' || vista === 'estadisticas'

  return (
    <div className="app">
      <header className="barra">
        <div className="marca">
          <span className="pulso" aria-hidden="true" />
          <div>
            <strong>SISMOS<span className="punto">·</span>OBS</strong>
            <small>Observatorio sísmico · catálogo USGS</small>
          </div>
        </div>
        <nav className="pestanas" aria-label="Vistas">
          {VISTAS.map((v) => (
            <a key={v.id} href={`#${v.id}`} className={vista === v.id ? 'activa' : ''}>{v.nombre}</a>
          ))}
        </nav>
        <div className="estado-barra">
          <span className="chip mono" title="Registros en la base de datos">
            {opciones.datos ? fmtEntero(opciones.datos.total) : '···'} registros
          </span>
          <a href="#operaciones" className={`chip ${usuario ? 'chip-ok' : 'chip-lock'}`}>
            {usuario ? `● ${usuario}` : '🔒 Sin sesión'}
          </a>
        </div>
      </header>

      <div className={conFiltros ? 'cuerpo con-filtros' : 'cuerpo'}>
        {conFiltros && (
          <Filtros filtros={filtros} setFiltros={setFiltros} opciones={opciones.datos} />
        )}
        <main className="contenido">
          {vista === 'explorador' && <Explorador filtros={filtrosEfectivos} />}
          {vista === 'estadisticas' && <Estadisticas filtros={filtrosEfectivos} />}
          {vista === 'comparador' && <Comparador opciones={opciones.datos} />}
          {vista === 'operaciones' && <Operaciones usuario={usuario} setUsuario={setUsuario} />}
        </main>
      </div>

      <footer className="pie">
        Fuente: USGS Earthquake Catalog (FDSN Event Web Service) · Fechas en UTC ·
        Django REST Framework + React
      </footer>
    </div>
  )
}
