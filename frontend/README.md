# Frontend

React dashboard for the Smart Obstacle-Avoidance Car Dashboard.

This directory is not scaffolded yet. It currently contains only `.env.example`, so there is no `package.json` and no install or dev command to run.

## Planned stack

The stack is defined in `../docs/AGENTS.md`:

- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query, Socket.IO client, Recharts, React Router
- React Hook Form + Zod
- date-fns
- Vitest + Testing Library

## Environment

Copy `.env.example` to `.env` when the app is scaffolded:

```powershell
Copy-Item .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_API_URL` | REST API base URL, for example `http://localhost:3000/api` |
| `VITE_WS_URL` | Socket.IO namespace, for example `http://localhost:3000/realtime` |

`VITE_*` variables are exposed to the browser. Do not put secrets in them.

## Setup

Follow `../docs/TASK.md` (Tahap 6) to scaffold the application. Once `package.json` exists, this README should be updated with the actual install, dev, build, and test commands.
