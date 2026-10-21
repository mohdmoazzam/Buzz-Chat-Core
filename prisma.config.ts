// Prisma CLI config (Prisma 7 no longer reads .env or URLs from schema.prisma).
// DB-first: database/schema.sql is the source of truth; `npm run db:pull`
// introspects it into prisma/schema.prisma. There are no Prisma migrations.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        seed: "tsx prisma/seed.ts",
    },
    // Introspection and `db execute` need a direct (non-pooled) connection; the app uses DATABASE_URL
    datasource: {
        url: env("DIRECT_URL"),
    },
});
