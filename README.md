# Agile FJU Handup Monorepo

This repository is split into two workspaces:

- `frontend/`: Next.js app (UI + current Supabase integration)
- `backend/`: Fastify + Prisma API scaffold for Railway deployment

## Quick start

Install all workspace dependencies from the repository root:

```bash
npm install
```

Run frontend only:

```bash
npm run dev:frontend
```

Run backend only:

```bash
npm run dev:backend
```

Run both together:

```bash
npm run dev
```

## Backend environment

Copy backend env example and fill values:

```bash
cp backend/.env.example backend/.env
```

Then update `DATABASE_URL` to your Railway PostgreSQL connection string.
