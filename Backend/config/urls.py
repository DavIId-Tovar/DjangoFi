"""
El "conmutador" principal: decide qué código atiende cada URL.

    /admin/...  -> panel de administración de Django
    /api/...    -> la API (sismos/urls.py)
    /...        -> cualquier otra ruta: la app de React (index.html)
"""
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("sismos.urls")),
    # Comodín AL FINAL: todo lo que no sea admin/, api/ ni static/ devuelve el
    # index.html compilado de React. React decide qué pantalla mostrar.
    re_path(r"^(?!api/|admin/|static/).*$", TemplateView.as_view(template_name="index.html"), name="frontend"),
]
