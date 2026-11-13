"""
Serializers: traducen entre objetos Sismo (Python) y JSON (lo que viaja por HTTP).

- Al LEER (GET):     Sismo  -> dict -> JSON
- Al ESCRIBIR (POST/PUT): JSON -> dict -> VALIDACIÓN -> Sismo guardado
"""
from rest_framework import serializers

from .ingesta import clasificar_profundidad, normalizar_region
from .models import Sismo


class SismoSerializer(serializers.ModelSerializer):
    # Campo extra de solo lectura con la etiqueta legible: "Superficial (0-70 km)"
    rango_profundidad_display = serializers.CharField(
        source="get_rango_profundidad_display", read_only=True
    )

    class Meta:
        model = Sismo
        fields = [
            "id", "usgs_id", "magnitud", "tipo_magnitud", "profundidad_km",
            "rango_profundidad", "rango_profundidad_display", "significancia",
            "lugar", "region", "latitud", "longitud", "fecha", "tipo_evento",
            "alerta", "tsunami", "red", "url", "creado_en", "actualizado_en",
        ]
        # Estos los calcula el servidor; el cliente no puede imponerlos.
        read_only_fields = ["rango_profundidad", "creado_en", "actualizado_en"]
        extra_kwargs = {"region": {"required": False}}

    # validate_<campo>: validación de UN campo. Si falla -> respuesta 400.
    def validate_magnitud(self, valor):
        if not -2 <= valor <= 10:
            raise serializers.ValidationError("La magnitud debe estar entre -2 y 10.")
        return valor

    def validate_latitud(self, valor):
        if not -90 <= valor <= 90:
            raise serializers.ValidationError("La latitud debe estar entre -90 y 90.")
        return valor

    def validate_longitud(self, valor):
        if not -180 <= valor <= 180:
            raise serializers.ValidationError("La longitud debe estar entre -180 y 180.")
        return valor

    # validate(): validación de VARIOS campos juntos. Aquí derivamos valores
    # con las MISMAS reglas de la ingesta, para que los datos sean coherentes.
    def validate(self, datos):
        profundidad = datos.get("profundidad_km", getattr(self.instance, "profundidad_km", None))
        if profundidad is not None:
            datos["rango_profundidad"] = clasificar_profundidad(profundidad)
        if not datos.get("region") and datos.get("lugar"):
            datos["region"] = normalizar_region(datos["lugar"])
        return datos
