/**
 * Tablero de estadísticas conectado a /api/stats/.
 *
 * Cada vez que cambia un filtro, cambia la URL -> useApi vuelve a pedir ->
 * Django recalcula TODO con aggregate/annotate sobre ese subconjunto -> se redibuja.
 * Este componente NO suma, NO promedia y NO cuenta nada: solo dibuja lo que llega.
 */
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { construirQuery } from '../api'
import { useApi } from '../hooks'
import { COLORES_RANGO, ETIQUETAS_RANGO, fmtDecimal, fmtEntero, fmtFecha } from '../formato'
import { EJE, Kpi, Panel, REJILLA, TOOLTIP } from './Graficos'

export default function Estadisticas({ filtros }) {
  const { datos, cargando, error } = useApi(`/api/stats/${construirQuery(filtros)}`)

  if (error) return <div className="alerta-error">No se pudieron calcular las estadísticas: {error}</div>
  if (!datos) return <div className="cargando-grande">Calculando agregaciones en la base de datos…</div>

  const r = datos.resumen
  const fuerte = datos.evento_mas_fuerte
  // Solo se cambia el FORMATO de la etiqueta del periodo (no se calcula nada)
  const serie = datos.serie.map((p) => ({
    ...p,
    etiqueta: datos.granularidad === 'anio' ? p.periodo.slice(0, 4) : p.periodo.slice(0, 7),
  }))
  const bandas = datos.bandas.map((b) => ({ etiqueta: b.etiqueta, total: datos.por_banda[b.clave] }))
  const rangos = datos.por_rango.map((x) => ({ ...x, nombre: ETIQUETAS_RANGO[x.rango_profundidad] }))
  const maxRegion = datos.por_region[0]?.total || 1

  return (
    <div className={`tablero ${cargando ? 'recalculando' : ''}`}>
      <div className="kpis">
        <Kpi titulo="Sismos" valor={fmtEntero(r.total)} detalle={`${fmtEntero(r.regiones)} regiones`} acento="#3fb6ff" />
        <Kpi titulo="Magnitud promedio" valor={fmtDecimal(r.magnitud_promedio)} detalle={`mín ${fmtDecimal(r.magnitud_min, 1)} · máx ${fmtDecimal(r.magnitud_max, 1)}`} />
        <Kpi titulo="Magnitud máxima" valor={fmtDecimal(r.magnitud_max, 1)} detalle={fuerte ? fuerte.lugar : '—'} acento="#e8366f" />
        <Kpi titulo="Profundidad media" valor={fmtDecimal(r.profundidad_promedio, 1)} unidad=" km" detalle={`máx ${fmtDecimal(r.profundidad_max, 0)} km`} />
        <Kpi titulo="Significancia total" valor={fmtEntero(r.significancia_total)} detalle="Σ puntaje USGS" />
        <Kpi titulo="Con alerta de tsunami" valor={fmtEntero(r.tsunamis)} detalle={`${fmtFecha(r.fecha_min, false)} → ${fmtFecha(r.fecha_max, false)}`} acento="#f5c542" />
      </div>

      <div className="rejilla-graficos">
        <Panel titulo="Actividad en el tiempo" subtitulo={`por ${datos.granularidad === 'anio' ? 'año' : 'mes'} · barras apiladas por profundidad · línea = magnitud media`} className="ancho-2">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...REJILLA} vertical={false} />
              <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: '#283545' }} minTickGap={16} />
              <YAxis yAxisId="n" tick={EJE} tickLine={false} axisLine={false} width={48} />
              <YAxis yAxisId="m" orientation="right" tick={EJE} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} />
              <Tooltip {...TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {['superficial', 'intermedio', 'profundo'].map((k) => (
                <Bar key={k} yAxisId="n" dataKey={k} name={ETIQUETAS_RANGO[k]} stackId="r" fill={COLORES_RANGO[k]} />
              ))}
              <Line yAxisId="m" type="monotone" dataKey="magnitud_promedio" name="Mag. media" stroke="#e6edf5" dot={false} strokeWidth={1.6} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Distribución por magnitud" subtitulo="COUNT(*) FILTER (WHERE …) por banda">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={bandas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...REJILLA} vertical={false} />
              <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: '#283545' }} />
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={48} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="total" name="Sismos" fill="#3fb6ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Cruce región × profundidad" subtitulo="GROUP BY región con pivote por rango (top 12)" className="ancho-2">
          <div className="tabla-scroll">
            <table className="tabla tabla-cruce">
              <thead>
                <tr>
                  <th>Región</th><th className="num">Total</th><th className="barra-col">Composición</th>
                  <th className="num">Superf.</th><th className="num">Interm.</th><th className="num">Prof.</th>
                  <th className="num">Mag. media</th><th className="num">Mag. máx</th><th className="num">Prof. media</th>
                </tr>
              </thead>
              <tbody>
                {datos.por_region.map((x) => (
                  <tr key={x.region}>
                    <td>{x.region}</td>
                    <td className="mono num">{fmtEntero(x.total)}</td>
                    <td className="barra-col">
                      <div className="barra-apilada" style={{ width: `${(x.total / maxRegion) * 100}%` }}>
                        {['superficial', 'intermedio', 'profundo'].map((k) => (
                          <i key={k} style={{ flexGrow: x[k], background: COLORES_RANGO[k] }} title={`${ETIQUETAS_RANGO[k]}: ${x[k]}`} />
                        ))}
                      </div>
                    </td>
                    <td className="mono num">{fmtEntero(x.superficial)}</td>
                    <td className="mono num">{fmtEntero(x.intermedio)}</td>
                    <td className="mono num">{fmtEntero(x.profundo)}</td>
                    <td className="mono num">{fmtDecimal(x.magnitud_promedio)}</td>
                    <td className="mono num">{fmtDecimal(x.magnitud_max, 1)}</td>
                    <td className="mono num">{fmtDecimal(x.profundidad_promedio, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel titulo="Por rango de profundidad" subtitulo="conteo y magnitud media">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rangos} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid {...REJILLA} horizontal={false} />
              <XAxis type="number" tick={EJE} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="nombre" tick={EJE} tickLine={false} axisLine={false} width={84} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="total" name="Sismos" radius={[0, 4, 4, 0]} fill="#ff7a2f" />
            </BarChart>
          </ResponsiveContainer>
          <ul className="lista-mini mono">
            {rangos.map((x) => (
              <li key={x.rango_profundidad}>
                <span style={{ color: COLORES_RANGO[x.rango_profundidad] }}>■</span> {x.nombre}:
                mag. media {fmtDecimal(x.magnitud_promedio)} · máx {fmtDecimal(x.magnitud_max, 1)} · prof. {fmtDecimal(x.profundidad_promedio, 0)} km
              </li>
            ))}
          </ul>
        </Panel>

        {fuerte && (
          <Panel titulo="Evento más fuerte del subconjunto" subtitulo="ORDER BY magnitud DESC LIMIT 1">
            <div className="evento-destacado">
              <span className="mono grande">M{fmtDecimal(fuerte.magnitud, 1)}</span>
              <div>
                <strong>{fuerte.lugar}</strong>
                <span className="mono atenuado">{fmtFecha(fuerte.fecha)} UTC · {fmtDecimal(fuerte.profundidad_km, 1)} km · {fuerte.usgs_id}</span>
              </div>
            </div>
            <h4 className="subtitulo-panel">Tipos de evento</h4>
            <ul className="lista-mini mono">
              {datos.por_tipo.map((t) => <li key={t.tipo_evento}>{t.tipo_evento}: {fmtEntero(t.total)}</li>)}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  )
}
