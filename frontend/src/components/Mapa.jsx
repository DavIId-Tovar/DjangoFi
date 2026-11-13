/**
 * Mapa con Leaflet. Cada sismo es un círculo:
 *   - radio  -> magnitud
 *   - color  -> profundidad (convención de los mapas sismológicos)
 * preferCanvas dibuja en <canvas> (no 3.000 elementos SVG): mucho más fluido.
 */
import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { COLORES_RANGO, colorProfundidad, fmtDecimal, fmtEntero, fmtFecha, radioMagnitud } from '../formato'

/** Componente auxiliar: cuando cambia `destino`, el mapa "vuela" hasta él. */
function Volar({ destino }) {
  const mapa = useMap()
  useEffect(() => {
    if (destino) mapa.flyTo([destino.lat, destino.lon], Math.max(mapa.getZoom(), 5), { duration: 1.1 })
  }, [destino, mapa])
  return null
}

export default function Mapa({ datos, cargando, seleccionado, onSeleccionar }) {
  const puntos = datos?.puntos ?? []
  return (
    <section className="panel panel-mapa">
      <MapContainer center={[12, -20]} zoom={2} minZoom={2} worldCopyJump preferCanvas className="mapa">
        {/* Mapa base oscuro de Esri (gratuito, sin API key) + capa de nombres encima */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Mapa base &copy; Esri, HERE, Garmin, &copy; OpenStreetMap"
          maxZoom={16}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
        {/* Dibujar los puntos que ya vienen de la API (no es cálculo de métricas) */}
        {puntos.map(([id, lat, lon, mag, prof, lugar, fecha]) => (
          <CircleMarker
            key={id}
            center={[lat, lon]}
            radius={radioMagnitud(mag)}
            pathOptions={{ color: colorProfundidad(prof), fillColor: colorProfundidad(prof), fillOpacity: 0.4, weight: 0.7 }}
            eventHandlers={{ click: () => onSeleccionar({ id, lat, lon, mag, prof, lugar, fecha }) }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <span className="mono">M{fmtDecimal(mag, 1)}</span> · {lugar}<br />
              <span className="mono">{fmtFecha(fecha)} · {fmtDecimal(prof, 1)} km</span>
            </Tooltip>
          </CircleMarker>
        ))}
        {seleccionado && (
          <CircleMarker
            center={[seleccionado.lat, seleccionado.lon]}
            radius={radioMagnitud(seleccionado.mag) + 7}
            pathOptions={{ color: '#ffffff', fill: false, weight: 2, dashArray: '4 4' }}
          />
        )}
        <Volar destino={seleccionado} />
      </MapContainer>

      <div className="mapa-info mono">
        {cargando ? 'Consultando…' : `${fmtEntero(puntos.length)} de ${fmtEntero(datos?.total)} en el mapa`}
        {datos && datos.total > datos.limite && <small> (los {fmtEntero(datos.limite)} de mayor magnitud)</small>}
      </div>

      <div className="leyenda">
        <strong>Profundidad</strong>
        {Object.entries({ '0–70 km': COLORES_RANGO.superficial, '70–300 km': COLORES_RANGO.intermedio, '> 300 km': COLORES_RANGO.profundo }).map(([t, c]) => (
          <span key={t}><i style={{ background: c }} />{t}</span>
        ))}
        <strong>Magnitud</strong>
        <span className="escala">
          {[3, 5, 7].map((m) => (
            <i key={m} className="circulo" style={{ width: radioMagnitud(m) * 2, height: radioMagnitud(m) * 2 }} title={`M${m}`} />
          ))}
          <small className="mono">3 · 5 · 7</small>
        </span>
      </div>

      {seleccionado && (
        <div className="detalle">
          <button type="button" className="cerrar" onClick={() => onSeleccionar(null)} aria-label="Cerrar detalle">×</button>
          <div className="detalle-mag mono" style={{ color: colorProfundidad(seleccionado.prof) }}>M{fmtDecimal(seleccionado.mag, 1)}</div>
          <div className="detalle-lugar">{seleccionado.lugar}</div>
          <dl className="mono">
            <dt>Fecha</dt><dd>{fmtFecha(seleccionado.fecha)} UTC</dd>
            <dt>Prof.</dt><dd>{fmtDecimal(seleccionado.prof, 1)} km</dd>
            <dt>Coord.</dt><dd>{fmtDecimal(seleccionado.lat, 3)}, {fmtDecimal(seleccionado.lon, 3)}</dd>
          </dl>
          {seleccionado.url && <a href={seleccionado.url} target="_blank" rel="noreferrer">Ficha USGS ↗</a>}
        </div>
      )}
    </section>
  )
}
