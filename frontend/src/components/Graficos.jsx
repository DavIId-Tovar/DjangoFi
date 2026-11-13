/**
 * Piezas visuales reutilizables: tarjetas de indicadores y tema de los gráficos.
 */
export const EJE = { stroke: '#5b6b7d', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }
export const REJILLA = { stroke: '#1d2733', strokeDasharray: '3 3' }
export const TOOLTIP = {
  contentStyle: { background: '#0f1620', border: '1px solid #283545', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#d7dee8', fontWeight: 600 },
  itemStyle: { padding: 0 },
  cursor: { fill: 'rgba(63,182,255,0.06)' },
}
export const COLOR_A = '#3fb6ff'
export const COLOR_B = '#b48cff'

export function Kpi({ titulo, valor, unidad, detalle, acento }) {
  return (
    <div className="kpi" style={acento ? { '--acento-kpi': acento } : undefined}>
      <span className="kpi-titulo">{titulo}</span>
      <span className="kpi-valor mono">{valor}{unidad && <small>{unidad}</small>}</span>
      {detalle && <span className="kpi-detalle">{detalle}</span>}
    </div>
  )
}

export function Panel({ titulo, subtitulo, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-titulo">
        <h3>{titulo}</h3>
        {subtitulo && <span>{subtitulo}</span>}
      </header>
      {children}
    </section>
  )
}
