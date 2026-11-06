import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { readdir } from 'node:fs/promises';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'supabase/migrations');
const localRoot = resolve(root, '.local-supabase');
const localSupabaseDir = resolve(localRoot, 'supabase');
const localMigrationDir = resolve(localSupabaseDir, 'migrations');
const manifestPath = resolve(root, 'supabase/local-bootstrap-manifest.json');

const dependencyNotes = {
  '20261024_001_nave_planes_schema.sql': [],
  '20261024_002_allow_unknown_roster_history.sql': ['001: teams, sellers'],
  '20261024_003_scoring_landing_zone.sql': ['001: pgcrypto extension'],
  '20261025_004_access_and_notifications.sql': ['001: profiles, teams, sellers, wage_advances, price_lists'],
  '20261025_005_staff_directory.sql': ['001: profiles, teams, sellers, app_role'],
  '20261027_006_recruitment_and_private_documents.sql': ['001: profiles, teams', '005: staff_members'],
  '20261027_007_fox_lead_snapshots.sql': ['001: sellers, teams'],
  '20261027_008_roster_management.sql': ['001: auth.users', '005: staff_members'],
  '20261027_009_expand_staff_roles.sql': ['005: staff_role'],
  '20261027_010_staff_reporting_lines.sql': ['005: staff_members'],
  '20261030_011_team_operational_visibility.sql': ['001: teams'],
  '20261030_012_reset_roster_foundation.sql': ['001/004/005/008: roster tables and current_app_role()'],
  '20261030_013_resources_rebuild_foundation.sql': ['001: teams, sellers', '005: staff_members'],
  '20261030_014_resource_normalization_rules.sql': ['013: hr_areas/hr_roles foundation'],
  '20261030_015_effective_manager_hierarchy.sql': ['013: staff role catalog and hierarchy columns'],
  '20261030_016_hr_import_staging.sql': ['013: hr_import_runs'],
  '20261030_017_hr_import_operational_roster.sql': ['013: hr_roles, teams, sellers'],
  '20261030_018_hr_import_permissions.sql': ['015: effective_manager_staff_id'],
  '20261030_019_hr_role_import_mappings.sql': ['013/017: hr_roles and areas'],
  '20261030_020_sales_operations_persistence.sql': ['001: sales_operations'],
  '20261030_021_wage_advance_review_notes.sql': ['001: wage_advances'],
  '20261030_022_manual_schema_reconciliation.sql': ['001/005/013/015/016/017/019: reconciliation of existing schema'],
  '20261030_023_backfill_supervisor_teams.sql': ['013/015/017/022: derived supervisor teams'],
  '20261031_024_staff_exit_history.sql': ['005: staff_members'],
  '20261031_025_preserve_manual_manager_override.sql': ['015: manager_assignment_source'],
  '20261031_026_vendor_manager_inheritance.sql': ['025: manual override trigger'],
  '20261031_027_fox_supervisor_context.sql': ['007/013/023: Fox mappings and roster hierarchy'],
  '20261031_028_fox_import_rpc.sql': ['007/027: Fox import tables and supervisor context'],
  '20261031_029_fox_mapping_suggestions.sql': ['007/027: fox_user_mappings and staff_members'],
  '20261031_030_reconcile_supervisor_team_projection.sql': ['013/015/017/022/023: Legajos team projection'],
  '20261031_031_rebuild_roster_projections_from_legajos.sql': ['013/015/017/022/030: Legajos-derived projections'],
  '20261031_032_legajos_atomic_roster_sync.sql': ['031: rebuild function; 025/026: manager inheritance'],
  '20261031_033_price_lists_circulars.sql': ['001/004/013/015/022: profiles, roles and teams'],
  '20261101_034_renault_upfront_stamp.sql': ['033: price_list_items'],
  '20261101_035_backfill_renault_upfront_stamp.sql': ['034: upfront_stamp_value'],
  '20261101_036_require_complete_price_list_segments.sql': ['033/034/035: price list publishing and segments'],
  '20261103_034_incorporation_requests_coaching.sql': ['032: Legajos roster projections; 006: private rrhh-legajos bucket'],
  '20261103_035_incorporation_access_hardening.sql': ['034: incorporation requests and private documents'],
  '20261103_036_staff_departure_notices.sql': ['024: staff exit history; 006: private rrhh-legajos bucket'],
  '20261103_037_incorporation_partial_drafts.sql': ['034/035: incorporation workflow and access'],
  '20261105_038_incorporation_private_drafts_and_hr_direct.sql': ['034/035/037: incorporation workflow, private storage and drafts'],
  '20261106_039_sprint5_production_reconciliation.sql': ['001 plus observed Legajos base: staff_members, profiles, hr_areas/hr_roles and current_app_role()'],
};

const sourceFiles = (await readdir(sourceDir))
  .filter(name => /^\d{8}_\d{3}_.+\.sql$/.test(name))
  .sort((left, right) => left.localeCompare(right));

if (sourceFiles.length !== Object.keys(dependencyNotes).length) {
  throw new Error(`El manifiesto de dependencias cubre ${Object.keys(dependencyNotes).length} migraciones, pero se encontraron ${sourceFiles.length}.`);
}
for (const name of sourceFiles) {
  if (!(name in dependencyNotes)) throw new Error(`Falta la dependencia declarada para ${name}.`);
}

await rm(localRoot, { recursive: true, force: true });
await mkdir(localMigrationDir, { recursive: true });

const manifest = [];
let sequence = 0;
for (const originalName of sourceFiles) {
  const [, date, ordinal, description] = originalName.match(/^(\d{8})_(\d{3})_(.+)$/) || [];
  if (!date || !ordinal || !description) throw new Error(`Nombre de migración inválido: ${originalName}`);
  sequence += 1;
  const localVersion = `${date}${String(sequence).padStart(6, '0')}`;
  const localName = `${localVersion}_${ordinal}_${description}`;
  const sourcePath = resolve(sourceDir, originalName);
  const targetPath = resolve(localMigrationDir, localName);
  const content = await readFile(sourcePath);
  await writeFile(targetPath, content);
  manifest.push({
    order: sequence,
    originalFile: `supabase/migrations/${originalName}`,
    localFile: `.local-supabase/supabase/migrations/${localName}`,
    localVersion,
    sha256: createHash('sha256').update(content).digest('hex'),
    dependencies: dependencyNotes[originalName],
  });
}

const sourceConfig = await readFile(resolve(root, 'supabase/config.toml'), 'utf8');
const localConfig = sourceConfig.replace(/^project_id\s*=\s*".*"$/m, 'project_id = "naveplan_local_bootstrap"');
await writeFile(resolve(localSupabaseDir, 'config.toml'), localConfig);
await cp(resolve(root, 'supabase/.gitignore'), resolve(localSupabaseDir, '.gitignore'));
await writeFile(manifestPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  generator: 'scripts/generate-local-supabase-migrations.mjs',
  sourceOfTruth: 'supabase/migrations',
  purpose: 'Bootstrap local only. Never use this derived tree with supabase link, db push, or remote environments.',
  migrations: manifest,
}, null, 2)}\n`);

console.log(`Generated ${manifest.length} local migrations in ${localMigrationDir}`);
console.log(`Manifest: ${manifestPath}`);
