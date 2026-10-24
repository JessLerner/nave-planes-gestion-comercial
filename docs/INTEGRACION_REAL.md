# Integración real de Nave Planes

La aplicación no debe usar ejemplos ni datos de prueba. Este repositorio ahora incluye un esquema vacío para Supabase en `supabase/migrations/20261024_001_nave_planes_schema.sql`; ejecutarlo crea únicamente estructura, reglas e índices.

## Estado actual que hay que corregir

- La pantalla puede desplegarse en Vercel, pero el `server.ts` actual es un servidor local Express. Vercel no lo ejecuta como servidor persistente y por eso `/api/data` no es el backend productivo.
- Google Sheets con permiso de lectura necesita un proceso externo autorizado que lea la hoja y escriba en Supabase; no necesita ni debe exponer una clave de Supabase en el navegador.
- Fox CRM debe integrarse por su API/webhook oficial o por el extractor ya existente. La plataforma recibirá datos normalizados, no hará scraping desde el frontend.
- Antes de otorgar acceso a la interfaz hace falta activar Supabase Auth y crear los usuarios reales con sus roles/equipos. Sin eso no es seguro mostrar información comercial, DNI o teléfonos.

## Arquitectura objetivo

`Fox CRM / Google Sheets / CSV mensual -> Extractor o Edge Function -> Supabase -> aplicación Vercel`

1. Supabase es la fuente central de verdad. Ejecutar la migración incluida desde SQL Editor.
2. El extractor se ejecuta con una credencial secreta en servidor y escribe mediante el rol de servicio o una Edge Function protegida con `INGEST_SHARED_SECRET`.
3. La aplicación de Vercel usa únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, con RLS y autenticación por usuario.
4. Cada importación conserva el identificador externo y la fecha de actualización para que repetir una sincronización haga *upsert*, no duplique ventas ni scoring.

## Información necesaria para terminar cada fuente

| Fuente | Lo mínimo necesario | Resultado |
| --- | --- | --- |
| Fox CRM | método aprobado: API, webhook, export CSV programado o reporte | ventas, vendedores, equipos y gestión de leads |
| Google Sheets Scoring | encabezados reales y una fila anonimizada; identificador que cruza con la operación (idealmente número de suscripción) | `scoring_records` y actualización automática de estado |
| Listas de precios | URL/hoja y columnas por marca, o un archivo mensual de ejemplo | `price_lists` |
| Mora | un CSV/XLSX real anonimizado y frecuencia de recepción | importación trazable a `cartera_mora` |
| Personal | responsable y fuente de altas/bajas | vendedores, fechas de ingreso/baja y equipo |

## Reglas ya contempladas en el esquema

- Una operación no puede quedar `apto_fabrica` si su scoring no está aprobado.
- La planilla de scoring no modifica ventas: sólo actualiza la auditoría asociada.
- Los datos personales quedan cerrados por RLS hasta que se incorporen políticas ligadas a usuarios autenticados.
- El objetivo ideal, días hábiles, adelantos y proyecciones se calculan a partir de configuraciones y datos existentes; no hay registros precargados.
