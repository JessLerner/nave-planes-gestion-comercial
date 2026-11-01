-- Renault pays the provincial stamp duty before the first plan installment.
-- It must stay outside installment ranges and the commercial subscription amount.
alter table public.price_list_items
  add column if not exists upfront_stamp_value numeric(14,2) not null default 0
  check (upfront_stamp_value >= 0);
