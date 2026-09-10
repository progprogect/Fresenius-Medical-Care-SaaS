# Fresenius Medical Care — AI Voice Call Center

An AI-powered call center for the Fresenius Medical Care European clinic network (dialysis / nephrology).
Patients book, view, reschedule and cancel appointments by **website chat widget, voice call
(ElevenLabs), or WhatsApp (Twilio)**. Staff manage everything in a desktop-first admin panel.
The system is fully self-contained (own scheduling core) and designed so an external EMR can be
plugged in later behind the same interfaces.

## Feature map

| Area | What it does |
|---|---|
| AI assistant (chat) | OpenAI tool-calling agent: identity verification, booking, view/reschedule/cancel, doctor recommendations with reasons, clinical escalation to a human |
| AI assistant (voice) | ElevenLabs Agents Platform agent provisioned from the admin panel; same tools via webhooks; voice calls right in the widget |
| Website widget | Embeddable with one `<script src=".../embed.js">` tag; chat + voice; demo site at `/demo-site` |
| WhatsApp / SMS | Twilio channel for inbound conversations and outbound offers; **demo mode** simulates sends so everything can be shown without a configured account |
| Backfill (earlier slots) | When a slot frees up (cancel/reschedule), patients with later appointments automatically get a WhatsApp offer with a one-tap accept link; first accept wins |
| Calendar | Day/week appointment book per clinic and doctor; create, reschedule, cancel, change status manually |
| Catalog | Clinics, doctors (bios, languages, working hours, services), services (duration, price, prep instructions) |
| Governance | Audit trail of every AI/staff action, optimistic locking on appointments, verification events, escalation queue |
| Access | Email+password auth, ADMIN/STAFF roles, admins manage users |

## Demo access

- Admin panel: `admin@demo.clinic` / `demo1234` (also `staff@demo.clinic` / `demo1234`)
- Demo patient for the pitch: **Emma Weber**, phone `+4915112345678`, date of birth `1985-04-12`
- Demo site with the embedded widget: `/demo-site`

## Local development

```bash
npm install
npx prisma dev -n clinic-saas -p 51214 -P 51215 --shadow-db-port 51216 -d   # local Postgres
cp .env.example .env                                                        # fill in keys
npx prisma migrate dev
npm run db:seed
npm run dev
```

Environment variables are documented in `.env.example`. Secrets live only in `.env` (gitignored)
and in Railway service variables.

## Deploy on Railway

1. Create a project from this GitHub repo. Railway auto-detects Next.js.
2. Add a **PostgreSQL** service; copy its `DATABASE_URL` into the app service variables.
3. Set the remaining variables from `.env.example`
   (`AUTH_SECRET`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `TWILIO_*`, `AGENT_TOOLS_SECRET`,
   and `APP_BASE_URL=https://<your-domain>.up.railway.app`).
4. Set the **pre-deploy command**: `npx prisma migrate deploy`
   (first deploy only, optionally seed: `npx prisma migrate deploy && npx tsx prisma/seed.ts`).
5. Deploy. Then in the admin panel open **AI agent → Re-sync agent** so the ElevenLabs webhook
   tools point at the public Railway URL (voice booking needs a public URL).
6. Optional: point the Twilio messaging webhook to `https://<domain>/api/twilio/inbound` and
   switch Channels → Twilio to live mode.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map, agent tool contracts, the
scheduling/backfill engines and the use-case traceability matrix.
