-- A Bunkie note caused by your own action (your offer, your request, a step you took) is already read
-- for you; it still counts as new for the other person. Notes are posted inside the request of whoever
-- acted, so auth.uid() is that person. Admin actions and scheduled jobs aren't members (or have no
-- user), so nothing changes for them.

create or replace function private.post_system(p_conversation uuid, p_body text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.messages;
  v_uid uuid := auth.uid();
begin
  v_msg := private.post(p_conversation, null, 'system', p_body, p_meta);
  if v_uid is not null then
    update public.conversation_members set last_read_id = greatest(last_read_id, v_msg.id), last_read_at = now()
    where conversation_id = p_conversation and user_id = v_uid;
  end if;
end $$;

-- Offers already sent: the host's own offer note shouldn't sit unread for them.
update public.conversation_members m
set last_read_id = greatest(m.last_read_id, x.id), last_read_at = now()
from public.want_offers o
join public.messages x on x.conversation_id = o.conversation_id and x.kind = 'system'
  and x.meta ->> 'type' = 'offer' and x.meta ->> 'listing_id' = o.listing_id::text
where m.conversation_id = o.conversation_id and m.user_id = o.host_id;
