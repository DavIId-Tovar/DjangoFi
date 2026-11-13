"""
Rutas de la app. Todas quedan bajo /api/ (ver config/urls.py).

El DefaultRouter genera solo las rutas del CRUD a partir del ViewSet:
    /api/sismos/        (list, create)
    /api/sismos/<id>/   (retrieve, update, partial_update, destroy)
y además una página raíz /api/ que lista los endpoints (útil para el profesor).
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("sismos", views.SismoViewSet, basename="sismo")

urlpatterns = [
    path("stats/", views.EstadisticasView.as_view(), name="stats"),
    path("comparar/", views.ComparadorView.as_view(), name="comparar"),
    path("mapa/", views.MapaView.as_view(), name="mapa"),
    path("opciones/", views.OpcionesView.as_view(), name="opciones"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("yo/", views.YoView.as_view(), name="yo"),
    path("sincronizar/", views.SincronizarView.as_view(), name="sincronizar"),
] + router.urls
