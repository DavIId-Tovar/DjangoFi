/**
 * Capa de comunicación con Django. TODAS las peticiones HTTP pasan por aquí.
 *
 * Flujo de una petición:
 *   componente -> pedir("/api/sismos/?page=2") -> fetch() -> HTTP -> Django
 *   Django -> JSON -> resp.json() -> objeto JS -> componente lo dibuja
 */

const CLAVE_TOKEN = 'sismos_token'
const CLAVE_USUARIO = 'sismos_usuario'

// localStorage puede fallar (modo privado / bloqueado): siempre dentro de try/catch
function leer(clave) {
  try { return localStorage.getItem(clave) } catch { return null }
}
function escribir(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, valor)
  } catch { /* sin almacenamiento: la sesión dura hasta recargar */ }
}

/** Sesión del usuario: el token vive en el localStorage del navegador. */
export const sesion = {
  get token() { return leer(CLAVE_TOKEN) },
  get usuario() { return leer(CLAVE_USUARIO) },
  guardar(token, usuario) { escribir(CLAVE_TOKEN, token); escribir(CLAVE_USUARIO, usuario) },
  limpiar() { escribir(CLAVE_TOKEN, null); escribir(CLAVE_USUARIO, null) },
}

/**
 * {search: "chile", page: 2, region: ""}  ->  "?search=chile&page=2"
 * Omite los valores vacíos para no mandar filtros que el usuario no eligió.
 */
export function construirQuery(params) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([clave, valor]) => {
    if (valor !== '' && valor !== null && valor !== undefined) q.append(clave, valor)
  })
  const texto = q.toString()
  return texto ? `?${texto}` : ''
}

/**
 * Envoltura de fetch(). Devuelve siempre un objeto con el resultado, aunque
 * el servidor responda 401 o 500, para que la interfaz pueda MOSTRAR el error.
 */
export async function pedir(url, { method = 'GET', body, token, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  // La cabecera que exige TokenAuthentication en Django:
  if (token) headers.Authorization = `Token ${token}`

  const inicio = performance.now()
  const resp = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'omit', // no enviar cookies: la API se autentica SOLO por token
  })
  let datos = null
  try { datos = await resp.json() } catch { datos = null }
  return {
    ok: resp.ok,
    status: resp.status,
    datos,
    ms: Math.round(performance.now() - inicio),
    headers,
  }
}
