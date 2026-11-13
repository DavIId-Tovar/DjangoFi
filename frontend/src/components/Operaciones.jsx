/**
 * Vista Operaciones: flujo completo de autenticación por token.
 *
 *  1. Login     POST /api/login/ {username, password} -> {token}
 *  2. Guardar   el token en localStorage
 *  3. Probar    POST /api/sincronizar/ SIN cabecera   -> 401 (rechazado)
 *               POST /api/sincronizar/ CON cabecera   -> 200 (ejecutado)
 *     cabecera: Authorization: Token <clave>
 *  4. Logout    POST /api/logout/ -> el servidor borra el token
 *
 * La "consola" de abajo muestra cada petición tal como viajó.
 */
import { useState } from 'react'
import { pedir, sesion } from '../api'
import { fmtEntero } from '../formato'

const TEXTO_ESTADO = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 502: 'Bad Gateway' }
const enmascarar = (t) => (t ? `${t.slice(0, 6)}…${t.slice(-4)}` : '')

export default function Operaciones({ usuario, setUsuario }) {
  const [credenciales, setCredenciales] = useState({ username: '', password: '' })
  const [token, setToken] = useState(sesion.token)
  const [dias, setDias] = useState(7)
  const [registro, setRegistro] = useState([])
  const [ocupado, setOcupado] = useState(false)
  const [errorLogin, setErrorLogin] = useState('')

  /** Ejecuta una petición y la anota en la consola. */
  async function ejecutar(etiqueta, url, opciones) {
    setOcupado(true)
    try {
      const r = await pedir(url, opciones)
      const cabecera = r.headers.Authorization ? `Authorization: Token ${enmascarar(opciones.token)}` : '(sin cabecera Authorization)'
      setRegistro((prev) => [{ id: Date.now(), hora: new Date().toISOString().slice(11, 19), etiqueta, metodo: opciones.method, url, cabecera, ...r }, ...prev].slice(0, 12))
      return r
    } catch (err) {
      setRegistro((prev) => [{ id: Date.now(), hora: new Date().toISOString().slice(11, 19), etiqueta, metodo: opciones.method, url, cabecera: '', status: 0, ok: false, ms: 0, datos: { detail: `Error de red: ${err.message}` } }, ...prev])
      return null
    } finally {
      setOcupado(false)
    }
  }

  async function iniciarSesion(e) {
    e.preventDefault() // evita que el formulario recargue la página
    setErrorLogin('')
    const r = await ejecutar('Login', '/api/login/', { method: 'POST', body: credenciales })
    if (r?.ok) {
      sesion.guardar(r.datos.token, r.datos.usuario)
      setToken(r.datos.token)
      setUsuario(r.datos.usuario)
      setCredenciales({ username: '', password: '' })
    } else if (r) {
      setErrorLogin(r.datos?.non_field_errors?.[0] || 'Credenciales inválidas.')
    }
  }

  async function cerrarSesion() {
    await ejecutar('Logout', '/api/logout/', { method: 'POST', token })
    sesion.limpiar()
    setToken(null)
    setUsuario(null)
  }

  const sincronizar = (conToken) =>
    ejecutar(conToken ? 'Sincronizar CON token' : 'Sincronizar SIN token', '/api/sincronizar/', {
      method: 'POST',
      body: { dias: Number(dias) },
      token: conToken ? token : undefined,
    })

  return (
    <div className="operaciones">
      <section className="panel tarjeta-login">
        <h3>1 · Autenticación</h3>
        {usuario ? (
          <div className="sesion-activa">
            <p>Sesión iniciada como <strong>{usuario}</strong></p>
            <p className="mono token">token: {enmascarar(token)}</p>
            <p className="nota">El token está guardado en el <code>localStorage</code> del navegador y se envía en la cabecera
              <code>Authorization</code> solo cuando se pide.</p>
            <button type="button" className="boton boton-fantasma" onClick={cerrarSesion} disabled={ocupado}>Cerrar sesión (revocar token)</button>
          </div>
        ) : (
          <form onSubmit={iniciarSesion} className="form-login">
            <label className="campo"><span>Usuario</span>
              <input autoComplete="username" value={credenciales.username} onChange={(e) => setCredenciales({ ...credenciales, username: e.target.value })} required />
            </label>
            <label className="campo"><span>Contraseña</span>
              <input type="password" autoComplete="current-password" value={credenciales.password} onChange={(e) => setCredenciales({ ...credenciales, password: e.target.value })} required />
            </label>
            {errorLogin && <div className="alerta-error">{errorLogin}</div>}
            <button type="submit" className="boton" disabled={ocupado}>Iniciar sesión</button>
            <p className="nota">POST <code>/api/login/</code> → Django valida contra sus usuarios reales y devuelve el token.</p>
          </form>
        )}
      </section>

      <section className="panel tarjeta-accion">
        <h3>2 · Acción protegida: sincronizar con el USGS</h3>
        <p>
          <code>POST /api/sincronizar/</code> descarga los sismos recientes del USGS y hace UPSERT en la base de datos.
          Está protegida con <code>IsAuthenticated</code>: sin un token válido Django responde <strong>401</strong> y el código nunca se ejecuta.
        </p>
        <label className="campo en-linea">Días a sincronizar
          <input type="number" min="1" max="30" value={dias} onChange={(e) => setDias(e.target.value)} />
        </label>
        <div className="botones">
          <button type="button" className="boton boton-peligro" onClick={() => sincronizar(false)} disabled={ocupado}>
            Intentar SIN token
          </button>
          <button type="button" className="boton boton-ok" onClick={() => sincronizar(true)} disabled={ocupado || !token}
            title={token ? '' : 'Inicie sesión primero'}>
            Ejecutar CON token
          </button>
          {ocupado && <span className="cargando" aria-label="Procesando" />}
        </div>
        {!token && <p className="nota">Inicie sesión para habilitar la ejecución con token.</p>}
      </section>

      <section className="panel consola">
        <header className="panel-titulo">
          <h3>3 · Consola HTTP</h3>
          {registro.length > 0 && <button type="button" className="boton-texto" onClick={() => setRegistro([])}>limpiar</button>}
        </header>
        {registro.length === 0 && <p className="atenuado mono">Las peticiones aparecerán aquí…</p>}
        {registro.map((r) => (
          <article key={r.id} className={`entrada ${r.ok ? 'entrada-ok' : 'entrada-error'}`}>
            <div className="entrada-linea mono">
              <span className="hora">{r.hora}</span>
              <span className="metodo">{r.metodo}</span>
              <span>{r.url}</span>
              <span className={`codigo ${r.ok ? 'ok' : 'error'}`}>{r.status} {TEXTO_ESTADO[r.status] || ''}</span>
              <span className="atenuado">{r.ms} ms</span>
            </div>
            <div className="entrada-cabecera mono">{r.etiqueta} · {r.cabecera}</div>
            <pre className="mono">{JSON.stringify(ocultarToken(r.datos), null, 2)}</pre>
            {r.ok && r.datos?.total_en_bd !== undefined && (
              <div className="resumen-sync mono">
                {fmtEntero(r.datos.descargados)} descargados · {fmtEntero(r.datos.nuevos)} nuevos · {fmtEntero(r.datos.actualizados)} actualizados · total {fmtEntero(r.datos.total_en_bd)}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  )
}

/** No mostramos el token completo en pantalla (alguien podría fotografiarlo). */
function ocultarToken(datos) {
  if (datos && typeof datos.token === 'string') return { ...datos, token: enmascarar(datos.token) }
  return datos
}
