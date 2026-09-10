# Fresenius Medical Care — AI Voice Call Center

AI call center for the Fresenius Medical Care European clinic network: patients book/reschedule/cancel appointments via
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
- The agent must never ask a patient for an email address (unreliable over voice) and never ask
  for their city or country, never dictate an input format, and never re-ask for something the
  patient already said. Phone numbers and dates of birth are parsed tolerantly in
  `src/lib/patient-input.ts`; when a value is unclear the agent reads back its understanding for
  a yes/no instead of asking for a repeat.
- Voice and chat share ONE conversation: the widget passes its conversation id into the call as
  the `app_conversation_id` dynamic variable, the tools webhook and the transcript endpoint write
  into that row, and text typed during a live call goes through `conversation.sendUserMessage`
  rather than the chat API.
- ElevenLabs drops `built_in_tools` when the same request also sends the inline `tools` array, so
  `syncElevenLabsAgent` writes the system tools (`end_call`, `language_detection`) in a second
  PATCH. Verified against the API.
- Escalations: `escalate_to_human` sets `Conversation.status = NEEDS_HUMAN`. Staff claim one
  through `claimConversationAction`, which is first-come and writes `assignedToId`; the queue is
  pinned above the conversation log and is never hidden by the filters.
- `getSession` checks the user still exists in the database, so a removed account loses access
  immediately and a stale session cannot be written as a foreign key.
- Languages: ElevenLabs refuses a multilingual TTS model while the agent's primary language is
  `en`, so the primary must be a non-English market language (German) with English configured as
  an additional one. `syncElevenLabsAgent` picks `eleven_turbo_v2_5`, builds `language_presets`
  from the extras and translates the greeting into every configured language. One voice serves
  all of them. The conversation's detected language is stored on `Conversation.language` via the
  `set_language` tool.
- The ElevenLabs agent stores a SNAPSHOT of the system prompt, so anything time-dependent must be
  a dynamic variable: the calendar goes in as `{{today_calendar}}` and the widget supplies it at
  session start. Re-sync the voice agent after every prompt change.
- Relative dates are resolved from the CALENDAR block that `buildSystemPrompt` injects, never by
  model arithmetic; a named day goes to `find_slots` as `onDate`.
- List pages filter through the shared URL-driven `FilterBar`; filters live in the query string.
  Give each filter a short `label` (used on the active-filter chip), mark only the two or three
  most-used ones `primary: true` (they stay on the toolbar, the rest fold into the Filters
  popover), and use `kind: "sort"` for ordering so it renders apart and never counts as a filter.
- Money is EUR cents; times are stored UTC and rendered in each clinic's timezone.

## Commands
- `npm run dev` — dev server on 3000 (`.claude/launch.json`)
- `npx prisma dev -n clinic-saas -p 51214 -P 51215 --shadow-db-port 51216 -d` — local Postgres
- `npx prisma migrate dev` / `npm run db:seed`
- `npx tsc --noEmit` and `npm run lint` must pass before committing

## Demo
- admin@demo.clinic / demo1234; patient Emma Weber +4915112345678, DOB 1985-04-12
- Widget showcase: /demo-site; offers: /backfill (demo-mode WhatsApp is simulated)
