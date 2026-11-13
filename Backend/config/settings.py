"""
Configuración global del proyecto Sismos.

Regla de oro: nada secreto ni nada que cambie entre "mi PC" y "Render"
se escribe aquí a mano. Todo eso se lee de variables de entorno.
"""
import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# 1. RUTAS BASE
# ---------------------------------------------------------------------------
# __file__ = ruta de ESTE archivo (.../DjangoJT/Backend/config/settings.py)
# .resolve() = la convierte en ruta absoluta
# .parent    = sube a config/
# .parent    = sube a Backend/   ← la raíz del proyecto Django
BASE_DIR = Path(__file__).resolve().parent.parent

# Un nivel más arriba: la raíz del repositorio (donde viven Backend/ y frontend/)
REPO_DIR = BASE_DIR.parent

# Lee el archivo .env (si existe) y carga sus líneas como variables de entorno.
# En Render no habrá .env: allí las variables vienen del panel, y esta línea
# simplemente no hace nada.
load_dotenv(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# 2. SEGURIDAD
# ---------------------------------------------------------------------------
# Clave para firmar cookies, sesiones y tokens CSRF. Si alguien la conoce,
# puede falsificar sesiones. El valor por defecto SOLO sirve en local.
SECRET_KEY = os.environ.get("SECRET_KEY", "clave-insegura-solo-para-desarrollo")

# os.environ.get devuelve TEXTO. "True" == "True" → True (booleano).
# Si la variable no existe, el valor es "False" → DEBUG queda apagado.
# Así, si olvidas configurarla en Render, el sitio queda en modo seguro.
DEBUG = os.environ.get("DEBUG", "False") == "True"

# Dominios desde los que se puede visitar el sitio. Es una defensa contra
# ataques que falsifican la cabecera Host. "a,b".split(",") → ["a", "b"]
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# Orígenes HTTPS en los que Django confía para formularios (por ejemplo,
# el login de /admin/).
CSRF_TRUSTED_ORIGINS = []

# Render crea esta variable automáticamente con tu dominio público
# (por ejemplo sismos-xyz.onrender.com). La agregamos sola, sin escribirla a mano.
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")

# En Render, el HTTPS lo atiende un proxy que luego le habla a gunicorn en HTTP.
# El proxy avisa con esta cabecera que la petición original fue HTTPS.
# Sin esta línea, Django creería que todo es HTTP y el login del admin fallaría con CSRF.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# En producción (DEBUG=False) las cookies del admin solo viajan por HTTPS.
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# ---------------------------------------------------------------------------
# 3. APLICACIONES INSTALADAS
# ---------------------------------------------------------------------------
# Lista de "módulos" que Django carga. Si una app no está aquí, para Django
# no existe: sus modelos no crean tablas y sus comandos no aparecen.
INSTALLED_APPS = [
    # --- Las "baterías incluidas" de Django ---
    "django.contrib.admin",          # el panel /admin/
    "django.contrib.auth",           # usuarios, contraseñas y permisos
    "django.contrib.contenttypes",   # registro interno de modelos (lo usa auth)
    "django.contrib.sessions",       # sesiones (lo usa el login del admin)
    "django.contrib.messages",       # mensajes como "Guardado con éxito" en el admin
    "django.contrib.staticfiles",    # manejo de CSS/JS/imágenes
    # --- Terceros (instalados con pip) ---
    "rest_framework",                # Django REST Framework
    "rest_framework.authtoken",      # tabla de tokens para autenticar
    "django_filters",                # filtros por URL (?mag_min=5)
    # --- Nuestras apps ---
    "sismos",
]

# ---------------------------------------------------------------------------
# 4. MIDDLEWARE (las capas por las que pasa CADA petición, en orden)
# ---------------------------------------------------------------------------
# Piensa en una cebolla: la petición entra de arriba hacia abajo y la respuesta
# sale de abajo hacia arriba. EL ORDEN IMPORTA.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise va justo después de Security: si la petición es por un archivo
    # estático (/static/...), lo entrega y corta el viaje sin pasar por el resto.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Archivo con el "conmutador" principal de URLs
ROOT_URLCONF = "config.urls"

# Carpeta donde Vite deja React compilado (index.html + assets/)
FRONTEND_DIST = REPO_DIR / "frontend" / "dist"

# Plantillas HTML (las usa el admin; más adelante también el index.html de React)
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # Aquí Django busca el index.html que genera "npm run build" de React
        "DIRS": [FRONTEND_DIST],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# La "puerta" que usará gunicorn (config/wsgi.py → variable application)
WSGI_APPLICATION = "config.wsgi.application"

# ---------------------------------------------------------------------------
# 5. BASE DE DATOS
# ---------------------------------------------------------------------------
# dj_database_url lee la variable DATABASE_URL, por ejemplo:
#   postgresql://usuario:clave@host:5432/nombre_bd
# y la convierte en el diccionario que Django espera.
# Si NO existe (tu PC), usa el "default": un archivo SQLite local.
# conn_max_age=600 → reutiliza la conexión hasta 10 minutos en vez de abrir
# una nueva en cada petición (abrir conexiones a Postgres es costoso).
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

# Tipo de la columna "id" automática: entero grande (hasta 9 trillones)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# 6. CONTRASEÑAS
# ---------------------------------------------------------------------------
# Reglas que se validan al crear usuarios (longitud mínima, que no sea
# "12345678", que no se parezca al nombre de usuario, etc.)
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# 7. IDIOMA Y ZONA HORARIA
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "es-co"          # el admin aparece en español
# UTC: estándar de la sismología. El USGS publica en UTC y así las agrupaciones
# por año/mes/década (ExtractYear, TruncMonth) no se corren por la zona horaria local.
TIME_ZONE = "UTC"
USE_I18N = True                  # activa las traducciones
USE_TZ = True                    # guarda las fechas en UTC dentro de la BD (muy importante con sismos de todo el mundo)

# ---------------------------------------------------------------------------
# 8. ARCHIVOS ESTÁTICOS (CSS, JS, imágenes)
# ---------------------------------------------------------------------------
STATIC_URL = "static/"                    # prefijo de la URL: /static/...
STATIC_ROOT = BASE_DIR / "staticfiles"    # adonde "collectstatic" copia TODO en producción

# Carpetas EXTRA de estáticos: los JS/CSS compilados de React (/static/assets/...).
# Solo se agrega si ya existe (antes del primer "npm run build" no existe).
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []

STORAGES = {
    # Archivos que suben los usuarios (no los usamos, pero Django exige la clave)
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Estáticos: WhiteNoise los comprime (gzip/brotli) y les agrega un hash
    # al nombre (app.3f9a2c.css) para que el navegador los guarde en caché sin riesgo.
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
# ---------------------------------------------------------------------------
# 9. DJANGO REST FRAMEWORK
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    # SOLO autenticación por token. Dos razones:
    #  1. Con TokenAuthentication como primera (o única) clase, una petición sin
    #     credenciales recibe 401 Unauthorized (con SessionAuthentication primero
    #     DRF respondería 403 Forbidden).
    #  2. Si alguien tiene abierta una sesión del /admin/ en el mismo navegador,
    #     la cookie de sesión NO autentica la API: la demo "sin token -> 401"
    #     funciona siempre.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
    ],
    # Por defecto: leer es libre, escribir exige autenticación
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_PAGINATION_CLASS": "sismos.paginacion.PaginacionSismos",
    "PAGE_SIZE": 25,
    # Decimales como números JSON (4.8) y no como texto ("4.80")
    "COERCE_DECIMAL_TO_STRING": False,
}
