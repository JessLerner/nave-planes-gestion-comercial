# Migración manual de Supabase

En **Supabase → SQL Editor**, ejecutar una única vez y completa:

`supabase/migrations/20261030_022_manual_schema_reconciliation.sql`

Es idempotente: agrega lo que falte y no borra personas, equipos, ventas,
usuarios ni historiales. Incluye los cambios que requiere la versión actual:
cargos y mapeos RRHH, jerarquía/gerente efectivo, equipos comerciales,
staging de importación, detalle de usados y notas de anticipos.

No ejecutar `20261030_012_reset_roster_foundation.sql` en producción: esa
migración fue un reinicio histórico y elimina nómina, vendedores y equipos.

Después de cambiar la aplicación para que un Supervisor cree su equipo
automáticamente, ejecutar una vez `20261030_023_backfill_supervisor_teams.sql`
para reconciliar los Supervisores que ya existían.

Para habilitar Históricos y distinguir una baja real de una corrección
administrativa, ejecutar una vez `20261031_024_staff_exit_history.sql`.

Para conservar excepciones manuales de gerente en cargos no vendedores,
ejecutar una vez `20261031_025_preserve_manual_manager_override.sql`.

La regla vigente para vendedores es que el gerente se hereda exclusivamente
del supervisor. Para normalizar los vendedores ya existentes, ejecutar una vez
`20261031_026_vendor_manager_inheritance.sql` después de la `025`.
