# Plan de implementación: listas de precios y circulares

**Estado:** en implementación  
**Última actualización:** 31/10/2026

## Objetivo

Incorporar en Nave un módulo de listas de precios de planes de ahorro, a partir de circulares oficiales de cada marca. Debe conservar la fuente, generar listas exportables, aplicar sellado de Provincia de Buenos Aires y controlar la publicación comercial por estructura.

## Decisiones cerradas

- No se incorporará IA. La importación será mecánica: Excel estructurado, adaptadores por formato PDF o carga asistida verificable.
- Administración General y Dirección cargan, corrigen y publican listas para Gerencia.
- Las listas no usan PIN ni `localStorage`. Los permisos se aplican en Supabase y en las APIs.
- Una lista puede asociar varias circulares de una misma marca/período: precios, cuotas, adjudicación asegurada y condiciones comerciales.
- La marca se detecta cuando sea posible, pero Administración/Dirección siempre puede confirmarla o corregirla.
- La lista se publica por marca, vigencia y versión. Las versiones anteriores conservan su historial.
- El sellado se calcula siempre para Provincia de Buenos Aires y se suma exclusivamente a las cuotas/rangos indicados por la circular. Renault es la excepción operativa: se muestra y cobra como **Cuota 0 · Sellado**, antes de la cuota 1.
- Mientras se valida su circular de origen, el importador Renault adiciona $15.000 a cada cuota publicada para aproximar la lista comercial utilizada por vendedores y supervisores. El adicional queda centralizado y es revisable.
- MG se muestra en pesos. Al publicar se toma dólar vendedor Banco Nación, se guarda fecha, fuente y cotización aplicada, y Administración/Dirección puede corregirlo manualmente dejando auditoría.

## Circuito de publicación

```text
Administración General / Dirección
  carga documentos + arma lista + define sobrepauta base (> $0)
        ↓
Lista publicada para Gerencia
  aún no visible para Supervisión
        ↓
Cada gerente confirma su estructura
  conserva o incrementa sobrepautas por modelo
        ↓
Lista vigente para Supervisión de esa estructura
```

### Sobrepautas

- La sobrepauta es obligatoria y mayor que cero para todos los modelos antes de publicar al circuito comercial.
- Cada gerente administra sólo los valores de las estructuras a su cargo.
- El gerente puede conservar la sobrepauta recibida o incrementarla. Nunca puede disminuirla por debajo de la base publicada.
- Puede aplicar un mismo importe a todos los modelos de una marca o editar modelo por modelo.
- Supervisores sólo ven `Suscripción = Cuota 1 + sobrepauta final`; no ven los valores componentes.
- En una circular nueva se propone el último valor confirmado por esa estructura y marca. Se muestra: **"¿Confirmás los valores de sobrepauta establecidos en el tramo anterior?"**.
- La aceptación o modificación crea una confirmación nueva; no altera la lista anterior.

## Tabla visible

Columnas permanentes:

`Modelo | Tipo Plan | Cuotas | Valor Básico | Cuota Pura | Cuota 1 (Gerencia) | Sobrepauta (Gerencia) | Suscripción | Entregas Pactadas`

Entre `Suscripción` y `Entregas Pactadas`, se agregan columnas de cuotas dinámicas.

- Cuotas 2 a 12: se preservan con el mayor detalle disponible en la circular.
- Desde cuota 13: se agrupan tramos consecutivos cuando la diferencia de cuota total sea de hasta $30.000.
- La salida comercial usa un máximo de cuatro columnas de cuotas: `2 a 12`, `13 a 44`, `45 a 84` y `85 a 120` cuando aplique. Cada una muestra el mayor importe de los tramos oficiales que la cruzan, para no subestimar pagos.
- La suscripción es el dato prioritario: se destaca visualmente en pantalla, XLSX y PDF.
- Pantalla, Excel y PDF usan la misma función de agrupamiento.
- La impresión se prepara para A4 apaisado. Si no entra con legibilidad, continúa en otra hoja A4.

## Modelo de datos propuesto

- `commercial_documents`: repositorio común de archivos comerciales.
- `price_list_versions`: marca, vigencia, estado, cotización MG, auditoría y versión.
- `price_list_sources`: documentos asociados a una lista.
- `price_list_items`: modelo-plan y valores oficiales.
- `price_list_installment_segments`: tramos originales, importes y componentes de sellado.
- `price_list_structure_confirmations`: confirmación de lista por gerente/estructura.
- `price_list_item_surcharges`: sobrepauta final por modelo dentro de cada confirmación.

El alcance de estructura se resuelve desde la jerarquía existente `gerente → supervisor → equipo`, usando los datos operativos de Nave; no se duplica esa jerarquía dentro del módulo.

## Permisos requeridos

