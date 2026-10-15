-- Chat pieces that need the hosted Supabase services (skipped by the local test runner).

-- Photos in chat: chat-media/{conversation_id}/{uuid}.webp, private to the two people in the chat.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('chat-media', 'chat-media', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create or replace function private.chat_member_of_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.is_member(split_part(p_name, '/', 1)::uuid);
exception when invalid_text_representation then
  return false;
end $$;

create policy "chat members upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and private.chat_member_of_path(name));
create policy "chat members read photos" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and private.chat_member_of_path(name));

-- Live channels are private: chat:<conversation> for its two members (messages, reads, typing,
-- online), inbox:<user> for that user's list updates.
create or replace function private.may_join(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topic = 'inbox:' || auth.uid()::text then return true; end if;
  if p_topic like 'chat:%' then return private.is_member(substr(p_topic, 6)::uuid); end if;
  return false;
exception when invalid_text_representation then
  return false;
end $$;

create policy "members receive chat and inbox" on realtime.messages for select to authenticated
  using (private.may_join(realtime.topic()));

-- People may only send ephemeral events (typing, online) into their own chats; messages are written
-- by send_message() in the database.
create policy "members send typing and presence" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'chat:%' and private.may_join(realtime.topic())
              and extension in ('broadcast', 'presence'));
