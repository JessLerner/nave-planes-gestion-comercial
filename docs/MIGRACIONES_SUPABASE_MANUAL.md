# Migración manual de Supabase

En **Supabase → SQL Editor**, ejecutar una única vez y completa:

`supabase/migrations/20261030_022_manual_schema_reconciliation.sql`

Es idempotente: agrega lo que falte y no borra personas, equipos, ventas,
usuarios ni historiales. Incluye los cambios que requiere la versión actual:
cargos y mapeos RRHH, jerarquía/gerente efectivo, equipos comerciales,
staging de importación, detalle de usados y notas de anticipos.

No ejecutar `20261030_012_reset_roster_foundation.sql` en producción: esa
migración fue un reinicio histórico y elimina nómina, vendedores y equipos.
