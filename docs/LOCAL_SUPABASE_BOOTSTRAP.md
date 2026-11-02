# Supabase local aislado

Este procedimiento crea sólo una instancia Docker local. No ejecutar `supabase link`, `db push`, ni usar una URL remota.

## Requisitos

- Docker Desktop en ejecución.
- Node.js y acceso a `npx`.

## Bootstrap reproducible

Desde la raíz del repositorio:

```powershell
node scripts/generate-local-supabase-migrations.mjs
npx --yes supabase@latest --workdir .local-supabase start
$env:NAVE_TEST_DATABASE_URL = ((npx --yes supabase@latest --workdir .local-supabase status --output env | Where-Object { $_ -like 'DB_URL=*' }) -replace '^DB_URL=', '')
node scripts/verify-local-legajos-schema.mjs
node scripts/run-local-legajos-integration.mjs
Remove-Item Env:NAVE_TEST_DATABASE_URL
```

El generador conserva `supabase/migrations/` como fuente de verdad, crea copias byte a byte en `.local-supabase/supabase/migrations/` con versiones de 14 dígitos compatibles con la CLI y actualiza `supabase/local-bootstrap-manifest.json`. El árbol `.local-supabase/` está ignorado por Git.

La prueba de integración usa únicamente `127.0.0.1:54322`, genera datos sintéticos y revierte su transacción.

## Reinicio desde cero

```powershell
npx --yes supabase@latest --workdir .local-supabase db reset --local --no-seed
$env:NAVE_TEST_DATABASE_URL = ((npx --yes supabase@latest --workdir .local-supabase status --output env | Where-Object { $_ -like 'DB_URL=*' }) -replace '^DB_URL=', '')
node scripts/verify-local-legajos-schema.mjs
node scripts/run-local-legajos-integration.mjs
Remove-Item Env:NAVE_TEST_DATABASE_URL
```

## Detener el entorno

```powershell
npx --yes supabase@latest --workdir .local-supabase stop
```

No almacenar valores de `supabase status --output env` en archivos versionados.
