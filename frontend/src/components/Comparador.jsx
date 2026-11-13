/**
 * MÓDULO EXTRA — Comparador temporal sísmico.
 *
 * GET /api/comparar/?modo=decada&a=1990&b=2010&min_mag=5.5&region=Japan
 * Django devuelve las métricas de A y de B ya agregadas; aquí solo se dibujan
 * lado a lado y se muestra la variación porcentual entre los dos totales.
 */
import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { construirQuery } from '../api'
import { useApi } from '../hooks'
import { COLORES_RANGO, ETIQUETAS_RANGO, fmtDecimal, fmtEntero, fmtFecha, MESES, variacion } from '../formato'
import { COLOR_A, COLOR_B, EJE, Panel, REJILLA, TOOLTIP } from './Graficos'

const PREDETERMINADOS = { decada: { a: 1990, b: 2010 }, anio: { a: 2010, b: 2011 } }

const INDICADORES = [
  { clave: 'total', titulo: 'Sismos', formato: fmtEntero },
  { clave: 'promedio_anual', titulo: 'Sismos por año', formato: (v) => fmtDecimal(v, 1) },
  { clave: 'magnitud_promedio', titulo: 'Magnitud media', formato: (v) => fmtDecimal(v) },
  { clave: 'magnitud_max', titulo: 'Magnitud máxima', formato: (v) => fmtDecimal(v, 1) },
  { clave: 'profundidad_promedio', titulo: 'Profundidad media (km)', formato: (v) => fmtDecimal(v, 1) },
  { clave: 'tsunamis', titulo: 'Alertas de tsunami', formato: fmtEntero },
]

export default function Comparador({ opciones }) {
  const [modo, setModo] = useState('decada')
  const [a, setA] = useState(PREDETERMINADOS.decada.a)
  const [b, setB] = useState(PREDETERMINADOS.decada.b)
  const [minMag, setMinMag] = useState(5.5)
  const [region, setRegion] = useState('')

  const cambiarModo = (nuevo) => {
    setModo(nuevo)
    setA(PREDETERMINADOS[nuevo].a)
    setB(PREDETERMINADOS[nuevo].b)
  }

  const { datos, cargando, error } = useApi(`/api/comparar/${construirQuery({ modo, a, b, min_mag: minMag, region })}`)
  const periodos = modo === 'decada' ? opciones?.decadas ?? [] : opciones?.anios ?? []
  const nombre = (v) => (modo === 'decada' ? `${v}s` : String(v))

  return (
    <div className="comparador">
      <section className="panel controles-comparador">
        <div className="segmentado" role="group" aria-label="Modo de comparación">
          <button type="button" className={modo === 'anio' ? 'activo' : ''} onClick={() => cambiarModo('anio')}>Por año</button>
          <button type="button" className={modo === 'decada' ? 'activo' : ''} onClick={() => cambiarModo('decada')}>Por década</button>
        </div>
        <label className="campo campo-a">
          <span>Periodo A</span>
          <select value={a} onChange={(e) => setA(Number(e.target.value))}>
            {periodos.map((p) => <option key={p} value={p}>{nombre(p)}</option>)}
          </select>
        </label>
        <span className="vs mono">vs</span>
        <label className="campo campo-b">
          <span>Periodo B</span>
          <select value={b} onChange={(e) => setB(Number(e.target.value))}>
            {periodos.map((p) => <option key={p} value={p}>{nombre(p)}</option>)}
          </select>
        </label>
        <label className="campo">
          <span>Magnitud mínima</span>
          <input type="number" min="2.5" max="9" step="0.1" value={minMag} onChange={(e) => setMinMag(e.target.value)} />
        </label>
        <label className="campo">
          <span>Región</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Mundo</option>
            {opciones?.regiones.map((r) => <option key={r.region} value={r.region}>{r.region}</option>)}
          </select>
        </label>
        {cargando && <span className="cargando" aria-label="Cargando" />}
      </section>

      {error && <div className="alerta-error">{error}</div>}

      {datos?.advertencia ? (
        <div className="alerta-sesgo"><strong>⚠ Sesgo de completitud.</strong> {datos.advertencia}</div>
      ) : (
        <div className="metodologia">
          <strong>Metodología.</strong> Se comparan sismos M ≥ {fmtDecimal(datos?.min_mag ?? minMag, 1)}: desde 1970 la red mundial
          detecta todos los eventos de ese tamaño (umbral de completitud del catálogo). Con umbrales menores, las décadas
          antiguas parecerían más tranquilas solo porque había menos sismógrafos. Para décadas incompletas compare «sismos por año».
        </div>
      )}

      {datos && <Resultados datos={datos} modo={modo} />}
    </div>
  )
}

