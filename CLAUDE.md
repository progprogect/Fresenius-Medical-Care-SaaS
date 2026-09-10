# Clinic SaaS — AI Voice Call Center

AI call center for a European clinic network: patients book/reschedule/cancel appointments via
chat widget, ElevenLabs voice, or Twilio WhatsApp; staff run a desktop-first admin panel.
See README.md and docs/ARCHITECTURE.md first.

## Stack
- Next.js App Router + TypeScript, `src/` layout, `@/*` alias
- Tailwind v4 + shadcn/ui (radix-nova, neutral base), light theme, medical teal via CSS vars in `src/app/globals.css`
- Prisma 6 + PostgreSQL (local dev: `npx prisma dev`; Railway Postgres in prod)
- OpenAI (chat tool loop), ElevenLabs Agents (voice), Twilio (WhatsApp/SMS, demo-mode fallback)

## Conventions
- English only in the repository: code, comments, docs, commits, seed data.
- All UI from `src/components/ui/*`; no other UI libraries.
- Scheduling changes go ONLY through `src/lib/scheduling.ts`; agent capabilities ONLY through the
  tool registry `src/lib/agent/tools.ts` (shared by chat and voice — never fork the logic).
- Appointments use optimistic locking (`version`); pass and check it on every mutation.
- Money is EUR cents; times are stored UTC and rendered in each clinic's timezone.

## Commands
- `npm run dev` — dev server on 3000 (`.claude/launch.json`)
- `npx prisma dev -n clinic-saas -p 51214 -P 51215 --shadow-db-port 51216 -d` — local Postgres
- `npx prisma migrate dev` / `npm run db:seed`
- `npx tsc --noEmit` and `npm run lint` must pass before committing

## Demo
- admin@demo.clinic / demo1234; patient Emma Weber +4915112345678, DOB 1985-04-12
- Widget showcase: /demo-site; offers: /backfill (demo-mode WhatsApp is simulated)
