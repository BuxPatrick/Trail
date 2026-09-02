# Trail

Trail is a lightweight project manager and task tracker inspired by Jira, built
from scratch as a learning project.

The goal is not to clone Jira feature-for-feature. Trail is focused on the core
workflow: create projects, track tickets, move work through statuses, and
eventually collaborate with other users across personal and shared workspaces.

## Current MVP

Trail currently supports:

- Neon Auth sign up and login
- Automatic personal workspace creation
- Project creation with internally generated project keys
- Ticket creation inside projects
- Ticket status tracking across:
  - Backlog
  - To do
  - In progress
  - Blocked
  - Done
  - Closed
- Ticket priority tracking
- Ticket detail editing
- Ticket deletion
- Project rename and archive
- A homepage task view showing open assigned work across projects
- Urgent and blocked tasks surfaced first

## Tech Stack

- React
- TypeScript
- Vite
- Express
- PostgreSQL
- Kysely
- Neon Auth
- Vercel
- Vitest
- Playwright

## Project Structure

```txt
client/   React frontend
server/   Express API and database services
shared/   Shared schemas, enums, and TypeScript types
api/      Vercel serverless entrypoint
e2e/      Playwright smoke tests
docs/     Design specs and implementation plans
```

## Getting Started

### 1. Install dependencies

```sh
npm install
```

### 2. Set up environment variables

Create a `.env` file from the example:

```sh
cp .env.example .env
```

Required values:

```env
DATABASE_URL=postgresql://...
NEON_AUTH_URL=https://your-neon-auth-url/neondb/auth
```

The client also needs:

```env
VITE_NEON_AUTH_URL=https://your-neon-auth-url/neondb/auth
```

### 3. Run database migrations

```sh
npm run migrate
```

### 4. Start the API server

```sh
npm run dev:server
```

### 5. Start the client

```sh
npm run dev:client
```

The app runs locally at:

```txt
http://localhost:5173
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev:server` | Start the Express API |
| `npm run dev:client` | Start the Vite frontend |
| `npm run migrate` | Run database migrations |
| `npm run typecheck` | Run TypeScript checks |
| `npm run test` | Run unit and integration tests |
| `npm run e2e` | Run Playwright smoke tests |
| `npm run build` | Build the app for production |

## Product Direction

Trail is being built incrementally. Each increment should leave the app usable
and deployable.

Planned next areas:

- Collaboration workspaces
- Inviting users
- Assigning tickets to other users
- Epics
- Project-level members
- Better filtering and task views
- Production hardening

## Design Notes

Trail treats personal work and collaboration work as workspaces. A user's
personal area is simply a private workspace with one member. This keeps the
model simple now while leaving room for team collaboration later.

Projects have short internal keys used for readable ticket labels like `TRA-1`,
but users do not need to create those keys manually. Trail generates them
automatically from the project name.
