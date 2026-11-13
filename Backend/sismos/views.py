"""
Vistas de la API. Cada clase atiende una URL (ver sismos/urls.py).

REGLA DE ORO DE ESTE ARCHIVO: ninguna métrica se calcula recorriendo filas en
Python. Todo conteo, suma, promedio, mínimo o máximo se le pide a la base de
datos con aggregate() / annotate(), que el ORM traduce a SQL con
COUNT / SUM / AVG / MIN / MAX y GROUP BY.

  .aggregate(...)                 -> UNA fila de resumen   (SELECT AVG(...) FROM ...)
  .values("x").annotate(...)      -> UNA fila POR GRUPO    (SELECT x, AVG(...) ... GROUP BY x)
  Count("id", filter=Q(...))      -> conteo condicional    (COUNT(id) FILTER (WHERE ...))
"""
from datetime import datetime, timedelta, timezone as dt_timezone

import requests
from django.db.models import (
    Avg, Count, ExpressionWrapper, IntegerField, Max, Min, Q, Sum, Value,
)
from django.db.models.functions import Cast, ExtractMonth, ExtractYear, Round, TruncMonth, TruncYear
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .filters import SismoFilter
from .ingesta import sincronizar
from .models import Sismo
from .serializers import SismoSerializer

# Campos de búsqueda libre (?search=...). "=" -> coincidencia exacta.
CAMPOS_BUSQUEDA = ["lugar", "region", "=usgs_id"]

# Magnitud a partir de la cual el catálogo mundial es completo desde 1970.
UMBRAL_COMPLETITUD = 5.5

# Bandas de magnitud: (clave, etiqueta, mínimo incluido, máximo excluido o None)
BANDAS_GENERALES = [
    ("m_menor4", "< 4", None, 4), ("m4_5", "4 – 5", 4, 5), ("m5_6", "5 – 6", 5, 6),
    ("m6_7", "6 – 7", 6, 7), ("m7_mas", "≥ 7", 7, None),
]
BANDAS_COMPARADOR = [
    ("m55_60", "5.5 – 6", 5.5, 6), ("m60_65", "6 – 6.5", 6, 6.5), ("m65_70", "6.5 – 7", 6.5, 7),
    ("m70_80", "7 – 8", 7, 8), ("m80_mas", "≥ 8", 8, None),
]

# Década calculada EN SQL:  CAST(EXTRACT(YEAR FROM fecha) AS INTEGER) / 10 * 10
# El Cast es necesario porque PostgreSQL devuelve EXTRACT como número decimal y
# 1994.0 / 10 * 10 = 1994 (no 1990). Con enteros, 1994 / 10 = 199 -> * 10 = 1990.
DECADA = ExpressionWrapper(
    Cast(ExtractYear("fecha"), IntegerField()) / Value(10) * Value(10),
    output_field=IntegerField(),
)


# ---------------------------------------------------------------------------
# Piezas reutilizables de agregación (son EXPRESIONES SQL, no cálculos en Python)
# ---------------------------------------------------------------------------
def metricas_base():
    """Las 5 agregaciones clásicas sobre el subconjunto."""
    return {
        "total": Count("id"),
        "magnitud_promedio": Round(Avg("magnitud"), 2),
        "magnitud_max": Max("magnitud"),
        "magnitud_min": Min("magnitud"),
        "profundidad_promedio": Round(Avg("profundidad_km"), 1),
        "significancia_total": Sum("significancia"),
        "tsunamis": Count("id", filter=Q(tsunami=True)),
    }


def conteos_por_rango():
    """Pivote en SQL: una columna de conteo por cada rango de profundidad."""
    return {
        "superficial": Count("id", filter=Q(rango_profundidad=Sismo.RangoProfundidad.SUPERFICIAL)),
        "intermedio": Count("id", filter=Q(rango_profundidad=Sismo.RangoProfundidad.INTERMEDIO)),
        "profundo": Count("id", filter=Q(rango_profundidad=Sismo.RangoProfundidad.PROFUNDO)),
    }


def conteos_por_banda(bandas):
    """Una expresión COUNT(...) FILTER (WHERE magnitud >= x AND magnitud < y) por banda."""
    expresiones = {}
    for clave, _etiqueta, minimo, maximo in bandas:   # recorre la DEFINICIÓN de 5 bandas, no filas
        condicion = Q()
        if minimo is not None:
            condicion &= Q(magnitud__gte=minimo)
        if maximo is not None:
            condicion &= Q(magnitud__lt=maximo)
        expresiones[clave] = Count("id", filter=condicion)
    return expresiones


