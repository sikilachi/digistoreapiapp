-- =============================================================================
-- MVP seed: one store + one "Instagram Followers" service with Quantity (tier)
-- and Country (multiplier) option groups. Adjust the shop_domain + Digistore
-- product id before going live, or manage everything from the admin UI instead.
-- Safe to run once on a fresh DB.
-- =============================================================================

with s as (
  insert into stores (shop_domain, display_name)
  values ('your-store.myshopify.com', 'SRD Digital')
  on conflict (shop_domain) do update set display_name = excluded.display_name
  returning id
),
tpl as (
  insert into service_templates
    (store_id, name, slug, description, base_price, currency, min_price,
     requires_link, link_label, digistore_product_id, checkout_enabled)
  select s.id, 'Instagram Followers', 'instagram-followers',
         'High quality Instagram followers, delivered fast.',
         0, 'EUR', 1.49, true, 'Your Instagram profile URL',
         null, true
  from s
  on conflict (store_id, slug) do update set name = excluded.name
  returning id, store_id
),
g_qty as (
  insert into option_groups
    (service_template_id, key, label, input_type, pricing_role, is_required, sort_order)
  select id, 'quantity', 'Quantity', 'select', 'tier', true, 0 from tpl
  on conflict (service_template_id, key) do update set label = excluded.label
  returning id
),
g_country as (
  insert into option_groups
    (service_template_id, key, label, input_type, pricing_role, is_required, sort_order)
  select id, 'country', 'Country', 'select', 'multiplier', true, 1 from tpl
  on conflict (service_template_id, key) do update set label = excluded.label
  returning id
)
-- Quantity tiers: flat price per quantity bucket.
insert into option_values
  (option_group_id, value, label, tier_quantity, tier_flat_price, is_default, sort_order)
select g_qty.id, v.value, v.label, v.qty, v.price, v.is_default, v.ord
from g_qty, (values
  ('100',   '100 Followers',   100,    1.49::numeric, false, 0),
  ('500',   '500 Followers',   500,    4.99::numeric, false, 1),
  ('1000',  '1,000 Followers', 1000,   8.99::numeric, true,  2),
  ('5000',  '5,000 Followers', 5000,   39.99::numeric, false, 3),
  ('10000', '10,000 Followers',10000,  74.99::numeric, false, 4)
) as v(value, label, qty, price, is_default, ord)
on conflict (option_group_id, value) do nothing;

-- Country multipliers.
insert into option_values
  (option_group_id, value, label, multiplier, is_default, sort_order)
select og.id, v.value, v.label, v.mult, v.is_default, v.ord
from option_groups og
join service_templates st on st.id = og.service_template_id
cross join (values
  ('mixed', 'Worldwide (Mixed)', 1.00::numeric, true,  0),
  ('DE',    'Germany',           1.40::numeric, false, 1),
  ('FR',    'France',            1.35::numeric, false, 2),
  ('NL',    'Netherlands',       1.35::numeric, false, 3),
  ('TR',    'Turkey',            1.10::numeric, false, 4),
  ('GB',    'United Kingdom',    1.40::numeric, false, 5),
  ('US',    'United States',     1.50::numeric, false, 6)
) as v(value, label, mult, is_default, ord)
where og.key = 'country' and st.slug = 'instagram-followers'
on conflict (option_group_id, value) do nothing;
