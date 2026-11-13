"""
Comando personalizado de Django. El NOMBRE DEL ARCHIVO es el nombre del comando:

    # Capa reciente: último año, M2.5+ (ventanas de 30 días)
    python manage.py ingestar_sismos

    # Capa histórica: desde 1970, M5.5+ (ventanas de 1 año)
    python manage.py ingestar_sismos --desde 1970-01-01 --min-mag 5.5 --ventana-dias 365

Es idempotente: ejecutarlo varias veces NO duplica filas (hace UPSERT por usgs_id).
"""
from datetime import date, datetime, timedelta, timezone as dt_timezone

import requests
from django.core.management.base import BaseCommand, CommandError

from sismos.ingesta import VENTANA_DIAS, sincronizar
from sismos.models import Sismo


class Command(BaseCommand):
    # Texto que aparece con: python manage.py help ingestar_sismos
    help = "Descarga sismos reales del USGS, los limpia y los guarda en bloque sin duplicar."

    def add_arguments(self, parser):
        # Parámetros opcionales de la línea de comandos (como los de argparse)
        parser.add_argument("--dias", type=int, default=365,
                            help="Cuántos días hacia atrás descargar (por defecto 365).")
        parser.add_argument("--desde", type=date.fromisoformat, default=None,
                            help="Fecha inicial AAAA-MM-DD (reemplaza a --dias).")
        parser.add_argument("--min-mag", type=float, default=2.5,
                            help="Magnitud mínima a descargar (por defecto 2.5).")
        parser.add_argument("--ventana-dias", type=int, default=VENTANA_DIAS,
                            help="Tamaño de cada consulta al USGS en días (por defecto 30).")
        parser.add_argument("--omitir-si-existe", action="store_true",
                            help="No descargar si ya hay sismos en el primer año del periodo "
                                 "(evita repetir la carga histórica en cada despliegue).")

    def handle(self, *args, **opciones):
        # handle() es el "main" del comando: Django lo llama al ejecutarlo.
        dias = opciones["dias"]
        min_mag = opciones["min_mag"]   # argparse convierte --min-mag en min_mag
        if dias < 1 or opciones["ventana_dias"] < 1:
            raise CommandError("--dias y --ventana-dias deben ser 1 o mayores.")

        desde = None
        if opciones["desde"]:
            # date -> datetime a medianoche UTC (la BD trabaja con fechas con zona horaria)
            desde = datetime.combine(opciones["desde"], datetime.min.time(), tzinfo=dt_timezone.utc)

        if opciones["omitir_si_existe"]:
            inicio = desde or datetime.now(dt_timezone.utc) - timedelta(days=dias)
            ya_hay = Sismo.objects.filter(
                fecha__gte=inicio, fecha__lt=inicio + timedelta(days=365)
            ).exists()   # exists() = SELECT ... LIMIT 1: lo más barato para preguntar "¿hay alguno?"
            if ya_hay:
                self.stdout.write(self.style.WARNING("Ya existen datos de ese periodo: se omite la descarga."))
                return

        periodo = f"desde {desde:%Y-%m-%d}" if desde else f"de los últimos {dias} días"
        self.stdout.write(f"Descargando sismos M{min_mag}+ {periodo} desde el USGS...")
        try:
            resumen = sincronizar(
                dias=dias, min_mag=min_mag, desde=desde,
                ventana_dias=opciones["ventana_dias"], log=self.stdout.write,
            )
        except requests.RequestException as error:
            # Sin internet, timeout o el USGS caído: error claro en vez de un traceback
            raise CommandError(f"No se pudo descargar del USGS: {error}") from error

        self.stdout.write(f"Descargados: {resumen['descargados']}  |  Válidos: {resumen['validos']}")
        self.stdout.write(f"Descartados por limpieza: {resumen['descartados'] or 'ninguno'}")
        self.stdout.write(self.style.SUCCESS(
            f"Nuevos: {resumen['nuevos']}  |  Actualizados: {resumen['actualizados']}  |  "
            f"Total en BD: {resumen['total_en_bd']}"
        ))