function Resultados({ datos, modo }) {
  const A = datos.a
  const B = datos.b
  // Reacomodar (no calcular): unir las 5 bandas de A y B en filas para el gráfico agrupado
  const bandas = datos.bandas.map((x) => ({ etiqueta: x.etiqueta, A: A.resumen[x.clave], B: B.resumen[x.clave] }))
  const rangos = ['superficial', 'intermedio', 'profundo'].map((k) => ({ nombre: ETIQUETAS_RANGO[k], clave: k, A: A.resumen[k], B: B.resumen[k] }))
  const etiquetaIndice = (i) => (modo === 'anio' ? MESES[i - 1] : `año ${i + 1}`)

  return (
    <>
      <div className="duelo">
        <CabeceraPeriodo p={A} color={COLOR_A} letra="A" />
        <div className="tabla-duelo">
          {INDICADORES.map((ind) => {
            const delta = variacion(A.resumen[ind.clave], B.resumen[ind.clave])
            return (
              <div className="fila-duelo" key={ind.clave}>
                <span className="mono valor-a">{ind.formato(A.resumen[ind.clave])}</span>
                <span className="nombre-ind">
                  {ind.titulo}
                  {delta !== null && (
                    <em className={`mono delta ${delta > 0 ? 'sube' : delta < 0 ? 'baja' : ''}`}>
                      {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {fmtDecimal(Math.abs(delta), 1)}%
                    </em>
                  )}
                </span>
                <span className="mono valor-b">{ind.formato(B.resumen[ind.clave])}</span>
              </div>
            )
          })}
        </div>
        <CabeceraPeriodo p={B} color={COLOR_B} letra="B" />
      </div>

      <div className="rejilla-graficos">
        <Panel titulo="Evolución interna" subtitulo={modo === 'anio' ? 'sismos por mes' : 'sismos por año dentro de la década'} className="ancho-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...REJILLA} vertical={false} />
              <XAxis dataKey="indice" type="number" domain={modo === 'anio' ? [1, 12] : [0, 9]} ticks={modo === 'anio' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
                tickFormatter={etiquetaIndice} tick={EJE} tickLine={false} axisLine={{ stroke: '#283545' }} allowDuplicatedCategory={false} />
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={44} />
              <Tooltip {...TOOLTIP} labelFormatter={etiquetaIndice} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line data={A.serie} dataKey="total" name={A.etiqueta} stroke={COLOR_A} strokeWidth={2} dot={{ r: 3 }} />
              <Line data={B.serie} dataKey="total" name={B.etiqueta} stroke={COLOR_B} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Bandas de magnitud" subtitulo="conteo condicional en SQL">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bandas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...REJILLA} vertical={false} />
              <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: '#283545' }} />
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={44} />
              <Tooltip {...TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="A" name={A.etiqueta} fill={COLOR_A} radius={[3, 3, 0, 0]} />
              <Bar dataKey="B" name={B.etiqueta} fill={COLOR_B} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Rango de profundidad" subtitulo="A vs B">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rangos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...REJILLA} vertical={false} />
              <XAxis dataKey="nombre" tick={EJE} tickLine={false} axisLine={{ stroke: '#283545' }} />
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={44} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="A" name={A.etiqueta} fill={COLOR_A} radius={[3, 3, 0, 0]} />
              <Bar dataKey="B" name={B.etiqueta} fill={COLOR_B} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Regiones más activas" subtitulo="top 6 de cada periodo">
          <div className="dos-columnas">
            <ListaRegiones titulo={A.etiqueta} color={COLOR_A} filas={A.top_regiones} />
            <ListaRegiones titulo={B.etiqueta} color={COLOR_B} filas={B.top_regiones} />
          </div>
        </Panel>

        <Panel titulo="Línea de tiempo por década" subtitulo="GROUP BY CAST(EXTRACT(YEAR) AS INT) / 10 * 10" className="ancho-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={datos.linea_tiempo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...REJILLA} vertical={false} />
              <XAxis dataKey="decada" tickFormatter={(d) => `${d}s`} tick={EJE} tickLine={false} axisLine={{ stroke: '#283545' }} />
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={48} />
              <Tooltip {...TOOLTIP} labelFormatter={(d) => `${d}s`} />
              <Bar dataKey="total" name="Sismos" radius={[4, 4, 0, 0]}>
                {datos.linea_tiempo.map((d) => (
                  <Cell key={d.decada} fill={
                    modo === 'decada' && d.decada === A.inicio ? COLOR_A
                      : modo === 'decada' && d.decada === B.inicio ? COLOR_B : '#2b3a4c'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="nota">Años con datos por década: {datos.linea_tiempo.map((d) => `${d.decada}s → ${d.anios_con_datos}`).join(' · ')}</p>
        </Panel>
      </div>
    </>
  )
}

function CabeceraPeriodo({ p, color, letra }) {
  const f = p.evento_mas_fuerte
  return (
    <div className="cabecera-periodo" style={{ '--color-periodo': color }}>
      <span className="letra mono">{letra}</span>
      <span className="nombre-periodo mono">{p.etiqueta}</span>
      <span className="atenuado">{p.resumen.anios_con_datos} años con datos</span>
      {f && (
        <div className="mini-evento">
          <span className="mono">M{fmtDecimal(f.magnitud, 1)}</span>
          <small>{f.lugar}<br /><span className="mono">{fmtFecha(f.fecha, false)}</span></small>
        </div>
      )}
      <div className="mini-rangos">
        {['superficial', 'intermedio', 'profundo'].map((k) => (
          <i key={k} style={{ flexGrow: p.resumen[k] || 0, background: COLORES_RANGO[k] }} title={`${ETIQUETAS_RANGO[k]}: ${p.resumen[k]}`} />
        ))}
      </div>
    </div>
  )
}

function ListaRegiones({ titulo, color, filas }) {
  return (
    <div>
      <h4 className="mono" style={{ color }}>{titulo}</h4>
      <ol className="ranking">
        {filas.map((f) => (
          <li key={f.region}><span>{f.region}</span><span className="mono">{fmtEntero(f.total)}</span></li>
        ))}
      </ol>
    </div>
  )
}
