-- Let a staff member claim an escalated conversation so it is clear who took it.
ALTER TABLE "Conversation" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE INDEX "Conversation_status_startedAt_idx" ON "Conversation"("status", "startedAt");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
