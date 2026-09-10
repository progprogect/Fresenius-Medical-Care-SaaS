# Architecture

## System overview

```
                         ┌──────────────────────────────────────────────┐
                         │                Next.js (Railway)             │
 Patient ── widget ────► │  /widget  /embed.js  /demo-site  /offer/[t]  │
 Patient ── WhatsApp ──► │  /api/twilio/inbound                         │
 ElevenLabs voice ─────► │  /api/agent-tools/[tool]   (secret header)   │
 Staff ── browser ─────► │  /(admin)/* pages + server actions           │
                         │                                              │
                         │  lib/agent   lib/scheduling   lib/backfill   │
                         │  lib/elevenlabs  lib/notify  lib/settings    │
                         │                 Prisma ORM                   │
                         └───────────────┬──────────────────────────────┘
                                         │
                                   PostgreSQL (Railway)
        OpenAI (chat brain)   ElevenLabs (voice agent)   Twilio (WhatsApp/SMS)
```

The scheduling core (slots, booking, reschedule, cancel) is **internal** — no external EMR is
required. Integration later happens by re-implementing the functions in `lib/scheduling.ts`
against the customer's EMR API; every consumer (AI tools, admin UI, backfill) goes through this
single module.

## Module map

| Module | Responsibility |
|---|---|
| `src/lib/scheduling.ts` | Slot computation from working hours (timezone-aware), booking with race protection, reschedule with optimistic locking (`version`), cancellation with lead-time policy |
| `src/lib/backfill.ts` | Earlier-slot offers: candidate selection, token links, accept/decline/expire/supersede, scan job |
| `src/lib/agent/tools.ts` | The single tool registry (zod-validated) used by BOTH the OpenAI chat brain and ElevenLabs voice webhooks |
| `src/lib/agent/brain.ts` | OpenAI tool-calling loop; persists every message and tool result per conversation |
| `src/lib/agent/prompt.ts` | One system prompt builder for chat and voice (persona + catalog + hard safety rules) |
| `src/lib/elevenlabs.ts` | Voice agent provisioning (create/patch with webhook tools), signed URLs, voice list |
| `src/lib/notify.ts` | Twilio WhatsApp/SMS with demo-mode simulation fallback |
| `src/lib/settings.ts` | Typed key-value settings: agent persona, Twilio, backfill, widget |
| `src/lib/auth.ts` | JWT cookie sessions, bcrypt credentials, ADMIN/STAFF roles |
| `src/lib/audit.ts` | Audit trail writer |

## AI agent tools (shared chat + voice)

| Tool | Use case |
|---|---|
| `verify_patient` (date of birth plus either the phone number or the name, matched fuzzily) / `register_patient` | UC-1 Identity Verification — required before any protected read/write; result stored on the conversation as a verified session, which expires after 30 minutes of silence |
| `get_my_appointments` | UC-2 View Existing Appointment |
| `find_slots` → `reschedule_appointment` (with `version`) | UC-3 Reschedule — optimistic concurrency, lead-time policy, alternative-provider support |
| `cancel_appointment` | UC-4 Cancel — confirmation-first, cancellation deadline, triggers backfill |
| `list_clinics` / `list_services` / `list_doctors` + `find_slots` → `book_appointment` | UC-5 New Booking — duplicate detection, slot race re-check |
| `escalate_to_human` | Human/Clinical Escalation — symptoms, explicit human request, failed verification; conversation flagged `NEEDS_HUMAN` for staff, who claim it from the pinned queue |
| `set_language` | Pins the conversation to the language the patient actually uses |
| `close_conversation` | Marks the conversation resolved with a summary once the patient is done; refuses while an escalation is open |

Slot references travel as opaque `slotRef` values (`doctorId@ISO`) so the LLM never constructs
date math. Tool results are replayed into the model context on every turn.

## Voice path (ElevenLabs)

1. Admin presses **Create voice agent** → `POST /v1/convai/agents/create` with the shared prompt
   and one webhook tool per registry entry (`{APP_BASE_URL}/api/agent-tools/<name>`, secret header,
   `conversation_id` injected as a system dynamic variable).
2. Widget asks `/api/voice/signed-url` and opens a WebRTC/WebSocket session via
   `@elevenlabs/react` (`ConversationProvider` + `useConversation`).
3. Live transcripts are mirrored to `/api/voice/transcript`, so staff see voice conversations in
   the admin panel; tool calls map the ElevenLabs conversation id to our Conversation row.

## Backfill flow

```
cancel/reschedule frees a future slot
  └─► createOffersForFreedSlot: pick up to N later appointments
        (same clinic+service, no open offer, patient opted in)
        create SlotOffer(token, TTL) ── send via Twilio WhatsApp (or demo simulate)
patient taps /offer/<token> → accept:
  re-check slot, reschedule atomically, mark ACCEPTED,
  supersede sibling offers for the same slot
```

## Data model highlights

- `Appointment.version` — optimistic concurrency (UC-3 step 11 "atomic reschedule using expected
  appointment version").
- `Conversation.verified + patientId` — the verified session from UC-1; voice conversations are
  linked via `externalId` (ElevenLabs conversation id).
- `AuditLog` — verification events, bookings, reschedules, cancellations, offers, escalations.
- `Setting` — JSON per key (`agent`, `twilio`, `backfill`, `widget`) with typed defaults in code.

## Security notes (demo scope)

- Sessions: HS256 JWT in an httpOnly cookie, middleware-guarded admin routes.
- Agent tool webhooks: shared-secret header; conversations scoped by id.
- Patient offer links: unguessable 24-char tokens with TTL.
- Secrets only in env vars; `.env` is gitignored, `.env.example` documents the contract.
