/**
 * Hooks personalizados (funciones que reutilizan lógica con estado de React).
 */
import { useEffect, useState } from 'react'
import { pedir } from './api'

/**
 * useApi(url): hace GET cada vez que cambia la URL.
 * - Si el usuario cambia un filtro antes de que llegue la respuesta anterior,
 *   AbortController CANCELA la petición vieja (evita mostrar datos desfasados).
 * - Mientras carga, conserva los datos anteriores (la pantalla no "parpadea").
 */
export function useApi(url) {
  const [estado, setEstado] = useState({ datos: null, cargando: Boolean(url), error: null })

  useEffect(() => {
    if (!url) return undefined
    const control = new AbortController()
    setEstado((previo) => ({ ...previo, cargando: true, error: null }))
    pedir(url, { signal: control.signal })
      .then((r) => {
        if (!r.ok) throw new Error(r.datos?.detail || `Error HTTP ${r.status}`)
        setEstado({ datos: r.datos, cargando: false, error: null })
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setEstado((previo) => ({ ...previo, cargando: false, error: err.message }))
      })
    return () => control.abort() // limpieza: se ejecuta antes del siguiente efecto
  }, [url])

  return estado
}

/**
 * useDebounce(valor, ms): devuelve el valor solo cuando deja de cambiar durante
 * `ms` milisegundos. Así el buscador no dispara una petición por cada tecla.
 */
export function useDebounce(valor, ms = 400) {
  const [retrasado, setRetrasado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return retrasado
}
