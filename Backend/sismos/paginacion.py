"""
Paginación desde el servidor.

/api/sismos/?page=3&page_size=50  ->  SQL: ... LIMIT 50 OFFSET 100
                                     + un SELECT COUNT(*) para el total.
Nunca se envían los 55.000 registros: solo la página pedida.
"""
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PaginacionSismos(PageNumberPagination):
    page_size = 25                       # filas por página por defecto
    page_size_query_param = "page_size"  # el cliente puede pedir otro tamaño...
    max_page_size = 100                  # ...pero nunca más de 100 (protege al servidor)

    def get_paginated_response(self, data):
        # Sobrescribimos la respuesta para incluir también la página actual y el total de páginas.
        return Response({
            "count": self.page.paginator.count,          # total de registros que cumplen el filtro
            "total_paginas": self.page.paginator.num_pages,
            "pagina": self.page.number,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        })
