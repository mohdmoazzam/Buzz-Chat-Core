# BuzzChat API

Backend for BuzzChat, a real-time chat app: friends, 1:1 and group chats, file sharing, and email + in-app notifications.

**Stack:** NestJS 11 · PostgreSQL (Neon) with Prisma 7 · Socket.IO · BullMQ on Redis · EJS email templates sent with Brevo · Cloudinary for files

## Docs

- [Features](docs/FEATURES.md): everything the app does, REST routes, socket events, notifications, limits and environment variables
- [Roadmap](docs/ROADMAP.md): suggested next features
- API reference: `/api/docs` (Swagger) on a running server

## Running locally

```bash
npm install
cp .env.example .env   # or create .env; see "Environment variables" in docs/FEATURES.md
npm run dev            # http://localhost:3000
```

Required: `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`. Email needs `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`; uploads need the Cloudinary keys.

| Script | What it does |
|---|---|
| `npm run dev` | Start with reload |
| `npm run build` / `npm start` | Production build / run |
| `npm run typecheck` | TypeScript check |
| `npm run db:apply` | Run `database/schema.sql` on a fresh database |
| `npm run db:pull` | Regenerate `prisma/schema.prisma` and the client from the database |
| `npm run db:studio` | Open Prisma Studio |

## Project layout

```
database/schema.sql        source of truth for the database
prisma/                    schema.prisma (introspected) and the generated client
templates/email/           EJS email templates (layout + one folder per email)
src/
  config/env.ts            all configuration
  core/                    Prisma, tokens, Cloudinary, Brevo mail, realtime emitter
  socket/                  Socket.IO gateway, presence, event names
  modules/
    auth/                  sign up, log in, forgot password
    user/  friend/         profiles, people search, friend requests
    chat/  message/        chats, groups, messages
    assets/                file uploads
    notification/          queues, workers, email templates, in-app inbox
    admin/                 admin panel API
```
