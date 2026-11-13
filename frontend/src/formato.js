/**
 * Utilidades de PRESENTACIÓN: formatean números y fechas, y asignan colores.
 * Aquí no se calcula ninguna métrica: todas llegan ya calculadas desde la BD.
 */

const numero = new Intl.NumberFormat('es-CO')

export const fmtEntero = (v) => (v === null || v === undefined ? '—' : numero.format(v))
export const fmtDecimal = (v, d = 2) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })

export function fmtFecha(iso, conHora = true) {
  if (!iso) return '—'
  // Mostramos la fecha en UTC (estándar sismológico), recortando el ISO 8601
  const texto = new Date(iso).toISOString()
  return conHora ? `${texto.slice(0, 10)} ${texto.slice(11, 19)}` : texto.slice(0, 10)
}

/** Convención de los mapas sismológicos: color según profundidad. */
export const COLORES_RANGO = {
  superficial: '#f5c542',
  intermedio: '#ff7a2f',
  profundo: '#e8366f',
}
export function colorProfundidad(km) {
  if (km < 70) return COLORES_RANGO.superficial
  if (km <= 300) return COLORES_RANGO.intermedio
  return COLORES_RANGO.profundo
}

/**
 * Radio del círculo según la magnitud. La magnitud es LOGARÍTMICA (cada punto
 * equivale a ~32 veces más energía), por eso el radio crece más que linealmente.
 * M3 ≈ 2 px · M5 ≈ 4 px · M7 ≈ 8 px · M9 ≈ 12 px
 */
export function radioMagnitud(mag) {
  return 1.5 + Math.pow(Math.max(mag - 2.5, 0.3), 1.6) * 0.55
}

/** Color de la magnitud para las "pastillas" de la tabla. */
export function claseMagnitud(mag) {
  if (mag >= 7) return 'mag mag-7'
  if (mag >= 6) return 'mag mag-6'
  if (mag >= 5) return 'mag mag-5'
  if (mag >= 4) return 'mag mag-4'
  return 'mag mag-3'
}

export const ETIQUETAS_RANGO = {
  superficial: 'Superficial',
  intermedio: 'Intermedio',
  profundo: 'Profundo',
}

/** Variación porcentual entre DOS valores ya agregados por la BD (B respecto de A). */
export function variacion(a, b) {
  if (a === null || a === undefined || b === null || b === undefined || Number(a) === 0) return null
  return ((Number(b) - Number(a)) / Math.abs(Number(a))) * 100
}

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
