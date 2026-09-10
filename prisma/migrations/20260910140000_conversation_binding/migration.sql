-- Bind a conversation to the browser that started it: the id alone must not be
-- enough to resume a verified session or write into its transcript.
ALTER TABLE "Conversation" ADD COLUMN "clientToken" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "failedVerifications" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Conversation_clientToken_key" ON "Conversation"("clientToken");
