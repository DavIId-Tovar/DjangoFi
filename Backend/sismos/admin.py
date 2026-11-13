"""
Configuración del panel /admin/ para el modelo Sismo.

@admin.register(Sismo) le dice a Django: "muestra este modelo en el admin
usando la configuración de la clase SismoAdmin".
"""
from django.contrib import admin

from .models import Sismo


@admin.register(Sismo)
class SismoAdmin(admin.ModelAdmin):
    # Columnas visibles en el listado
    list_display = (
        "usgs_id", "magnitud", "tipo_magnitud", "lugar", "region",
        "profundidad_km", "rango_profundidad", "fecha", "alerta", "tsunami",
    )
    # Columnas que son enlaces al detalle
    list_display_links = ("usgs_id", "lugar")

    # Caja de búsqueda: genera WHERE ... LIKE '%texto%' sobre estos campos.
    # "=usgs_id" significa búsqueda EXACTA (más rápida, usa el índice único).
    search_fields = ("lugar", "region", "=usgs_id")

    # Filtros laterales (barra derecha)
    list_filter = ("rango_profundidad", "tipo_evento", "alerta", "tsunami", "tipo_magnitud", "red")

    # Navegación por año -> mes -> día encima del listado
    date_hierarchy = "fecha"

    ordering = ("-fecha",)
    list_per_page = 50

    # Campos de auditoría: se ven pero no se editan
    readonly_fields = ("creado_en", "actualizado_en")

    # Agrupa el formulario de edición en secciones
    fieldsets = (
        ("Identificación", {"fields": ("usgs_id", "lugar", "region", "url")}),
        ("Medición", {"fields": ("magnitud", "tipo_magnitud", "profundidad_km",
                                 "rango_profundidad", "significancia")}),
        ("Ubicación y tiempo", {"fields": ("latitud", "longitud", "fecha")}),
        ("Clasificación", {"fields": ("tipo_evento", "alerta", "tsunami", "red")}),
        ("Auditoría", {"fields": ("creado_en", "actualizado_en")}),
    )
