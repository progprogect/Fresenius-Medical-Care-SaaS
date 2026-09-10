/**
 * Idempotent first-run provisioning for a fresh deployment.
 * Seeds the demo dataset only when the database has no users yet, so every
 * later deploy leaves production data untouched.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const users = await db.user.count();
  if (users > 0) {
    console.log(`Bootstrap: database already provisioned (${users} users) — skipping seed.`);
    return;
  }
  console.log("Bootstrap: empty database detected, seeding demo dataset...");
  const { seed } = await import("./seed");
  await seed();
}

main()
  .catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
