-- "Self contain": a room with its own bathroom and kitchen, shared with nobody.
alter type public.room_kind add value if not exists 'self_contain';
