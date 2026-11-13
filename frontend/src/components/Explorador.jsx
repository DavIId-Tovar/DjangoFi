/**
 * Vista Explorador: mapa + tabla paginada DESDE EL SERVIDOR.
 *
 * Hace dos peticiones con los mismos filtros:
 *   GET /api/sismos/?<filtros>&ordering=-magnitud&page=3&page_size=25  -> tabla
 *   GET /api/mapa/?<filtros>                                           -> puntos del mapa
 */
import { useState } from 'react'
import { construirQuery } from '../api'
import { useApi } from '../hooks'
import { claseMagnitud, colorProfundidad, ETIQUETAS_RANGO, fmtDecimal, fmtEntero, fmtFecha } from '../formato'
import Mapa from './Mapa'

const COLUMNAS = [
  { clave: 'magnitud', titulo: 'Mag', ordenable: true },
  { clave: 'lugar', titulo: 'Lugar', ordenable: false },
  { clave: 'region', titulo: 'Región', ordenable: true },
  { clave: 'profundidad_km', titulo: 'Prof. km', ordenable: true },
  { clave: 'rango', titulo: 'Rango', ordenable: false },
  { clave: 'fecha', titulo: 'Fecha UTC', ordenable: true },
  { clave: 'significancia', titulo: 'Sig.', ordenable: true },
]

export default function Explorador({ filtros }) {
  const [orden, setOrden] = useState('-fecha')
  const [tamano, setTamano] = useState(25)
  const [seleccionado, setSeleccionado] = useState(null)

  // Truco: la página se guarda junto con la "huella" de los filtros. Si los
  // filtros cambian, la huella ya no coincide y la página vuelve a 1 sola.
  const huella = JSON.stringify(filtros) + orden + tamano
  const [paginaGuardada, setPaginaGuardada] = useState({ huella, n: 1 })
  const pagina = paginaGuardada.huella === huella ? paginaGuardada.n : 1
  const irA = (n) => setPaginaGuardada({ huella, n })

  const lista = useApi(`/api/sismos/${construirQuery({ ...filtros, ordering: orden, page: pagina, page_size: tamano })}`)
  const mapa = useApi(`/api/mapa/${construirQuery(filtros)}`)
  const d = lista.datos

  const ordenarPor = (clave) => {
    // Primer clic: descendente; segundo clic en la misma columna: ascendente.
    setOrden((actual) => (actual === `-${clave}` ? clave : `-${clave}`))
  }
  const flecha = (clave) => (orden === clave ? ' ▲' : orden === `-${clave}` ? ' ▼' : '')

  const seleccionarFila = (s) =>
    setSeleccionado({ id: s.id, lat: s.latitud, lon: s.longitud, mag: s.magnitud, prof: s.profundidad_km, lugar: s.lugar, fecha: s.fecha, url: s.url })

  return (
    <div className="explorador">
      <Mapa datos={mapa.datos} cargando={mapa.cargando} seleccionado={seleccionado} onSeleccionar={setSeleccionado} />

      <section className="panel">
        <div className="panel-cabecera">
          <div>
            <span className="conteo mono">{d ? fmtEntero(d.count) : '···'}</span>
            <span className="atenuado"> sismos cumplen el criterio</span>
            {lista.cargando && <span className="cargando" aria-label="Cargando" />}
          </div>
          <label className="en-linea">
            Filas
            <select value={tamano} onChange={(e) => setTamano(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        {lista.error && <div className="alerta-error">No se pudo cargar el listado: {lista.error}</div>}

        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                {COLUMNAS.map((c) => (
                  <th key={c.clave} className={c.ordenable ? 'ordenable' : ''} onClick={c.ordenable ? () => ordenarPor(c.clave) : undefined}
                    aria-sort={orden === c.clave ? 'ascending' : orden === `-${c.clave}` ? 'descending' : undefined}>
                    {c.titulo}{flecha(c.clave)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d?.results.map((s) => (
                <tr key={s.id} onClick={() => seleccionarFila(s)} className={seleccionado?.id === s.id ? 'fila-activa' : ''}>
                  <td><span className={claseMagnitud(s.magnitud)}>{fmtDecimal(s.magnitud, 1)}</span></td>
                  <td className="lugar">
                    {s.lugar}
                    {s.tsunami && <span className="etiqueta etiqueta-tsunami">tsunami</span>}
                    {s.alerta && <span className={`etiqueta alerta-${s.alerta}`}>{s.alerta}</span>}
                  </td>
                  <td>{s.region}</td>
                  <td className="mono num">{fmtDecimal(s.profundidad_km, 1)}</td>
                  <td><span className="punto-rango" style={{ background: colorProfundidad(s.profundidad_km) }} />{ETIQUETAS_RANGO[s.rango_profundidad]}</td>
                  <td className="mono">{fmtFecha(s.fecha)}</td>
                  <td className="mono num">{fmtEntero(s.significancia)}</td>
                </tr>
              ))}
              {d && d.results.length === 0 && (
                <tr><td colSpan={COLUMNAS.length} className="vacio">Ningún sismo cumple estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {d && d.total_paginas > 1 && (
          <Paginador pagina={d.pagina} total={d.total_paginas} irA={irA} />
        )}
      </section>
    </div>
  )
}

function Paginador({ pagina, total, irA }) {
  // Números visibles: 1 … (p-2..p+2) … total
  const visibles = [...new Set([1, pagina - 2, pagina - 1, pagina, pagina + 1, pagina + 2, total])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)
  return (
    <nav className="paginador mono" aria-label="Paginación">
      <button type="button" disabled={pagina === 1} onClick={() => irA(pagina - 1)}>‹</button>
      {visibles.map((n, i) => (
        <span key={n}>
          {i > 0 && n - visibles[i - 1] > 1 && <span className="hueco">…</span>}
          <button type="button" className={n === pagina ? 'actual' : ''} onClick={() => irA(n)}>{fmtEntero(n)}</button>
        </span>
      ))}
      <button type="button" disabled={pagina === total} onClick={() => irA(pagina + 1)}>›</button>
      <span className="atenuado">página {fmtEntero(pagina)} de {fmtEntero(total)}</span>
    </nav>
  )
}