def etiquetas(bandas):
    return [{"clave": clave, "etiqueta": etiqueta} for clave, etiqueta, *_ in bandas]


CAMPOS_EVENTO = ("id", "usgs_id", "magnitud", "lugar", "region", "fecha", "profundidad_km")


# ---------------------------------------------------------------------------
# 1. CRUD  -> /api/sismos/  y  /api/sismos/<id>/
# ---------------------------------------------------------------------------
class SismoViewSet(viewsets.ModelViewSet):
    """
    Un ModelViewSet trae las 6 acciones listas:
      GET    /api/sismos/        list      (paginado, con búsqueda, orden y filtros)
      POST   /api/sismos/        create    (requiere token)
      GET    /api/sismos/<id>/   retrieve
      PUT    /api/sismos/<id>/   update    (requiere token)
      PATCH  /api/sismos/<id>/   partial_update (requiere token)
      DELETE /api/sismos/<id>/   destroy   (requiere token)
    """
    queryset = Sismo.objects.all()
    serializer_class = SismoSerializer
    # Leer es público; crear/editar/borrar exige estar autenticado (si no -> 401)
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SismoFilter                 # ?mag_min=6&region=Chile ...
    search_fields = CAMPOS_BUSQUEDA               # ?search=fiji
    ordering_fields = ["fecha", "magnitud", "profundidad_km", "significancia", "region"]  # ?ordering=-magnitud
    ordering = ["-fecha"]


# ---------------------------------------------------------------------------
# Base común: aplica EXACTAMENTE los mismos filtros que el listado
# ---------------------------------------------------------------------------
class FiltrosSismoMixin:
    queryset = Sismo.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = SismoFilter
    search_fields = CAMPOS_BUSQUEDA
    pagination_class = None
    permission_classes = [AllowAny]


# ---------------------------------------------------------------------------
# 2. ESTADÍSTICAS (eje central) -> /api/stats/?<mismos filtros del listado>
# ---------------------------------------------------------------------------
class EstadisticasView(FiltrosSismoMixin, generics.GenericAPIView):
    def get(self, request):
        # filter_queryset aplica ?search, ?region, ?mag_min... -> WHERE dinámico
        qs = self.filter_queryset(self.get_queryset())

        # (a) Resumen global: UNA consulta, UNA fila.
        resumen = qs.aggregate(
            **metricas_base(),
            profundidad_max=Max("profundidad_km"),
            regiones=Count("region", distinct=True),
            fecha_min=Min("fecha"),
            fecha_max=Max("fecha"),
        )

        # (b) El evento más fuerte: ORDER BY magnitud DESC LIMIT 1
        mas_fuerte = qs.order_by("-magnitud", "-fecha").values(*CAMPOS_EVENTO).first()

        # (c) Serie temporal. Si el subconjunto abarca más de 3 años, agrupamos
        #     por AÑO; si no, por MES (si no, el gráfico tendría cientos de puntos).
        rango_dias = 0
        if resumen["fecha_min"] and resumen["fecha_max"]:
            rango_dias = (resumen["fecha_max"] - resumen["fecha_min"]).days
        granularidad = "anio" if rango_dias > 3 * 365 else "mes"
        truncar = TruncYear("fecha") if granularidad == "anio" else TruncMonth("fecha")
        serie = (
            qs.annotate(periodo=truncar)              # columna calculada: fecha truncada
            .values("periodo")                       # GROUP BY periodo
            .annotate(total=Count("id"),
                      magnitud_promedio=Round(Avg("magnitud"), 2),
                      magnitud_max=Max("magnitud"),
                      **conteos_por_rango())
            .order_by("periodo")
        )

        # (d) Dimensión 1 -> región (top 12) con pivote por rango de profundidad:
        #     cruce de DOS dimensiones (región × profundidad) en una sola consulta.
        por_region = (
            qs.values("region")
            .annotate(**metricas_base(), **conteos_por_rango())
            .order_by("-total")[:12]
        )

        # (e) Dimensión 2 -> rango de profundidad
        por_rango = (
            qs.values("rango_profundidad")
            .annotate(total=Count("id"),
                      magnitud_promedio=Round(Avg("magnitud"), 2),
                      magnitud_max=Max("magnitud"),
                      profundidad_promedio=Round(Avg("profundidad_km"), 1))
            .order_by("rango_profundidad")
        )

        # (f) Distribución por banda de magnitud (conteo condicional)
        por_banda = qs.aggregate(**conteos_por_banda(BANDAS_GENERALES))

        # (g) Tipo de evento (sismo, explosión minera, etc.)
        por_tipo = qs.values("tipo_evento").annotate(total=Count("id")).order_by("-total")[:8]

        return Response({
            "resumen": resumen,
            "evento_mas_fuerte": mas_fuerte,
            "granularidad": granularidad,
            "serie": list(serie),
            "por_region": list(por_region),
            "por_rango": list(por_rango),
            "por_banda": por_banda,
            "bandas": etiquetas(BANDAS_GENERALES),
            "por_tipo": list(por_tipo),
        })


