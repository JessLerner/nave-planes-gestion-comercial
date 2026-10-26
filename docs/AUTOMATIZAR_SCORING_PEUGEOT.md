# Automatizar Scoring Peugeot

La importación piloto fue manual sólo para validar el circuito. La operación regular se realiza con `apps-script/sync_scoring_peugeot.gs`.

## Qué hace

- Lee, pero nunca modifica, el archivo compartido de Scoring Peugeot.
- Incluye las pestañas cuyo nombre comienza por `PEUGEOT`.
- Sólo envía filas con `FECHA` igual o posterior a `NAVE_SCORING_START_DATE`.
- Conserva los encabezados reales y usa `SX` como clave.
- Envía lotes de hasta 400 filas a `ingest-scoring-sheet`.
- Repetir la sincronización actualiza registros existentes, sin duplicarlos.
- No registra filas, clientes ni credenciales en los logs.

## Instalación única

1. Crear un proyecto Apps Script independiente desde la cuenta que tiene acceso de lectura a la hoja.
2. Pegar `apps-script/sync_scoring_peugeot.gs` y guardar.
3. En **Project Settings → Script properties**, crear:
   - `NAVE_SCORING_INGEST_SECRET`: el mismo valor de `INGEST_SHARED_SECRET` de Supabase. No pegarlo en código ni compartirlo por chat.
   - `NAVE_SCORING_START_DATE`: la primera fecha que debe importar, en formato `YYYY-MM-DD`. Para comenzar en octubre de 2026: `2026-10-01`.
4. Ejecutar primero `syncPeugeotScoringPilot`: sincroniza sólo las primeras cinco filas con SX y solicita los permisos de lectura de Sheets y salida HTTP hacia Supabase.
5. Verificar que Supabase recibió cinco filas y que no se duplicaron las ya importadas.
6. Si el resultado es correcto, ejecutar una vez `installPeugeotScoringSixHourlyTrigger` para dejar un único disparador cada seis horas. El disparador usa la sincronización completa.

El proyecto de Parte Diario no se toca: este conector se ejecuta por separado.
