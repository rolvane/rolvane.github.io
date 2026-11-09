-- MENPHIS — ATUALIZAÇÃO v4: chave do Gemini guardada no servidor (só o admin define)
-- Pode rodar quantas vezes quiser.

create table if not exists app_secrets (
  key text primary key,
  value text not null,
  updated_by uuid,
  updated_at timestamptz not null default now());
alter table app_secrets enable row level security;      -- sem nenhuma policy: ninguém lê/escreve pela API
revoke all on app_secrets from anon, authenticated;

-- admin grava (ou apaga, se o valor vier vazio)
create or replace function admin_set_secret(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores podem alterar isto.'; end if;
  if p_key not in ('gemini_api_key','gemini_text_model','gemini_image_model') then raise exception 'Chave inválida.'; end if;
  if coalesce(trim(p_value),'') = '' then
    delete from app_secrets where key = p_key;
  else
    insert into app_secrets (key, value, updated_by, updated_at) values (p_key, trim(p_value), auth.uid(), now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;

-- admin vê só o STATUS (últimos 4 caracteres), nunca a chave inteira
create or replace function admin_secret_status() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores.'; end if;
  return jsonb_build_object(
    'key_set',   exists (select 1 from app_secrets where key = 'gemini_api_key'),
    'key_last4', (select right(value, 4) from app_secrets where key = 'gemini_api_key'),
    'key_updated', (select updated_at from app_secrets where key = 'gemini_api_key'),
    'text_model',  (select value from app_secrets where key = 'gemini_text_model'),
    'image_model', (select value from app_secrets where key = 'gemini_image_model'));
end $$;

-- qualquer usuário logado só descobre SE a IA está ativa
create or replace function ai_ready() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_secrets where key = 'gemini_api_key') $$;

revoke execute on function admin_set_secret(text,text), admin_secret_status(), ai_ready() from public, anon;
grant execute on function admin_set_secret(text,text), admin_secret_status(), ai_ready() to authenticated;
