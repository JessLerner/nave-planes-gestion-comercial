-- Completa las listas Renault creadas antes de incorporar la Cuota 0.
update public.price_list_items item
   set upfront_stamp_value = round(item.basic_value * 0.0152, 2)
  from public.price_list_versions version
 where version.id = item.price_list_version_id
   and lower(version.brand) = 'renault'
   and item.upfront_stamp_value = 0;
