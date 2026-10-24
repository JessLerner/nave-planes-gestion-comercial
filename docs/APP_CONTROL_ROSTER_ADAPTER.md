# Adaptador de nómina para App Control Operaciones

La hoja `Equipos_de_venta` ya tiene el formato correcto: `SUPERVISOR`, `VENDEDOR`, `ACTIVO`, `VENTA POR VEND`. La implementación actual de Apps Script convierte la hoja a un formato antiguo y pierde `ACTIVO`; por seguridad, Nave Planes no automatizará la sincronización hasta que la respuesta preserve ese campo.

En el Apps Script que está desplegado (no en la hoja), sustituir la función `getEquipos` por esta versión. Sólo lee la hoja y no cambia celdas, filtros ni la aplicación Parte Diario.

```javascript
function getEquipos(ss) {
  const sheet = ss.getSheetByName(SHEETS.EQUIPOS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const supervisorColumn = headerIndex(headers, ['SUPERVISOR']);
  const sellerColumn = headerIndex(headers, ['VENDEDOR']);
  const activeColumn = headerIndex(headers, ['ACTIVO']);
  if (supervisorColumn < 0 || sellerColumn < 0 || activeColumn < 0) {
    throw new Error('Equipos_de_venta requiere SUPERVISOR, VENDEDOR y ACTIVO.');
  }

  const bySupervisor = {};
  values.slice(1).forEach(function(row) {
    const supervisor = String(row[supervisorColumn] || '').trim();
    const name = String(row[sellerColumn] || '').trim();
    if (!supervisor || !name) return;
    if (!bySupervisor[supervisor]) bySupervisor[supervisor] = [];
    bySupervisor[supervisor].push({
      name: name,
      active: key(row[activeColumn]) === 'si'
    });
  });
  return Object.keys(bySupervisor).map(function(supervisor) {
    return { supervisor: supervisor, vendedores: bySupervisor[supervisor] };
  });
}
```

Después de desplegar una nueva versión de Apps Script, la Edge Function `sync-app-control-roster` leerá esa respuesta y hará *upsert* de los vendedores activos. Descarta `Convencional` antes de escribir en Supabase.
