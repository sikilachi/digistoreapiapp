-- =============================================================================
-- SRD Digital / Digistore Checkout Bridge — initial schema
-- PostgreSQL (Supabase). All access is via the server using the service-role
-- key. RLS is enabled and locked down (deny by default) so the anon key cannot
-- read/write business data even if leaked.
-- =============================================================================

create extension if not exists "pgcrypto";

-- Reusable updated_at trigger ------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- stores ---------------------------------------------------------------------
-- One row per connected Shopify store (this app is single-store but modelled
-- multi-store-ready).
create table stores (
  id              uuid primary key default gen_random_uuid(),
  shop_domain     text not null unique,         -- your-store.myshopify.com
  display_name    text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_stores_updated before update on stores
  for each row execute function set_updated_at();

-- app_settings ---------------------------------------------------------------
-- Key/value app config + (encrypted) credential references. Secrets live in
-- env vars; this table holds non-secret config + connection metadata only.
create table app_settings (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid references stores(id) on delete cascade,
  key             text not null,
  value           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (store_id, key)
);
create trigger trg_app_settings_updated before update on app_settings
  for each row execute function set_updated_at();

-- service_templates ----------------------------------------------------------
-- A reusable "service" definition (Instagram Followers, TikTok Views, ...).
create table service_templates (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references stores(id) on delete cascade,
  name                  text not null,                  -- "Instagram Followers"
  slug                  text not null,                  -- "instagram-followers"
  description           text,
  base_price            numeric(12,4) not null default 0,
  currency              text not null default 'EUR',
  min_price             numeric(12,4) not null default 0,
  requires_link         boolean not null default true,  -- target URL input
  link_label            text default 'Target link / URL',
  allow_notes           boolean not null default true,
  digistore_product_id  text,                           -- DS container product id
  checkout_enabled      boolean not null default false, -- master on/off per service
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (store_id, slug)
);
create trigger trg_service_templates_updated before update on service_templates
  for each row execute function set_updated_at();

-- shopify_products -----------------------------------------------------------
-- Maps a visible Shopify product to a service_template.
create table shopify_products (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references stores(id) on delete cascade,
  service_template_id   uuid references service_templates(id) on delete set null,
  shopify_product_id    text not null,                  -- gid or numeric id
  handle                text not null,                  -- product handle (url key)
  title                 text,
  checkout_enabled      boolean not null default false, -- override per product
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (store_id, shopify_product_id)
);
create index idx_shopify_products_handle on shopify_products (store_id, handle);
create trigger trg_shopify_products_updated before update on shopify_products
  for each row execute function set_updated_at();

-- option_groups --------------------------------------------------------------
-- A choice dimension for a service: Quantity, Country, Gender, Refill, ...
create table option_groups (
  id                    uuid primary key default gen_random_uuid(),
  service_template_id   uuid not null references service_templates(id) on delete cascade,
  key                   text not null,                  -- "quantity","country"
  label                 text not null,                  -- "Quantity"
  -- how the customer interacts + how it feeds pricing
  input_type            text not null default 'select', -- select | radio | number | text
  pricing_role          text not null default 'multiplier',
                        -- multiplier | tier | surcharge | none
  is_required           boolean not null default true,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (service_template_id, key),
  constraint chk_input_type check (input_type in ('select','radio','number','text')),
  constraint chk_pricing_role check (pricing_role in ('multiplier','tier','surcharge','none'))
);
create trigger trg_option_groups_updated before update on option_groups
  for each row execute function set_updated_at();

-- option_values --------------------------------------------------------------
-- The selectable values within a group + their pricing contribution.
create table option_values (
  id                uuid primary key default gen_random_uuid(),
  option_group_id   uuid not null references option_groups(id) on delete cascade,
  value             text not null,                      -- "DE","male","30d","1000"
  label             text not null,                      -- "Germany","Male", ...
  -- pricing inputs (interpretation depends on group.pricing_role)
  multiplier        numeric(12,6) not null default 1,   -- for pricing_role=multiplier
  surcharge         numeric(12,4) not null default 0,   -- for pricing_role=surcharge
  -- for tier groups (e.g. quantity): unit/threshold pricing
  tier_quantity     numeric(14,2),                      -- e.g. 1000
  tier_unit_price   numeric(12,6),                      -- price per unit at this tier
  tier_flat_price   numeric(12,4),                      -- OR flat price for this tier
  is_default        boolean not null default false,
  is_active         boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (option_group_id, value)
);
create trigger trg_option_values_updated before update on option_values
  for each row execute function set_updated_at();

-- pricing_rules --------------------------------------------------------------
-- Extra/override rules layered on top of option pricing: campaigns, discounts,
-- combination overrides, min price, fixed surcharge.
create table pricing_rules (
  id                    uuid primary key default gen_random_uuid(),
  service_template_id   uuid not null references service_templates(id) on delete cascade,
  name                  text not null,
  rule_type             text not null,
                        -- combo_override | discount_pct | discount_flat
                        -- | surcharge_flat | min_price | campaign_price
  -- match: which option selections this rule applies to (jsonb of {group_key:value}).
  -- empty object = applies to all.
  match_options         jsonb not null default '{}'::jsonb,
  amount                numeric(12,4),                  -- meaning depends on rule_type
  priority              int not null default 100,       -- lower = applied earlier
  starts_at             timestamptz,
  ends_at               timestamptz,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_rule_type check (rule_type in
    ('combo_override','discount_pct','discount_flat','surcharge_flat','min_price','campaign_price'))
);
create index idx_pricing_rules_template on pricing_rules (service_template_id, is_active);
create trigger trg_pricing_rules_updated before update on pricing_rules
  for each row execute function set_updated_at();

-- provider_mappings ----------------------------------------------------------
-- Maps a specific option combination to an external SMM provider service id.
-- (Phase 1: stored only; not auto-dispatched.)
create table provider_mappings (
  id                    uuid primary key default gen_random_uuid(),
  service_template_id   uuid not null references service_templates(id) on delete cascade,
  provider_name         text,                           -- "smmprovider-x"
  provider_service_id   text not null,                  -- "12345"
  match_options         jsonb not null default '{}'::jsonb, -- {group_key:value,...}
  notes                 text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_provider_mappings_template on provider_mappings (service_template_id, is_active);
create trigger trg_provider_mappings_updated before update on provider_mappings
  for each row execute function set_updated_at();

-- checkout_sessions ----------------------------------------------------------
-- One per "Buy Now" click. Server-authoritative record of what was priced.
create table checkout_sessions (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references stores(id) on delete cascade,
  service_template_id   uuid references service_templates(id) on delete set null,
  shopify_product_id    text,
  shopify_variant_id    text,
  selected_options      jsonb not null default '{}'::jsonb,  -- {group_key:value}
  resolved_options      jsonb not null default '[]'::jsonb,  -- [{label,value,...}] for display
  target_link           text,
  order_notes           text,
  customer_email        text,
  calculated_price      numeric(12,4) not null,
  currency              text not null default 'EUR',
  provider_service_id   text,                            -- resolved at checkout time
  digistore_product_id  text,
  digistore_buy_url     text,
  status                text not null default 'created',
                        -- created | redirected | paid | failed | refunded | expired
  digistore_order_id    text,
  shopify_order_id      text,
  client_ip             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_session_status check (status in
    ('created','redirected','paid','failed','refunded','expired'))
);
create index idx_checkout_sessions_status on checkout_sessions (store_id, status);
create index idx_checkout_sessions_ds_order on checkout_sessions (digistore_order_id);
create trigger trg_checkout_sessions_updated before update on checkout_sessions
  for each row execute function set_updated_at();

-- digistore_orders -----------------------------------------------------------
-- Payment events received from Digistore IPN.
create table digistore_orders (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid references stores(id) on delete cascade,
  checkout_session_id   uuid references checkout_sessions(id) on delete set null,
  digistore_order_id    text not null,
  event                 text,                            -- on_payment, on_refund, ...
  billing_status        text,                            -- paid, refunded, ...
  amount                numeric(12,4),
  currency              text,
  buyer_email           text,
  buyer_first_name      text,
  buyer_last_name       text,
  product_name          text,
  raw_payload           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);
create index idx_digistore_orders_orderid on digistore_orders (digistore_order_id);
create unique index uq_digistore_orders_event
  on digistore_orders (digistore_order_id, event);

-- shopify_orders -------------------------------------------------------------
-- Shopify orders created/updated by this app after payment.
create table shopify_orders (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid references stores(id) on delete cascade,
  checkout_session_id   uuid references checkout_sessions(id) on delete set null,
  shopify_order_id      text not null,
  shopify_order_name    text,                            -- "#1001"
  digistore_order_id    text,
  status                text,
  total_price           numeric(12,4),
  currency              text,
  created_at            timestamptz not null default now(),
  unique (store_id, shopify_order_id)
);

-- webhook_logs ---------------------------------------------------------------
-- Audit trail for every inbound webhook/IPN + outbound failures.
create table webhook_logs (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid references stores(id) on delete set null,
  source            text not null,            -- 'digistore_ipn' | 'shopify' | 'internal'
  event             text,
  level             text not null default 'info', -- info | warn | error
  signature_valid   boolean,
  message           text,
  payload           jsonb,
  created_at        timestamptz not null default now()
);
create index idx_webhook_logs_created on webhook_logs (created_at desc);
create index idx_webhook_logs_level on webhook_logs (level, created_at desc);

-- =============================================================================
-- Row Level Security: deny-by-default. The server uses the service-role key
-- which bypasses RLS. No client-side reads of business data are permitted.
-- =============================================================================
alter table stores              enable row level security;
alter table app_settings        enable row level security;
alter table service_templates   enable row level security;
alter table shopify_products    enable row level security;
alter table option_groups       enable row level security;
alter table option_values       enable row level security;
alter table pricing_rules       enable row level security;
alter table provider_mappings   enable row level security;
alter table checkout_sessions   enable row level security;
alter table digistore_orders    enable row level security;
alter table shopify_orders      enable row level security;
alter table webhook_logs        enable row level security;
-- No policies created => anon/auth roles get no access. service_role bypasses RLS.
