-- The network is German-first, so a record created without a stated language
-- should default to German rather than English.
ALTER TABLE "Patient" ALTER COLUMN "language" SET DEFAULT 'de';
