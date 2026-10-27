-- Operational roles that are people in the structure but are not sellers.
alter type public.staff_role add value if not exists 'director';
alter type public.staff_role add value if not exists 'mora';
alter type public.staff_role add value if not exists 'contable';
