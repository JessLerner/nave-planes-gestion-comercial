-- Operational records created from the platform must retain the appraisal
-- details shown to authorised staff; the previous UI-only field was lost.
alter table public.sales_operations
  add column if not exists used_car_details jsonb;

alter table public.sales_operations
  add constraint sales_operations_used_car_details_object
  check (used_car_details is null or jsonb_typeof(used_car_details) = 'object');
