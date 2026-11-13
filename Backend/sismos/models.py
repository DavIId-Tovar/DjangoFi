"""
Modelo de datos: cada fila de la tabla es UN sismo reportado por el USGS.

Un "modelo" es una clase de Python que Django traduce a una TABLA de la base
de datos. Cada atributo (models.XxxField) es una COLUMNA con un tipo estricto.
"""
from django.db import models


class Sismo(models.Model):
    # --- Categorías con valores cerrados (choices) -------------------------
    # Clasificación sismológica estándar por profundidad del hipocentro.
    # La guardamos ya calculada para poder agrupar (GROUP BY) e indexar rápido.
    class RangoProfundidad(models.TextChoices):
        #  NOMBRE_PY   = "valor_en_BD", "Etiqueta legible"
        SUPERFICIAL = "superficial", "Superficial (0-70 km)"
        INTERMEDIO = "intermedio", "Intermedio (70-300 km)"
        PROFUNDO = "profundo", "Profundo (>300 km)"

    # Nivel de alerta PAGER del USGS (impacto estimado en personas).
    class Alerta(models.TextChoices):
        NINGUNA = "", "Sin alerta"
        VERDE = "green", "Verde"
        AMARILLA = "yellow", "Amarilla"
        NARANJA = "orange", "Naranja"
        ROJA = "red", "Roja"

    # --- Identidad ----------------------------------------------------------
    # ID oficial del USGS (ej. "us7000tule"). unique=True crea un índice
    # ÚNICO en la BD: es lo que impide duplicados al reingestar.
    usgs_id = models.CharField("ID USGS", max_length=30, unique=True)

    # --- Mediciones (numéricas estrictas) -----------------------------------
    # DecimalField = número EXACTO (no float). max_digits=4, decimal_places=2
    # permite de -99.99 a 99.99 (la escala de magnitud llega a ~10).
    magnitud = models.DecimalField(max_digits=4, decimal_places=2, db_index=True)
    tipo_magnitud = models.CharField("tipo de magnitud", max_length=10, db_index=True)
    # Hasta 9999.999 km; puede ser NEGATIVA (eventos sobre el nivel del mar).
    profundidad_km = models.DecimalField("profundidad (km)", max_digits=7, decimal_places=3)
    rango_profundidad = models.CharField(
        "rango de profundidad",
        max_length=12,
        choices=RangoProfundidad.choices,
        db_index=True,
    )
    # Significancia: puntaje entero del USGS (magnitud + impacto + reportes).
    significancia = models.PositiveIntegerField(default=0)

    # --- Ubicación ----------------------------------------------------------
    lugar = models.CharField(max_length=255)            # texto original completo
    region = models.CharField("región", max_length=100, db_index=True)  # normalizada
    latitud = models.DecimalField(max_digits=9, decimal_places=6)
    longitud = models.DecimalField(max_digits=9, decimal_places=6)

    # --- Tiempo -------------------------------------------------------------
    # DateTimeField real (con zona horaria UTC), NO un texto ni un número.
    fecha = models.DateTimeField("fecha (UTC)", db_index=True)

    # --- Clasificación del evento -------------------------------------------
    tipo_evento = models.CharField("tipo de evento", max_length=40, db_index=True)
    alerta = models.CharField(max_length=10, choices=Alerta.choices, blank=True, default="")
    tsunami = models.BooleanField(default=False)
    red = models.CharField("red sísmica", max_length=10)  # red que lo reportó (us, ak, pr...)
    url = models.URLField(max_length=255, blank=True)

    # --- Auditoría ----------------------------------------------------------
    creado_en = models.DateTimeField(auto_now_add=True)   # se llena solo al insertar
    actualizado_en = models.DateTimeField(auto_now=True)  # se actualiza en cada guardado

    class Meta:
        verbose_name = "sismo"
        verbose_name_plural = "sismos"
        ordering = ["-fecha"]  # orden por defecto: los más recientes primero
        # Índices COMPUESTOS para las consultas que más haremos:
        indexes = [
            # "sismos de Chile ordenados por fecha" / stats por región y año
            models.Index(fields=["region", "fecha"], name="idx_region_fecha"),
            # stats por rango de profundidad filtrando por magnitud
            models.Index(fields=["rango_profundidad", "magnitud"], name="idx_rango_mag"),
        ]

    def __str__(self):
        # Cómo se "imprime" un sismo (lo usa el admin y la consola)
        return f"M{self.magnitud} - {self.lugar} ({self.fecha:%Y-%m-%d})"
