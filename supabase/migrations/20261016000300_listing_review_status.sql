-- Listings wait for the Bunkie team before going live. (New enum value: its own migration.)
alter type public.listing_status add value if not exists 'in_review' after 'draft';
