-- ============================================================
-- VitaLens Database Schema
-- Supabase PostgreSQL Migration: 001_initial_schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for fuzzy search on supplement names

-- ============================================================
-- TABLE: profiles
-- Stores user and child health profiles
-- ============================================================
create table if not exists public.profiles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- Basic Info
  name            text not null,
  type            text not null check (type in ('self', 'child')),
  birthday        date,
  gender          text check (gender in ('male', 'female', 'other')),
  avatar_url      text,

  -- Health & Safety (arrays stored as text[])
  health_tags     text[] default '{}',   -- e.g. ['kidney_disease', 'diabetes']
  allergy_tags    text[] default '{}',   -- e.g. ['nuts', 'shellfish', 'gluten']
  medications     text[] default '{}',   -- e.g. ['warfarin', 'metformin']

  -- Female-specific
  menstrual_tracking boolean default false,
  last_period_date   date,
  cycle_days         int default 28,

  -- Metadata
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Index for fast user lookup
create index idx_profiles_user_id on public.profiles(user_id);

-- Row Level Security: users can only see their own profiles
alter table public.profiles enable row level security;

create policy "Users can manage their own profiles"
  on public.profiles
  for all
  using (auth.uid() = user_id);

-- ============================================================
-- TABLE: intake_logs
-- Logs every food / supplement intake event
-- ============================================================
create table if not exists public.intake_logs (
  id              uuid primary key default uuid_generate_v4(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  -- What was consumed
  type            text not null check (type in ('food', 'supplement', 'drink')),
  meal_time       text check (meal_time in ('breakfast', 'lunch', 'dinner', 'snack', 'midnight')),

  -- AI-parsed content
  items           jsonb default '[]',
  -- items example:
  -- [{"name":"雞腿便當","quantity":1,"unit":"份","confidence":0.92}]

  nutrients       jsonb default '{}',
  -- nutrients example:
  -- {"calories":650,"protein_g":32,"carbs_g":78,"fat_g":18,"sodium_mg":820}

  -- Safety analysis result
  safety_flags    jsonb default '[]',
  -- safety_flags example:
  -- [{"level":"red","message":"高鉀食物，腎病患者需注意","nutrient":"potassium"}]

  -- Input metadata
  voice_note      text,                  -- raw transcript from Web Speech API
  image_url       text,                  -- Supabase Storage path
  ai_response     jsonb default '{}',    -- full GPT/Gemini raw response (for debugging)

  created_at      timestamptz default now()
);

-- Indexes for common queries
create index idx_intake_logs_profile_id on public.intake_logs(profile_id);
create index idx_intake_logs_created_at on public.intake_logs(created_at desc);
create index idx_intake_logs_type on public.intake_logs(type);

-- RLS
alter table public.intake_logs enable row level security;

create policy "Users can manage intake logs via profile"
  on public.intake_logs
  for all
  using (
    profile_id in (
      select id from public.profiles where user_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: supplements
-- Master database of supplements + safety contraindications
-- ============================================================
create table if not exists public.supplements (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  name_en         text,
  category        text,                  -- 'vitamin', 'mineral', 'probiotic', 'enzyme', etc.
  ingredients     jsonb default '[]',
  -- ingredients example:
  -- [{"name":"Omega-3","amount_mg":1000},{"name":"EPA","amount_mg":600}]

  contraindications jsonb default '{}',
  -- contraindications example:
  -- {
  --   "medications": ["warfarin","aspirin"],       -- drug interactions
  --   "health_tags": ["kidney_disease"],           -- disease conflicts
  --   "min_age_months": 12,                        -- age restriction
  --   "notes": "避免與抗凝血藥同服，可能增加出血風險"
  -- }

  recommendations jsonb default '{}',
  -- recommendations example:
  -- {
  --   "pair_with": ["大餐","油脂食物"],             -- suggest pairing scenarios
  --   "menstrual_phase": ["menstruation"],          -- suggest during period
  --   "timing": "飯後服用效果最佳"
  -- }

  created_at      timestamptz default now()
);

create index idx_supplements_name_trgm on public.supplements using gin(name gin_trgm_ops);

-- Public read, admin-only write (managed via Supabase Dashboard)
alter table public.supplements enable row level security;

create policy "Anyone can read supplements"
  on public.supplements
  for select
  using (true);

-- ============================================================
-- TABLE: workout_logs
-- Tracks exercise sessions for post-workout nutrition advice
-- ============================================================
create table if not exists public.workout_logs (
  id              uuid primary key default uuid_generate_v4(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  activity        text not null,         -- 'running', 'weight_training', 'yoga', etc.
  duration_min    int not null,
  intensity       text check (intensity in ('low', 'medium', 'high')),
  calories_burned int,

  -- AI recovery suggestion (generated post-workout)
  recovery_advice jsonb default '{}',
  -- recovery_advice example:
  -- {"protein_g":25,"electrolytes":true,"suggested_supplements":["whey_protein","magnesium"]}

  created_at      timestamptz default now()
);

create index idx_workout_logs_profile_id on public.workout_logs(profile_id);
create index idx_workout_logs_created_at on public.workout_logs(created_at desc);

alter table public.workout_logs enable row level security;

create policy "Users can manage workout logs via profile"
  on public.workout_logs
  for all
  using (
    profile_id in (
      select id from public.profiles where user_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: symptom_logs
-- M4: Body symptom feedback for AI retrospective analysis
-- ============================================================
create table if not exists public.symptom_logs (
  id              uuid primary key default uuid_generate_v4(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  symptoms        text[] not null,       -- ['headache', 'nausea', 'stomach_pain']
  severity        int check (severity between 1 and 5),
  voice_note      text,
  ai_analysis     jsonb default '{}',
  -- ai_analysis example:
  -- {"probable_cause":"空腹服用鋅補劑引起胃部不適","related_logs":["<intake_log_id>"],"advice":"下次請隨餐服用"}

  created_at      timestamptz default now()
);

alter table public.symptom_logs enable row level security;

create policy "Users can manage symptom logs via profile"
  on public.symptom_logs
  for all
  using (
    profile_id in (
      select id from public.profiles where user_id = auth.uid()
    )
  );

-- ============================================================
-- FUNCTION: updated_at auto-update trigger
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ============================================================
-- SEED: Sample supplements data
-- ============================================================
insert into public.supplements (name, name_en, category, ingredients, contraindications, recommendations) values
(
  '魚油 Omega-3',
  'Fish Oil Omega-3',
  'omega',
  '[{"name":"EPA","amount_mg":600},{"name":"DHA","amount_mg":400}]',
  '{"medications":["warfarin","aspirin","clopidogrel"],"health_tags":[],"notes":"與抗凝血藥物併用可能增加出血風險"}',
  '{"pair_with":["油脂食物"],"timing":"隨餐服用，減少魚腥味反胃"}'
),
(
  '消化酶',
  'Digestive Enzymes',
  'enzyme',
  '[{"name":"Amylase","amount_mg":100},{"name":"Protease","amount_mg":80},{"name":"Lipase","amount_mg":50}]',
  '{"medications":[],"health_tags":[],"min_age_months":12,"notes":"胰臟炎急性期禁用"}',
  '{"pair_with":["大餐","高蛋白","高油脂"],"timing":"用餐前15分鐘或隨餐服用"}'
),
(
  '鐵質補充',
  'Iron Supplement',
  'mineral',
  '[{"name":"Ferrous Bisglycinate","amount_mg":25}]',
  '{"medications":["antacids","tetracycline"],"health_tags":["hemochromatosis"],"notes":"與制酸劑間隔2小時服用"}',
  '{"pair_with":["維生素C","柑橘類"],"menstrual_phase":["menstruation","follicular"],"timing":"空腹或隨維C服用吸收最佳"}'
),
(
  '鎂',
  'Magnesium',
  'mineral',
  '[{"name":"Magnesium Glycinate","amount_mg":300}]',
  '{"medications":[],"health_tags":["kidney_disease"],"notes":"腎功能不全者需醫師評估劑量"}',
  '{"pair_with":[],"menstrual_phase":["menstruation"],"timing":"睡前服用有助放鬆及緩解經痛"}'
),
(
  '益生菌',
  'Probiotic',
  'probiotic',
  '[{"name":"Lactobacillus acidophilus","cfu":"10B"},{"name":"Bifidobacterium","cfu":"5B"}]',
  '{"medications":[],"health_tags":["immunocompromised"],"notes":"免疫功能低下者請先諮詢醫師"}',
  '{"pair_with":["發酵食品","高纖食物"],"timing":"餐後服用，胃酸較低環境存活率更高"}'
);