# ---------------------------------------------------------------------------
# 3. MÓDULO EXTRA: COMPARADOR TEMPORAL -> /api/comparar/?modo=decada&a=1990&b=2010
# ---------------------------------------------------------------------------
class ComparadorView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        p = request.query_params
        modo = p.get("modo", "decada")
        if modo not in ("anio", "decada"):
            return Response({"detail": "modo debe ser 'anio' o 'decada'."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            a, b = int(p["a"]), int(p["b"])
            min_mag = float(p.get("min_mag", UMBRAL_COMPLETITUD))
        except (KeyError, ValueError):
            return Response({"detail": "Parámetros a y b (años enteros) son obligatorios."},
                            status=status.HTTP_400_BAD_REQUEST)

        largo = 1 if modo == "anio" else 10
        if modo == "decada":
            a, b = a // 10 * 10, b // 10 * 10   # 1994 -> 1990

        base = Sismo.objects.filter(magnitud__gte=min_mag)
        region = p.get("region") or None
        if region:
            base = base.filter(region=region)

        # Línea de tiempo general: GROUP BY década (columna calculada en SQL)
        linea_tiempo = (
            base.annotate(decada=DECADA)
            .values("decada")
            .annotate(total=Count("id"),
                      magnitud_promedio=Round(Avg("magnitud"), 2),
                      magnitud_max=Max("magnitud"),
                      anios_con_datos=Count(ExtractYear("fecha"), distinct=True))
            .order_by("decada")
        )

        # Advertencia de sesgo: la capa M<5.5 solo existe para el último año.
        advertencia = None
        corte = datetime.now(dt_timezone.utc) - timedelta(days=365)
        if min_mag < UMBRAL_COMPLETITUD and min(a, b) < corte.year:
            advertencia = (
                f"Con magnitud mínima {min_mag} la comparación está sesgada: antes de "
                f"{corte:%Y-%m} solo hay datos M{UMBRAL_COMPLETITUD}+ (umbral de completitud "
                "del catálogo). Use M ≥ 5.5 para comparar de forma justa."
            )

        return Response({
            "modo": modo,
            "min_mag": min_mag,
            "region": region,
            "bandas": etiquetas(BANDAS_COMPARADOR),
            "a": self.analizar(base, a, largo, modo),
            "b": self.analizar(base, b, largo, modo),
            "linea_tiempo": list(linea_tiempo),
            "advertencia": advertencia,
        })

    @staticmethod
    def analizar(base, inicio, largo, modo):
        """Todas las métricas de UN periodo (año o década)."""
        # fecha__year__gte / __lt -> WHERE fecha >= 'inicio-01-01' AND fecha < 'fin-01-01'
        qs = base.filter(fecha__year__gte=inicio, fecha__year__lt=inicio + largo)

        resumen = qs.aggregate(
            **metricas_base(),
            profundidad_max=Max("profundidad_km"),
            anios_con_datos=Count(ExtractYear("fecha"), distinct=True),
            **conteos_por_banda(BANDAS_COMPARADOR),
            **conteos_por_rango(),
        )
        # Tasa anual (para comparar una década incompleta de forma justa):
        # una división entre DOS números que ya calculó la BD.
        anios = resumen["anios_con_datos"] or 0
        resumen["promedio_anual"] = round(resumen["total"] / anios, 1) if anios else 0

        # Serie interna alineada por posición: mes 1..12 (año) o año 0..9 de la década
        if modo == "anio":
            indice = ExtractMonth("fecha")
        else:
            indice = ExpressionWrapper(ExtractYear("fecha") - Value(inicio), output_field=IntegerField())
        serie = (
            qs.annotate(indice=indice).values("indice")
            .annotate(total=Count("id"), magnitud_promedio=Round(Avg("magnitud"), 2),
                      magnitud_max=Max("magnitud"))
            .order_by("indice")
        )
        top_regiones = (
            qs.values("region").annotate(total=Count("id"), magnitud_max=Max("magnitud"))
            .order_by("-total")[:6]
        )
        return {
            "inicio": inicio,
            "etiqueta": str(inicio) if modo == "anio" else f"{inicio}s",
            "resumen": resumen,
            "serie": list(serie),
            "top_regiones": list(top_regiones),
            "evento_mas_fuerte": qs.order_by("-magnitud", "-fecha").values(*CAMPOS_EVENTO).first(),
        }


# ---------------------------------------------------------------------------
# 4. MAPA -> /api/mapa/?<mismos filtros>  (puntos livianos, sin paginar)
# ---------------------------------------------------------------------------
class MapaView(FiltrosSismoMixin, generics.GenericAPIView):
    LIMITE = 3000

    def get(self, request):
        qs = self.filter_queryset(self.get_queryset())
        # values_list -> tuplas compactas [id, lat, lon, mag, prof, lugar, fecha]:
        # el JSON pesa mucho menos que con objetos completos.
        puntos = qs.order_by("-magnitud").values_list(
            "id", "latitud", "longitud", "magnitud", "profundidad_km", "lugar", "fecha"
        )[: self.LIMITE]
        return Response({"total": qs.count(), "limite": self.LIMITE, "puntos": list(puntos)})


# ---------------------------------------------------------------------------
# 5. OPCIONES para los desplegables -> /api/opciones/
# ---------------------------------------------------------------------------
class OpcionesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        sismos = Sismo.objects.all()
        return Response({
            "total": sismos.count(),
            "regiones": list(sismos.values("region").annotate(total=Count("id")).order_by("-total")),
            "tipos_evento": list(sismos.values("tipo_evento").annotate(total=Count("id")).order_by("-total")),
            # SELECT DISTINCT año ... ORDER BY año DESC
            "anios": list(sismos.annotate(anio=ExtractYear("fecha")).values_list("anio", flat=True)
                          .distinct().order_by("-anio")),
            "decadas": list(sismos.annotate(decada=DECADA).values_list("decada", flat=True)
                            .distinct().order_by("-decada")),
            "rangos": [{"valor": v, "etiqueta": e} for v, e in Sismo.RangoProfundidad.choices],
            "alertas": [{"valor": v, "etiqueta": e} for v, e in Sismo.Alerta.choices if v],
            "umbral_completitud": UMBRAL_COMPLETITUD,
            # Fecha desde la que existe la capa detallada (M < 5.5)
            "inicio_capa_reciente": sismos.filter(magnitud__lt=UMBRAL_COMPLETITUD).aggregate(f=Min("fecha"))["f"],
        })


# ---------------------------------------------------------------------------
# 6. SEGURIDAD: login con token y acción protegida
# ---------------------------------------------------------------------------
class LoginView(ObtainAuthToken):
    """
    POST /api/login/  {"username": "...", "password": "..."}
    -> {"token": "9944b09199c6...", "usuario": "..."}
    """
    permission_classes = [AllowAny]
    authentication_classes = []   # el login no debe exigir (ni validar) un token previo

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)        # usuario/clave inválidos -> 400
        usuario = serializer.validated_data["user"]
        token, _creado = Token.objects.get_or_create(user=usuario)  # 1 token por usuario
        return Response({"token": token.key, "usuario": usuario.username, "es_staff": usuario.is_staff})


class LogoutView(APIView):
    """POST /api/logout/ -> borra el token (lo invalida en el servidor)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.delete()   # request.auth es el objeto Token que llegó en la cabecera
        return Response({"detail": "Sesión cerrada: el token fue revocado."})


class YoView(APIView):
    """GET /api/yo/ -> ¿de quién es este token?"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"usuario": request.user.username, "es_staff": request.user.is_staff})


class SincronizarView(APIView):
    """
    POST /api/sincronizar/  (cabecera Authorization: Token <clave>)
    Descarga del USGS los sismos de los últimos N días (1..30) y hace UPSERT.
    Sin token válido -> 401 Unauthorized (nunca llega a ejecutar este código).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            dias = int(request.data.get("dias", 7))
        except (TypeError, ValueError):
            return Response({"detail": "dias debe ser un entero."}, status=status.HTTP_400_BAD_REQUEST)
        dias = max(1, min(dias, 30))
        try:
            resumen = sincronizar(dias=dias, min_mag=2.5, log=lambda *_: None)
        except requests.RequestException as error:
            return Response({"detail": f"El USGS no respondió: {error}"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({
            "detail": f"Sincronización completada: últimos {dias} días.",
            "ejecutado_por": request.user.username,
            "dias": dias,
            **resumen,
        })
