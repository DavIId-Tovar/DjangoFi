"""
Lógica de ingesta: DESCARGAR -> LIMPIAR -> GUARDAR EN BLOQUE.

Está separada del comando (management/commands/ingestar_sismos.py) para que
la misma función se pueda reutilizar después desde la acción protegida de la
API ("sincronizar"), sin copiar código.
"""
import re
from collections import Counter
from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal, InvalidOperation

import requests
from django.db import transaction

from .models import Sismo

URL_USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query"
LIMITE_USGS = 20000        # el USGS no devuelve más de 20.000 eventos por consulta
VENTANA_DIAS = 30          # por eso descargamos en "ventanas" de 30 días

# Abreviaturas que el USGS usa en vez del nombre completo
ABREVIATURAS = {"CA": "California", "MX": "Mexico", "NV": "Nevada"}

# Prefijos de dirección en minúscula: "south of the Fiji Islands" -> "Fiji Islands".
# Es sensible a mayúsculas a propósito: "South Sandwich Islands" es un nombre
# propio y NO debe recortarse.
PREFIJO_DIRECCION = re.compile(
    r"^(?:(?:north|south|east|west|northeast|northwest|southeast|southwest"
    r"|northern|southern|eastern|western|central)\s+(?:of\s+)?)?"
    r"(?:off the coast of\s+|near the coast of\s+)?"
    r"(?:the\s+)?"
)
# Sufijo " region": "Japan region" -> "Japan"
SUFIJO_REGION = re.compile(r"\s+region$", re.IGNORECASE)

# Columnas que se ACTUALIZAN si el sismo ya existía (el USGS revisa y corrige
# magnitudes días después del evento). Nunca se toca usgs_id ni creado_en.
CAMPOS_ACTUALIZABLES = [
    "magnitud", "tipo_magnitud", "profundidad_km", "rango_profundidad",
    "significancia", "lugar", "region", "latitud", "longitud", "fecha",
    "tipo_evento", "alerta", "tsunami", "red", "url", "actualizado_en",
]


# --------------------------------------------------------------------------
# Funciones pequeñas de LIMPIEZA (cada una hace una sola cosa)
# --------------------------------------------------------------------------
def a_decimal(valor, precision):
    """Convierte a Decimal exacto con la precisión dada ("0.01"), o None si no se puede."""
    if valor is None or valor == "":
        return None
    try:
        # str() primero: Decimal(4.8) daría 4.79999999999999982236431605997495353221893310546875
        return Decimal(str(valor)).quantize(Decimal(precision))
    except (InvalidOperation, ValueError, TypeError):
        return None


def limpiar_texto(valor):
    """None -> "", y colapsa espacios repetidos: '  a   b ' -> 'a b'."""
    if not valor:
        return ""
    return " ".join(str(valor).split())


def normalizar_region(lugar):
    """'10 km SW of Tocopilla, Chile' -> 'Chile';  'Fiji region' -> 'Fiji'."""
    parte = lugar.rsplit(",", 1)[-1].strip()   # lo que hay después de la ÚLTIMA coma
    parte = ABREVIATURAS.get(parte, parte)
    parte = PREFIJO_DIRECCION.sub("", parte)
    parte = SUFIJO_REGION.sub("", parte).strip()
    return parte or "Desconocida"


def clasificar_profundidad(km):
    """Clasificación sismológica estándar del hipocentro."""
    if km < 70:
        return Sismo.RangoProfundidad.SUPERFICIAL
    if km <= 300:
        return Sismo.RangoProfundidad.INTERMEDIO
    return Sismo.RangoProfundidad.PROFUNDO


