-- WhatsApp alerts move to phase two. One switch: while 'whatsapp_enabled' is false no WhatsApp jobs
-- are queued at all (in-app chat, booking updates and unread counts carry everything meanwhile).
-- Turning it on later needs no other change.
insert into public.settings (key, value) values ('whatsapp_enabled', 'false')
on conflict (key) do update set value = excluded.value;

create or replace function private.enqueue(p_queue text, p_payload jsonb, p_run_after timestamptz default now())
returns void language sql security definer set search_path = '' as $$
  insert into private.jobs (queue, payload, run_after)
  select p_queue, p_payload, p_run_after
  where p_queue <> 'whatsapp' or private.setting_bool('whatsapp_enabled', false)
$$;
