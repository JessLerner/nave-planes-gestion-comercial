-- A draft cannot reach Gerencia while any commercial installment is absent or zero.
-- Cuota 1 is stored independently; this validates the commercial tramos from cuota 2 onward.
create or replace function public.publish_price_list_to_managers(target_version uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  incomplete_model text;
begin
  if not public.can_manage_price_lists() then
    raise exception 'No autorizado para publicar listas de precios.';
  end if;

  if not exists (
    select 1 from public.price_list_versions version
    where version.id = target_version and version.status = 'draft'::public.price_list_status
  ) then
    raise exception 'La lista debe existir y estar en borrador.';
  end if;

  if not exists (select 1 from public.price_list_items item where item.price_list_version_id = target_version) then
    raise exception 'La lista no contiene modelos.';
  end if;

  select item.model into incomplete_model
    from public.price_list_items item
   where item.price_list_version_id = target_version
     and item.total_installments > 1
     and exists (
       select 1
         from generate_series(2, item.total_installments) quota_number
        where not exists (
          select 1 from public.price_list_installment_segments segment
           where segment.price_list_item_id = item.id
             and segment.installment_from <= quota_number
             and segment.installment_to >= quota_number
             and segment.total_value > 0
        )
     )
   order by item.sort_order, item.model
   limit 1;

  if incomplete_model is not null then
    raise exception 'No se puede publicar: faltan tramos revisados o importes mayores a cero para %.', incomplete_model;
  end if;

  update public.price_list_versions
     set status = 'published_to_managers', published_for_managers_at = now()
   where id = target_version;

  insert into public.price_list_structure_confirmations (price_list_version_id, manager_staff_id)
  select target_version, team.manager_staff_id
    from public.teams team
   where team.active and team.is_sales_team and team.manager_staff_id is not null
  group by team.manager_staff_id
  on conflict (price_list_version_id, manager_staff_id) do nothing;

  insert into public.price_list_item_surcharges (confirmation_id, price_list_item_id, surcharge_amount, carried_from_previous, updated_by)
  select confirmation.id,
         item.id,
         greatest(item.base_surcharge, coalesce(previous.surcharge_amount, item.base_surcharge)),
         previous.surcharge_amount is not null,
         auth.uid()
    from public.price_list_structure_confirmations confirmation
    join public.price_list_items item on item.price_list_version_id = target_version
    left join lateral (
      select prior_surcharge.surcharge_amount
        from public.price_list_structure_confirmations prior_confirmation
        join public.price_list_versions prior_version on prior_version.id = prior_confirmation.price_list_version_id
        join public.price_list_items prior_item on prior_item.price_list_version_id = prior_version.id
        join public.price_list_item_surcharges prior_surcharge on prior_surcharge.confirmation_id = prior_confirmation.id and prior_surcharge.price_list_item_id = prior_item.id
       where prior_confirmation.manager_staff_id = confirmation.manager_staff_id
         and prior_confirmation.status = 'confirmed'::public.price_list_confirmation_status
         and prior_version.brand = (select brand from public.price_list_versions where id = target_version)
         and prior_version.effective_date < (select effective_date from public.price_list_versions where id = target_version)
         and lower(trim(prior_item.model)) = lower(trim(item.model))
         and lower(trim(prior_item.plan_type)) = lower(trim(item.plan_type))
       order by prior_version.effective_date desc, prior_confirmation.confirmed_at desc
       limit 1
    ) previous on true
   where confirmation.price_list_version_id = target_version
  on conflict (confirmation_id, price_list_item_id) do nothing;
end;
$$;
