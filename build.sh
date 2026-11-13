#!/usr/bin/env bash
# =============================================================================
# Script de BUILD que Render ejecuta en cada despliegue (en un servidor Linux).
# set -o errexit: si CUALQUIER comando falla, el despliegue se detiene (no se
# publica una versión rota).
# =============================================================================
set -o errexit

echo "==> 1. Dependencias de Python"
pip install --upgrade pip
pip install -r Backend/requirements.txt

echo "==> 2. Compilar React (frontend/dist)"
if ! command -v npm > /dev/null; then
  echo "ERROR: npm no está disponible en el entorno de build." >&2
  exit 1
fi
cd frontend
npm ci            # instala EXACTAMENTE lo de package-lock.json
npm run build     # genera dist/index.html y dist/assets/*.js|css
cd ..

# Desde aquí todos los comandos de Django corren dentro de Backend/
cd Backend

echo "==> 3. Archivos estáticos (admin + React) -> Backend/staticfiles/"
python manage.py collectstatic --noinput

echo "==> 4. Migraciones -> crea/actualiza las tablas en PostgreSQL"
python manage.py migrate --noinput

echo "==> 5. Superusuario desde variables de entorno (Render gratis no tiene Shell)"
# Usa DJANGO_SUPERUSER_USERNAME / _EMAIL / _PASSWORD. Si ya existe, no falla.
python manage.py createsuperuser --noinput || echo "    (el superusuario ya existe o faltan variables: se omite)"

echo "==> 6. Ingesta de datos reales del USGS (idempotente: UPSERT)"
# Capa reciente: se refresca en cada despliegue
python manage.py ingestar_sismos --dias 365 --min-mag 2.5
# Capa histórica: solo la primera vez (si ya hay datos de 1970 se omite)
python manage.py ingestar_sismos --desde 1970-01-01 --min-mag 5.5 --ventana-dias 365 --omitir-si-existe

echo "==> Build completado"
