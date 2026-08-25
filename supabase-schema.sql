create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  password_hash text not null,
  reset_token_hash text,
  reset_token_expires timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id text not null unique,
  razorpay_order_id text,
  razorpay_payment_id text,
  payment_method text not null,
  status text not null default 'Order received',
  subtotal integer not null check (subtotal >= 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  grand_total integer not null check (grand_total >= 0),
  name text not null,
  phone text not null,
  address text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  price integer not null check (price >= 0),
  quantity integer not null check (quantity between 1 and 99)
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.users enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.users from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
