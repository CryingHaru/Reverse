Algoritmo completo de segmentación
1. Determinación del tamaño de segmento
El primer paso es determinar si el stream necesita segmentación basándose en si está limitado por velocidad (throttled): MediaStream.cs:20-22

Lógica de decisión:

Si streamInfo.IsThrottled() retorna true: usar segmentos de 9,898,989 bytes (~9.9 MB)
Si es false: usar el tamaño completo del archivo (streamInfo.Size.Bytes)
2. Estructura de datos para manejo de segmentos
La clase MediaStream mantiene estas variables de estado: MediaStream.cs:24-25

_segmentStream: El stream HTTP actual del segmento
_actualPosition: La posición real de lectura en el archivo
3. Algoritmo de resolución de segmentos
Cuando se necesita un nuevo segmento, se ejecuta este proceso: MediaStream.cs:46-57

Pasos detallados:

Verificar si ya existe un segmento activo (_segmentStream is not null)
Si no existe, calcular la URL del segmento usando la posición actual
Realizar solicitud HTTP para obtener el segmento
Almacenar el stream resultante
4. Cálculo de URLs de segmento
La función GetSegmentUrl construye URLs con parámetros de rango: MediaStream.cs:53

Fórmula de cálculo:

Inicio del rango: Position (posición actual)
Final del rango: Position + _segmentLength - 1
Formato URL: {baseUrl}&range={inicio}-{fin}
5. Algoritmo principal de lectura
El método ReadAsync implementa la lógica completa: MediaStream.cs:85-114

Flujo de ejecución:

Verificación de posición: Si la posición cambió desde la última lectura, resetear el segmento
Verificación de fin de archivo: Si se alcanzó el final, retornar 0 bytes
Lectura del segmento: Llamar a ReadSegmentAsync para obtener datos
Actualización de posición: Incrementar la posición por los bytes leídos
Manejo de fin de segmento: Si se leyeron 0 bytes, resetear y continuar con el siguiente segmento
6. Manejo de errores y reintentos
El sistema incluye reintentos automáticos: MediaStream.cs:69-83

Estrategia de reintentos:

Máximo 5 intentos por segmento
Capturar HttpRequestException e IOException
En caso de error, resetear el segmento y reintentar
7. Verificación de disponibilidad de rangos
Antes de usar segmentación, se verifica que el servidor soporte rangos: StreamClient.cs:71-83

Proceso de verificación:

Solicitar el último byte del archivo (contentLength - 2 a contentLength - 1)
Si retorna 404, el stream no soporta rangos o tiene longitud incorrecta
Si es exitoso, proceder con la segmentación