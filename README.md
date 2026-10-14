# Bunkie

Leave camp with a place to stay. Verified shared rooms for corp members in Abuja.

- `web/`: the app, a Next.js PWA (deploys to Vercel)
- `supabase/`: database migrations, Edge Functions, seed data and database tests

Product and design: [PRD v3](https://claude.ai/artifact/PAx4kTfuPKNL1d6GQtE596) · [Booking lifecycle](https://claude.ai/artifact/RxMc8Fo42hFJehRr2v9e95) · [Architecture](https://claude.ai/artifact/CpWLPDMmLeSH7JNejgycZm) · [UI/UX canvas](https://claude.ai/artifact/4nJUHsYwRj27tKpZB6SMEC)

## Run the app now (demo rooms, no backend)

```sh
cd web
pnpm install
pnpm dev
```

Open http://localhost:3000. Without Supabase settings the app shows five sample rooms so you can click through onboarding, Explore, filters and room pages. Sign-up, requests and hosting need Supabase (below).

## Connect Supabase

1. Create a project on the Pro plan. Measure latency from an Abuja phone to London and Frankfurt first; the region can't be changed later.
2. Link and push the database:
   ```sh
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   psql "<connection string>" -f supabase/seed.sql
   ```
3. Add two Vault secrets (Dashboard > Project Settings > Vault) so pg_cron can call the worker: `project_url` (https://<ref>.supabase.co) and `service_role_key`.
4. Deploy the Edge Functions and set their secrets:
   ```sh
   npx supabase functions deploy verify paystack payout-account
   npx supabase functions deploy paystack-webhook worker --no-verify-jwt
   npx supabase secrets set SITE_URL=https://<your site> PAYSTACK_SECRET_KEY=sk_test_... \
     ALLOW_TEST_VERIFICATION=true            # development only, see Identity below
   # optional: GOOGLE_MAPS_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
   ```
5. Auth settings (Dashboard > Authentication):
   - Email: turn on confirmations and put `{{ .Token }}` in the "Confirm signup" template, so people get a 6-digit code.
   - SMTP: connect Resend, Postmark or Amazon SES. The built-in sender only sends a few emails an hour.
   - Phone: connect an SMS provider (or a Send SMS hook) for the phone check in verification.
   - Google: add the OAuth client. Redirect URL: `https://<your site>/auth/callback`.
   - Bot protection: turn on Cloudflare Turnstile.
6. In `web/.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `web/.env.example`).
7. Paystack dashboard: set the webhook URL to `https://<ref>.supabase.co/functions/v1/paystack-webhook`.

## How it fits together

- **Browsing** goes through `/api/search`, which calls `search_rooms()` and is cached at the edge for 60 seconds per filter set. Room pages re-render every 60 seconds.
- **Bookings** change only through `request_room()` and `booking_action()` in Postgres. Constraints block double bookings, allow one request in progress per room, and enforce the request limit. pg_cron runs `sys_expire_overdue()` every minute for deadlines.
- **Money**: `start_payment()` sets the amount, the `paystack` function opens checkout, and the signed Paystack webhook is the only thing that marks a booking paid. The host's share is sent with Paystack Transfers 24 hours after check-in, unless a problem is reported. Refunds go through the same queue.
- **Jobs** (WhatsApp, payouts, refunds, commute times) are written to `private.jobs` in the same transaction as the change that caused them. The `worker` function drains them every 10 seconds with retries.
- **Photos** are taken with the in-app camera, resized on the phone to about 200 KB, stamped with location and time, and served resized from Supabase Storage.

## Tests

```sh
supabase/tests/run-local.sh   # needs a local Postgres; runs the whole booking lifecycle
cd web && pnpm build          # type-check and build
```

## Still to do before launch

- **Identity provider.** `supabase/functions/_shared/identity.ts` has the interface and a test double only. Pick the NIN and liveness provider and implement it there. Never set `ALLOW_TEST_VERIFICATION` in production.
- **Payout model.** Payouts use Paystack Transfers from the Bunkie balance, which means Bunkie holds the money until release. The PRD's preferred option (subaccounts on manual settlement) needs Paystack to confirm how settlement is released. Get legal sign-off on holding funds either way.
- **WhatsApp templates.** Get the `bunkie_*` templates in `functions/worker/index.ts` approved by Meta. Without a token, the worker logs messages instead of sending them.
- **Confirm reference data**: camp end dates in `supabase/seed.sql` (they are placeholders) and the PPA zone list. Keep `web/src/lib/places.ts` in step with the seed.
- **Not built yet**: map view and choose-on-map, the in-app PPA switch window, monthly rent payments, move-out photos and deposit return, accuracy ratings, and an admin review screen for flagged listings and reports.
- **Copy placeholders**: company name, CAC number, support phone and email, and terms and privacy text pending legal review.
