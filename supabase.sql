-- Supabase Dashboard > SQL Editor で実行（研究利用前に設定確認）
-- 学生の回答をイベント単位で保存。service roleキーをブラウザに公開しない。
create table if not exists public.learning_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  session_id uuid not null,
  case_id text not null,
  case_version text not null,
  event_type text not null check (event_type in ('start','draft','hint_open','extra_open','final','transfer','reflection')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists learning_events_user_idx on public.learning_events (user_id,created_at);
create index if not exists learning_events_session_idx on public.learning_events (session_id,created_at);
alter table public.learning_events enable row level security;
-- 匿名サインインした利用者にはauth.uid()が割り当てられる。
-- insertだけを許可。学生が他者の記録をSELECT/UPDATE/DELETEできないようにする。
drop policy if exists "students_insert_own_events" on public.learning_events;
create policy "students_insert_own_events" on public.learning_events
for insert to authenticated with check (auth.uid() = user_id);
revoke all on public.learning_events from anon;
grant insert on public.learning_events to authenticated;
grant usage, select on sequence public.learning_events_id_seq to authenticated;
-- 教員によるCSV取得: Supabaseの権限あるDashboard/Table Editorから行う。
-- ポリシーの変更、広範なSELECT権限付与は行わない。