| Acción | Administración / Dirección | Gerencia | Supervisión |
| --- | --- | --- | --- |
| Cargar y asociar circulares | Sí | No | No |
| Corregir valores oficiales | Sí | No | No |
| Publicar para Gerencia | Sí | No | No |
| Editar sobrepauta | Base | Sólo aumentar, en su estructura | No |
| Confirmar para Supervisión | No requerido | Sí, en su estructura | No |
| Consultar lista confirmada | Sí | Sí, en su estructura | Sí, en su estructura |
| Ver cuota 1 / sobrepauta | Sí | Sí, en su estructura | No |

## Importación mecánica

1. Excel estructurado: primer importador para Renault.
2. PDF con texto: adaptadores pequeños por marca/formato.
3. Carga asistida: cuando un formato cambie o un PDF sea escaneado, Administración completa los campos necesarios. No se inventan importes.

Adaptadores iniciales:

- Renault (Excel).
- Citroën / Peugeot.
- Fiat / Jeep / RAM.
- MG (PDF textual, carga, cotización BNA/manual, conversión ARS y borrador revisable).
- Leapmotor, cuando exista una circular real para validar el formato.

## Implementación

- [x] Aplicar en Supabase la migración `20261031_033_price_lists_circulars.sql` (confirmado el 31/10/2026).
- [x] Revisar y reemplazar el catálogo actual de `PriceListModule` sin duplicar su lógica de presentación útil.
- [x] Crear migración de tablas, índices, restricciones y auditoría.
- [x] Crear bucket y políticas para `commercial_documents`.
- [x] Crear políticas RLS y funciones de autorización por estructura.
- [x] Crear APIs/repositorios específicos de listas de precios; dejar de usar el estado genérico de `AppContext` para este módulo.
- [x] Definir tipos TypeScript y DTOs de lectura por rol.
- [x] Implementar funciones puras: sellado BA, conversión MG, validación de sobrepautas y agrupamiento de tramos.
- [ ] Implementar carga de documentos y asociación de múltiples fuentes a una lista.
- [ ] Implementar editor/revisión para Administración y Dirección.
- [x] Implementar publicación a Gerencia.
- [x] Implementar revisión de sobrepautas, copia del período anterior, aplicación masiva y edición por modelo para Gerencia.
- [x] Implementar confirmación por estructura.
- [x] Implementar vista restringida de Supervisión.
- [x] Implementar importador Excel de Renault, con adicional transitorio de $15.000 por cuota y sellado Renault como Cuota 0.
- [x] Permitir edición posterior de importes oficiales por Administración/Dirección y aumentos posteriores de sobrepauta por Gerencia.
- [x] Permitir retirar del circuito comercial listas erróneas o anteriores, preservando su historial administrativo.
- [x] Separar las listas retiradas de la vista activa y permitir consultarlas en Historial de listas por mes/año.
- [ ] Implementar carga asistida universal.
- [ ] Implementar adaptadores PDF iniciales.
- [x] Incorporar OCR mecánico local para las circulares visuales de Stellantis.
- [ ] Mapear y validar la plantilla Peugeot/Citroën sobre el texto OCR extraído.
- [ ] Mapear y validar la plantilla Fiat/Jeep/RAM sobre el texto OCR extraído.
- [ ] Añadir revisión obligatoria por página para circulares OCR: ningún valor OCR se publica sin contraste con la ficha visual fuente.
- [x] Implementar exportación XLSX y PDF imprimible A4 apaisado para Administración/Dirección, Gerencia y Supervisión.
- [x] Agregar pruebas unitarias de cálculos y agrupamiento.
- [ ] Agregar pruebas de autorización, visibilidad y regresión por rol.
- [ ] Validar con circulares reales y usuarios de prueba antes de despliegue.

En curso: el parser Renault ya fue contrastado contra la planilla de septiembre de 2026 y recupera 10 planes con sus tramos. Falta conectarlo a la carga de archivos, revisión y creación del borrador.

## Pendiente de validación con Administración

- Renault: contrastar los importes comerciales generados contra la lista final aprobada por Administración, especialmente la regla transitoria de $15.000 por cuota y la selección del mayor valor en cada bloque comercial. No se modifica hasta disponer de esa validación.

## Criterios de aceptación

- No se publica una lista comercial con una sobrepauta vacía o igual a cero.
- Un gerente no puede reducir la sobrepauta ni confirmar estructuras ajenas.
- Un supervisor no puede leer listas pendientes, cuota 1 ni sobrepauta.
- Una lista nueva propone los valores previamente confirmados y exige confirmación por estructura.
- Los importes de sellado y los tramos visibles coinciden con las circulares fuente.
- Una lista puede componerse de varias circulares asociadas.
- La exportación, impresión y pantalla muestran el mismo valor de cada tramo y suscripción.
