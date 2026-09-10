/**
 * Railway Infrastructure as Code.
 * Keeps deploy behaviour in version control: run pending migrations, then the
 * idempotent bootstrap (seeds the demo dataset only on an empty database).
 */
export default {
  services: {
    "Fresenius-Medical-Care-SaaS": {
      deploy: {
        preDeployCommand: "npx prisma migrate deploy && npx tsx prisma/bootstrap.ts",
        startCommand: "npm run start",
        restartPolicyType: "ON_FAILURE",
        restartPolicyMaxRetries: 3,
      },
    },
  },
};
