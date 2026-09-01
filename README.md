# APT Utility Website

APT Utility Website is a browser-based frontend for reviewing and correcting animal trajectory data. It combines video playback with tracking annotations, trajectory timelines, correction operations, and backend-generated suggestions.

This repository contains the Next.js frontend and requires the APT video-processing backend.

> For instructions on creating projects, reviewing trajectories, using operations, and keyboard shortcuts, see the [User Guide](./docs/USER_GUIDE.md).

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 15 App Router |
| UI | React 19, TypeScript, Tailwind CSS, shadcn/Radix primitives |
| Server state | TanStack Query 5 |
| Video overlay | Konva and react-konva |
| Charts | Recharts |
| Icons | Lucide React |
| Utilities | Zod, clsx, tailwind-merge |
| Media support | FFmpeg WebAssembly |
| Packaging | pnpm, Docker, standalone Next.js output |

## Quick start

### Prerequisites

- Node.js 18 or newer. Node.js 20 is recommended and used by Docker.
- pnpm. The repository includes `pnpm-lock.yaml`.
- A running APT backend providing the `/api/v1/videos/...` endpoints.
- A modern browser with JavaScript enabled.

### Installation

```bash
git clone <repository-url>
cd apt-utility-website
pnpm install
```

Create or update `.env` in the repository root:

```env
NEXT_PUBLIC_SERVER_ENDPOINT=http://localhost:8002
```

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Start the production server after building. |
| `pnpm type-check` | Run TypeScript without emitting files. |
| `pnpm lint` | Run the configured Next.js lint command. |
| `pnpm shadcn` | Run the shadcn component CLI. |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SERVER_ENDPOINT` | Yes | Base URL of the APT backend. It must be reachable from the browser. |

Restart the development server after changing environment variables.

## Docker

```bash
docker compose up --build
```

The frontend is exposed on port `3000`. Ensure the browser or container can reach the backend.

> The current Compose files define `NEXT_PUBLIC_API_URL`, while the application API clients use `NEXT_PUBLIC_SERVER_ENDPOINT`. Deployments must provide `NEXT_PUBLIC_SERVER_ENDPOINT` explicitly.

## Project structure

```text
src/
├── app/                         # Routes and pages
│   ├── dashboard/              # Main annotation workspace
│   └── popup/                  # Unique IDs and confusion views
├── components/
│   ├── annotation/             # Project, audit, and dialog UI
│   ├── dashboard/              # Video, sidebar, timelines, and tables
│   └── ui/                     # Shared UI primitives
├── lib/
│   ├── api/                    # Typed backend API clients
│   ├── trajectoryLinking.ts    # Continuation thresholds and helpers
│   └── utils/                  # Shared utilities
├── types/                      # Shared TypeScript types
├── styles/                     # Global styles
└── store/, hooks/, schemas/    # State, hooks, and validation
```

Important components:

- `MainFrames.tsx` owns shared object-selection and clip state.
- `DynamicVideo.tsx` implements playback, annotations, timelines, suggestions, and view shortcuts.
- `Sidebar.tsx` implements selection details and mutation workflows.
- `CreateProjectModal.tsx` implements project upload.
- `src/lib/api/` contains backend clients.

## Backend integration

The frontend uses the backend for project processing, frame annotations, object metadata, timeline coordinates, trajectory mutations, undo/redo, audit logs, TRK export, confusion processing, and trajectory suggestions.

When adding an endpoint:

1. Add a typed client in `src/lib/api`.
2. Build the URL from `NEXT_PUBLIC_SERVER_ENDPOINT`.
3. Handle non-2xx and malformed responses.
4. Cancel or ignore stale range and suggestion requests where appropriate.
5. Refresh affected caches and local state after mutations.

### Application data flow

- TanStack Query manages project, frame, activity, and on-demand server data.
- Annotation and ID ranges are fetched incrementally around the current frame.
- `sessionStorage` carries project metadata from the landing page to the dashboard.
- `MainFrames` shares selections and clip boundaries between the video and sidebar.
- Successful mutations refresh affected annotations and timelines.
- Suggestion requests are scoped to the selected object, and stale requests are cancelled or ignored.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Project list, project creation, audit access, and deletion. |
| `/dashboard` | Main annotation workspace. |
| `/popup/unique-ids` | Unique trajectory ID table. |
| `/popup/confusion` | Confusion review table. |

## Documentation

See [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) for the complete application workflow, trajectory operations, smart features, video and timeline controls, and keyboard shortcuts.
