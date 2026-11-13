/**
 * Panel lateral de filtros. Cada control cambia UNA clave del objeto `filtros`
 * (que vive en App). Ese objeto se convierte luego en la query string:
 *   {region: "Chile", mag_min: "6"}  ->  /api/sismos/?region=Chile&mag_min=6
 * Los nombres de las claves son EXACTAMENTE los de sismos/filters.py en Django.
 */
import { fmtEntero } from '../formato'

export const FILTROS_INICIALES = {
  search: '', region: '', rango_profundidad: '', mag_min: '', mag_max: '',
  prof_min: '', prof_max: '', fecha_desde: '', fecha_hasta: '', anio: '',
  tipo_evento: '', alerta: '', tsunami: '',
}

export default function Filtros({ filtros, setFiltros, opciones }) {
  // "Setter" genérico: cambiar('region') devuelve la función para el onChange.
  const cambiar = (clave) => (e) => setFiltros((f) => ({ ...f, [clave]: e.target.value }))
  const activos = Object.entries(filtros).filter(([, v]) => v !== '').length

  return (
    <aside className="filtros" aria-label="Filtros">
      <div className="filtros-cabecera">
        <h2>Filtros</h2>
        {activos > 0 && <span className="chip chip-acento mono">{activos} activos</span>}
      </div>

      <label className="campo">
        <span>Búsqueda libre</span>
        <input type="search" placeholder="Lugar, región o ID USGS…" value={filtros.search} onChange={cambiar('search')} />
      </label>

      <label className="campo">
        <span>Región</span>
        <select value={filtros.region} onChange={cambiar('region')}>
          <option value="">Todas</option>
          {opciones?.regiones.map((r) => (
            <option key={r.region} value={r.region}>{r.region} ({fmtEntero(r.total)})</option>
          ))}
        </select>
      </label>

      <fieldset className="campo-doble">
        <legend>Magnitud</legend>
        <input type="number" step="0.1" min="0" max="10" placeholder="mín" value={filtros.mag_min} onChange={cambiar('mag_min')} aria-label="Magnitud mínima" />
        <input type="number" step="0.1" min="0" max="10" placeholder="máx" value={filtros.mag_max} onChange={cambiar('mag_max')} aria-label="Magnitud máxima" />
      </fieldset>

      <label className="campo">
        <span>Rango de profundidad</span>
        <select value={filtros.rango_profundidad} onChange={cambiar('rango_profundidad')}>
          <option value="">Todos</option>
          {opciones?.rangos.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
        </select>
      </label>

      <fieldset className="campo-doble">
        <legend>Profundidad (km)</legend>
        <input type="number" min="-10" max="800" placeholder="mín" value={filtros.prof_min} onChange={cambiar('prof_min')} aria-label="Profundidad mínima" />
        <input type="number" min="-10" max="800" placeholder="máx" value={filtros.prof_max} onChange={cambiar('prof_max')} aria-label="Profundidad máxima" />
      </fieldset>

      <label className="campo">
        <span>Año</span>
        <select value={filtros.anio} onChange={cambiar('anio')}>
          <option value="">Todos</option>
          {opciones?.anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>

      <fieldset className="campo-doble">
        <legend>Rango de fechas (UTC)</legend>
        <input type="date" value={filtros.fecha_desde} onChange={cambiar('fecha_desde')} aria-label="Desde" />
        <input type="date" value={filtros.fecha_hasta} onChange={cambiar('fecha_hasta')} aria-label="Hasta" />
      </fieldset>

      <label className="campo">
        <span>Tipo de evento</span>
        <select value={filtros.tipo_evento} onChange={cambiar('tipo_evento')}>
          <option value="">Todos</option>
          {opciones?.tipos_evento.map((t) => (
            <option key={t.tipo_evento} value={t.tipo_evento}>{t.tipo_evento} ({fmtEntero(t.total)})</option>
          ))}
        </select>
      </label>

      <div className="fila-2">
        <label className="campo">
          <span>Alerta PAGER</span>
          <select value={filtros.alerta} onChange={cambiar('alerta')}>
            <option value="">Todas</option>
            {opciones?.alertas.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
          </select>
        </label>
        <label className="campo">
          <span>Tsunami</span>
          <select value={filtros.tsunami} onChange={cambiar('tsunami')}>
            <option value="">Todos</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </label>
      </div>

      <button type="button" className="boton boton-fantasma" disabled={activos === 0} onClick={() => setFiltros(FILTROS_INICIALES)}>
        Limpiar filtros
      </button>

      <p className="nota">
        Capa reciente: M2.5+ del último año. Capa histórica: M5.5+ desde 1970.
      </p>
    </aside>
  )
}