def limpiar_evento(evento):
    """
    Recibe UN evento crudo del GeoJSON y devuelve (Sismo, None) si es válido,
    o (None, "motivo") si hay que descartarlo. NO guarda nada en la BD.
    """
    props = evento.get("properties") or {}
    coords = (evento.get("geometry") or {}).get("coordinates") or []

    usgs_id = limpiar_texto(evento.get("id"))
    if not usgs_id:
        return None, "sin_id"

    magnitud = a_decimal(props.get("mag"), "0.01")
    if magnitud is None:
        return None, "sin_magnitud"

    if len(coords) < 3:
        return None, "sin_coordenadas"
    longitud = a_decimal(coords[0], "0.000001")   # GeoJSON: [longitud, latitud, profundidad]
    latitud = a_decimal(coords[1], "0.000001")
    profundidad = a_decimal(coords[2], "0.001")
    if None in (longitud, latitud, profundidad):
        return None, "sin_coordenadas"

    # El USGS entrega la fecha como MILISEGUNDOS desde 1970-01-01 UTC (epoch).
    try:
        fecha = datetime.fromtimestamp(int(props["time"]) / 1000, tz=dt_timezone.utc)
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        return None, "fecha_invalida"

    lugar = limpiar_texto(props.get("place")) or "Ubicación desconocida"
    alerta = limpiar_texto(props.get("alert")).lower()
    if alerta not in Sismo.Alerta.values:
        alerta = ""

    sismo = Sismo(
        usgs_id=usgs_id,
        magnitud=magnitud,
        tipo_magnitud=limpiar_texto(props.get("magType")).lower()[:10] or "desconocido",
        profundidad_km=profundidad,
        rango_profundidad=clasificar_profundidad(profundidad),
        significancia=max(int(props.get("sig") or 0), 0),
        lugar=lugar[:255],
        region=normalizar_region(lugar)[:100],
        latitud=latitud,
        longitud=longitud,
        fecha=fecha,
        tipo_evento=limpiar_texto(props.get("type")).lower()[:40] or "desconocido",
        alerta=alerta,
        tsunami=bool(props.get("tsunami")),
        red=limpiar_texto(props.get("net")).lower()[:10],
        url=limpiar_texto(props.get("url"))[:255],
    )
    return sismo, None


# --------------------------------------------------------------------------
# DESCARGA
# --------------------------------------------------------------------------
def descargar_ventana(inicio, fin, min_mag):
    """Pide al USGS los eventos entre dos fechas. Devuelve la lista cruda."""
    respuesta = requests.get(
        URL_USGS,
        params={
            "format": "geojson",
            "starttime": inicio.isoformat(),
            "endtime": fin.isoformat(),
            "minmagnitude": min_mag,
            "orderby": "time",
            "limit": LIMITE_USGS,
        },
        timeout=90,
    )
    respuesta.raise_for_status()   # si el USGS responde 4xx/5xx, lanza un error
    return respuesta.json().get("features", [])


# --------------------------------------------------------------------------
# ORQUESTADOR
# --------------------------------------------------------------------------
def sincronizar(dias=365, min_mag=2.5, desde=None, ventana_dias=VENTANA_DIAS, log=print):
    """
    Descarga, limpia y hace un UPSERT en bloque. Devuelve un resumen.

    - Capa reciente:   sincronizar(dias=365, min_mag=2.5)
    - Capa histórica:  sincronizar(desde=datetime(1970,1,1,tzinfo=utc), min_mag=5.5, ventana_dias=365)
    """
    fin_total = datetime.now(dt_timezone.utc)
    inicio = desde if desde else fin_total - timedelta(days=dias)

    validos = {}            # usgs_id -> Sismo  (un dict elimina duplicados entre ventanas)
    descartados = Counter()  # motivo -> cantidad
    descargados = 0

    while inicio < fin_total:
        fin = min(inicio + timedelta(days=ventana_dias), fin_total)
        eventos = descargar_ventana(inicio, fin, min_mag)
        descargados += len(eventos)
        log(f"  {inicio:%Y-%m-%d} -> {fin:%Y-%m-%d}: {len(eventos)} eventos")
        if len(eventos) >= LIMITE_USGS:
            log("  ADVERTENCIA: ventana llena (20.000); podrían faltar eventos.")

        for evento in eventos:
            sismo, motivo = limpiar_evento(evento)
            if sismo is None:
                descartados[motivo] += 1
            else:
                validos[sismo.usgs_id] = sismo
        inicio = fin

    total_antes = Sismo.objects.count()

    # transaction.atomic: o se guarda TODO, o no se guarda NADA (si algo falla a mitad).
    with transaction.atomic():
        Sismo.objects.bulk_create(
            list(validos.values()),
            batch_size=1000,              # INSERTs de 1.000 filas por consulta
            update_conflicts=True,        # si el usgs_id ya existe...
            unique_fields=["usgs_id"],    # ...(detectado por este índice único)...
            update_fields=CAMPOS_ACTUALIZABLES,  # ...actualiza estas columnas en vez de duplicar
        )

    total_despues = Sismo.objects.count()
    nuevos = total_despues - total_antes
    return {
        "descargados": descargados,
        "validos": len(validos),
        "descartados": dict(descartados),
        "nuevos": nuevos,
        "actualizados": len(validos) - nuevos,
        "total_en_bd": total_despues,
    }
