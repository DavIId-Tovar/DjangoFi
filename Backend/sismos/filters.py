"""
Filtros por URL con django-filter.

Cada atributo declara un parámetro que el cliente puede mandar en la URL y la
condición SQL (lookup) que genera. Ejemplo:

    /api/sismos/?mag_min=6&rango_profundidad=profundo&anio=2026

    -> WHERE magnitud >= 6 AND rango_profundidad = 'profundo'
             AND fecha BETWEEN '2026-01-01' AND '2026-12-31 23:59:59.999'

La MISMA clase se reutiliza en /api/sismos/, /api/stats/ y /api/mapa/, así
el listado, las estadísticas y el mapa siempre muestran el mismo subconjunto.
"""
import django_filters

from .models import Sismo


class SismoFilter(django_filters.FilterSet):
    # --- Rangos numéricos ---------------------------------------------------
    mag_min = django_filters.NumberFilter(field_name="magnitud", lookup_expr="gte")   # >=
    mag_max = django_filters.NumberFilter(field_name="magnitud", lookup_expr="lte")   # <=
    prof_min = django_filters.NumberFilter(field_name="profundidad_km", lookup_expr="gte")
    prof_max = django_filters.NumberFilter(field_name="profundidad_km", lookup_expr="lte")

    # --- Rangos de fecha (AAAA-MM-DD) ----------------------------------------
    # "date__gte" compara solo la parte de fecha del DateTimeField
    fecha_desde = django_filters.DateFilter(field_name="fecha", lookup_expr="date__gte")
    fecha_hasta = django_filters.DateFilter(field_name="fecha", lookup_expr="date__lte")
    anio = django_filters.NumberFilter(field_name="fecha", lookup_expr="year")

    # --- Categorías (coincidencia exacta -> aprovecha los índices) -----------
    region = django_filters.CharFilter(field_name="region")
    rango_profundidad = django_filters.ChoiceFilter(choices=Sismo.RangoProfundidad.choices)
    alerta = django_filters.ChoiceFilter(choices=Sismo.Alerta.choices[1:])  # sin la opción vacía
    tipo_evento = django_filters.CharFilter(field_name="tipo_evento")
    tsunami = django_filters.BooleanFilter(field_name="tsunami")

    class Meta:
        model = Sismo
        fields = []   # todos los filtros están declarados arriba explícitamente
