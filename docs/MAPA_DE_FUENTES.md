# Mapa de fuentes reales

Este documento describe qué sistema es dueño de cada dato. No se cargan datos ficticios.

| Fuente | Hoja o entidad | Datos que aporta | Clave de integración |
| --- | --- | --- | --- |
| App Control Operaciones | `ID Ventas` | Operaciones, cobros, cuota 1, cuenta de fábrica, sobrepauta, usado, equipo, vendedor y origen | `N° Suscripción` |
| App Control Operaciones | `Modelos_y_Precios` | Marca, modelo, plan, cuota 1 y cuenta de fábrica | marca + modelo + tipo de plan + vigencia |
| App Control Operaciones | `Equipos_de_venta` | Supervisor y vendedores por equipo | nombre normalizado; luego identificador interno de vendedor |
| App Control Operaciones | `Origen_datos` | Canales de origen de leads | nombre normalizado |
| Scoring Peugeot | planilla de Scoring | Estado de auditoría, motivos y comentarios | marca `PEUGEOT` + `SX` + cliente normalizado |
| Fox CRM / Data Extractor | reporte o webhook aprobado | Entrada, reparto y gestión de leads | identificador externo del CRM |
| Informe de mora | CSV/XLSX mensual pendiente | Agrupamiento, cuotas vencidas y deuda | N° Suscripción |

## Operaciones: contrato de datos actual

La aplicación `app_control_operaciones` ya escribe en la hoja **ID Ventas** con estas columnas:

`N° Suscripción`, `Fecha`, `Cliente`, `Marca`, `Modelo`, `Tipo de Plan`, `Seña o Completa`, `Valor Cuota #1`, `Monto Cobrado`, `Autorizó Descuento`, `Cta. Fábrica`, `Sobrepauta`, `¿Entrega Usado?`, `Modelo Usado`, `Año Usado`, `Valor Infoauto`, `Cotización Sugerida`, `Valor Toma`, `Equipo de Venta`, `Vendedor`, `Origen del Dato`.

La importación hará *upsert* por `N° Suscripción`, que es la clave única que ya aplica Apps Script. Esa hoja es la fuente principal de ventas y cobros; no se duplicará manualmente dentro de Nave Planes.

## Scoring Peugeot: contrato de datos conocido

Columnas recibidas: `FECHA`, `Nº`, `CISA`, `DOC`, `SX`, `DEBITO`, `PAGO`, `DEBE`, `MODELO`, `CLIENTE`, `VENDEDOR`, `SUPERVISOR`, `ADM`, `VIDEOLLAMADA`, `MOTIVO RECHAZO 1`, `MOTIVO RECHAZO 2`, `MOTIVO APROBADO`, `MOTIVO ANULADO`, `CATEGORIA`, `COMENTARIOS`.

El registro de auditoría conserva la fila original y se identifica inicialmente por **marca + SX + cliente normalizado**. Esto permite tener más de un contrato para el mismo cliente cuando se reemplaza y se asigna una nueva SX.

Para asociar automáticamente el scoring a la venta de `ID Ventas` falta confirmar una sola equivalencia: ¿la columna `Nº` del Scoring es el mismo valor que `N° Suscripción`? Si no lo es, el extractor almacenará ambas referencias y dejará el vínculo como "pendiente de conciliación" en vez de asociar contratos de forma insegura.

## Flujo de sincronización

1. Apps Script expone la lectura de `ID Ventas`, `Modelos_y_Precios`, `Equipos_de_venta` y `Origen_datos` mediante un endpoint de sólo lectura.
2. El extractor autenticado lee ese endpoint y envía el lote a una Edge Function de Supabase.
3. La Edge Function normaliza las columnas y hace *upsert*.
4. Para cada marca se registra una fuente de Scoring independiente; Peugeot es la primera.
5. Nave Planes consulta exclusivamente Supabase y muestra, aun sin datos, el estado y la fecha de cada fuente.
