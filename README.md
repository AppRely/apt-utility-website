# APT Utility Website

APT Utility Website is a browser-based animal trajectory review and correction tool. It combines video with tracking data so users can inspect object IDs, trajectories, and skeleton keypoints; correct tracking mistakes; and navigate automatically detected problems.

This repository contains the Next.js frontend. It requires the APT video-processing backend for project upload, video data, trajectory operations, suggestions, audit data, and exports.

## Table of contents

- [Main capabilities](#main-capabilities)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Commands](#commands)
- [Docker](#docker)
- [Workflow](#workflow)
- [Dashboard overview](#dashboard-overview)
- [Selecting objects](#selecting-objects)
- [Trajectory operations](#trajectory-operations)
- [Features](#features)
- [Video and timeline](#video-and-timeline)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Routes](#routes)
- [Project structure](#project-structure)
- [Backend integration](#backend-integration)
- [Data flow](#data-flow)
- [Troubleshooting](#troubleshooting)

## Main capabilities

- Create projects from a video and an optional tracking file.
- Review frames with object IDs, keypoints, skeletons, bounding boxes, and trajectory trails.
- Select one or two tracked objects from the video, object list, tables, or keyboard.
- Link, swap, break, delete, interpolate, and clip trajectories.
- Undo/redo supported operations and refresh timelines immediately after changes.
- Navigate trajectory breaks and large missing-frame gaps.
- Get trajectory-linking and clipping suggestions from the backend.
- Browse trajectories by length and inspect confusion data.
- View normal X/Y trajectories or individual skeleton-point coordinates.
- Export updated tracking data and review the audit log.

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

## Prerequisites

- Node.js 18 or newer. Node.js 20 is recommended and used by Docker.
- pnpm (the repository includes `pnpm-lock.yaml`).
- A running APT backend providing the `/api/v1/videos/...` endpoints in `src/lib/api`.
- A modern browser with JavaScript enabled.

## Getting started

### 1. Clone the repository

```bash
git clone <repository-url>
cd apt-utility-website
```

### 2. Configure the backend

Create or update `.env` in the repository root:

```env
NEXT_PUBLIC_SERVER_ENDPOINT=http://localhost:8002
```

The URL must be reachable by the browser because API requests are made from the client.

### 3. Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Production build

```bash
pnpm build
pnpm start
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Start the production server after building. |
| `pnpm type-check` | Run TypeScript without emitting files. |
| `pnpm lint` | Run the configured Next.js lint command. |
| `pnpm shadcn` | Run the shadcn component CLI. |

## Docker

```bash
docker compose up --build
```

The frontend is exposed on port `3000`. Ensure the browser/container can reach the backend. The current Compose files define `NEXT_PUBLIC_API_URL`, while application API clients use `NEXT_PUBLIC_SERVER_ENDPOINT`; deployments must provide `NEXT_PUBLIC_SERVER_ENDPOINT` explicitly.

## Workflow

### Create a project

1. Open the landing page.
2. Click **Create Project**.
3. Enter a project name.
4. Select a file under **Video Upload**.
5. Optionally select a tracking file.
6. Click **Create** and wait for backend processing.

Video examples shown by the UI are `.avi`, `.mp4`, `.mov`, and `.ufmf`. Tracking examples are `.trk`, `.json`, `.csv`, and `.xml`. Actual support is determined by the backend.

### Open and manage projects

The landing page groups projects by status. Open a processed project to enter the dashboard. Users can also open its audit log or delete it after confirmation. The actual video and tracking filenames are displayed.

Project metadata is stored in `sessionStorage` before navigation to `/dashboard`. Opening `/dashboard` directly may leave required metadata unavailable.

## Dashboard overview

1. **Sidebar** — project information, selected objects, operation buttons, clip range, and object list.
2. **Video workspace** — playback, annotations, trajectory overlays, suggestion panels, zoom/pan, and settings.
3. **Timeline** — trajectory charts, object ranges, current frame, clip/gap highlights, and coordinate modes.

The sidebar is resizable. Drag its divider to change width and double-click the divider to reset it.

## Selecting objects

Most operations require one or two selected objects.

### Video selection

- Click an annotated object to select it as Object 1.
- Hold `Ctrl` while selecting to place it in Object 2 where supported.
- Click an already selected annotation to remove it.

### Numeric selection

- Press `1`–`9` or `0` to select a visible object as Object 1.
- Press `Ctrl+1`–`Ctrl+9` or `Ctrl+0` to select it as Object 2.
- Assignments include only objects visible in the zoomed/panned viewport.
- Press `Shift` to cycle pages when more than ten objects are visible.

### Other selection tools

- Open **Object Selection** or press `O` to see shortcut assignments.
- Press `Tab` to cycle Object 1.
- Press `Caps Lock` to cycle Object 2 when two objects are selected.
- Use **Clear** or `Backspace` to remove selections. `Backspace` clears an active clip range first.
- Unique IDs and Confusion popups can jump to relevant frames.

## Trajectory operations

Operations are available from the sidebar and keyboard. Ambiguous or destructive actions use confirmation dialogs.

### Link — `L`

Link combines trajectories belonging to the same animal.

**Two selected objects:** non-overlapping ranges link immediately. Overlapping ranges open a dialog to choose the operation and ID to preserve.

**One selected object:** the frontend finds nearby continuations that start shortly after the selected trajectory ends and pass a spatial-distance filter. Press `E` to jump to the end and select the top candidate as Object 2, then press `L`.

### Swap — `W`

Select exactly two objects, click **Swap** or press `W`, and confirm. Their tracking IDs/assignments are exchanged.

### Break — `B`

Select one object, move to the desired frame, and click **Break** or press `B`. Choose whether to break before or after the current frame and confirm.

### Delete — `D`

Select exactly one object, click **Delete** or press `D`, and confirm.

### Interpolate — `I`

- One object: interpolate within its frame range.
- Two objects: interpolate from the source ending region to the target starting region.

Use **Interpolate** or press `I`.

### Clip — `Ctrl+C`

Clip removes an interval from one trajectory:

1. Select an object.
2. Go to the first frame and press `Ctrl+C`.
3. Go to the final frame and press `Ctrl+C` again.
4. Review the purple timeline highlight.
5. Click **Clip** and confirm.

The interval must be inside the object’s frame range. The clipped track is selected after success.

### Recalculate confusion — `R`

Click **Confusion** or press `R` without `Ctrl`/`Cmd`. The backend recalculates confusion asynchronously while the frontend polls its status.

### Undo, redo, refresh, and export

- Use undo/redo buttons for supported operations.
- Press `Ctrl+R` or choose **Refresh Data** to reload dashboard data.
- Choose **Export TRK** from the top-right menu to download updated tracking data.

## Features

### Break navigation and linking suggestions

Select an object and press `.` to navigate forward through break boundaries; press `,` to return to a previously visited boundary.

At a valid mid-trajectory break, the video shows up to five ranked linking suggestions with confidence percentages. Suggestions are skipped at frame `0` or the object’s first frame because no preceding segment exists.

### Automatic continuation matching - `E`

With one selected object, `E`:

1. Jumps to its end.
2. Finds trajectories starting shortly afterward.
3. Rejects spatially distant candidates.
4. Ranks valid candidates by starting-frame proximity, then coordinate distance.
5. Selects the top candidate as Object 2.

Thresholds are configured in `src/lib/trajectoryLinking.ts`.

### Clip suggestions

With exactly one selected object, the backend identifies suspicious movement intervals.

- Suggestions appear in the fixed-width **Clip Suggestions** panel.
- Each row shows an interval and score.
- Clicking a row prepares the clip range and jumps to its peak-movement frame.
- It does not clip automatically; confirm through the normal **Clip** workflow.

### Largest-gap navigation - `G`

Select one object and press `G` to browse missing-frame gaps from largest to smallest.

- The video jumps to the gap start.
- A toast shows its rank, size, and boundaries.
- The interval is highlighted in amber on the timeline.
- Repeated presses cycle through all returned gaps.

### Browse by trajectory length

Open the top-right menu and choose **Browse by Length**.

- Choose **Longest to Shortest** or **Shortest to Longest**.
- Rows show object ID and trajectory length in frames.
- Click a row to select the trajectory and jump to its first frame.

### Confusion and Unique IDs

- Press `C` to open the Confusion table.
- Press `M` to open the Unique IDs table.
- Use their inspection, filtering/sorting, and frame-jump controls where available.

## Video and timeline

### Playback and navigation

- Play/pause from the controls, `Space`, or `P`.
- Use `←`/`→` for one-frame steps, `↑` to move forward ten frames, and `↓` to move backward ten frames.
- Click or drag the timeline to jump to a frame.
- Enter a frame in the frame input for direct navigation.
- Playback speed uses a logarithmic slider.
- Source FPS, effective FPS, current frame, and time are displayed where applicable.

### Zoom, pan, and overlays

- Zoom with controls or `=`/`-`.
- Toggle edge-aware auto-pan with `A`.
- Toggle trajectory trails with `T` and configure their length in frames from the menu.
- Toggle 3× bounding-box scale with `Z`.
- Toggle skeleton rendering with `K`.
- Switch light/dark video annotation palettes from the menu.

### Timeline modes

The timeline supports object X, object Y, combined X/Y, skeleton-point X, skeleton-point Y, and combined skeleton X/Y. Skeleton data loads only in skeleton modes. Clearing selection removes normal and skeleton trajectory lines.

### Timeline highlights

- Purple: captured clip range.
- Amber: missing-frame gap selected with `G`.
- Red marker: current frame.
- Object-range markers: trajectory starts and ends in the visible window.

## Keyboard shortcuts

Navigation/selection shortcuts are ignored while typing in inputs, and operation shortcuts are generally disabled while dialogs are open.

### Playback and navigation

| Shortcut | Action |
| --- | --- |
| `Space` / `P` | Play or pause. |
| `←` / `→` | Previous or next frame. |
| `↑` / `↓` | Jump forward/backward ten frames. |
| `S` | Go to the selected object’s start. |
| `E` | Go to its end and select the top continuation. |
| `G` | Go to the next-largest trajectory gap. |
| `.` | Go to the next break boundary. |
| `,` | Return to the previous visited boundary. |

### Selection

| Shortcut | Action |
| --- | --- |
| `1`–`9`, `0` | Select a visible object as Object 1. |
| `Ctrl+1`–`Ctrl+9`, `Ctrl+0` | Select a visible object as Object 2. |
| `Tab` | Cycle Object 1. |
| `Caps Lock` | Cycle Object 2. |
| `Shift` | Cycle visible-object shortcut pages. |
| `Backspace` | Clear clip range, Object 2, then remaining selection. |

### View and panels

| Shortcut | Action |
| --- | --- |
| `=` / `-` | Zoom in/out. |
| `T` | Toggle trajectory trails. |
| `A` | Toggle auto-pan. |
| `Z` | Toggle 3× bounding-box scale. |
| `K` | Toggle skeletons. |
| `M` | Open Unique IDs. |
| `C` | Open Confusion. |
| `O` | Toggle visible-object selection guide. |
| `?` | Open the shortcut reference. |

### Operations

| Shortcut | Action |
| --- | --- |
| `Ctrl+C` | Capture clip start/end. |
| `L` | Link selected objects/top continuation. |
| `W` | Open Swap confirmation. |
| `B` | Open Break confirmation. |
| `D` | Open Delete confirmation. |
| `I` | Interpolate selected object(s). |
| `R` | Recalculate confusion. |
| `Ctrl+R` | Refresh dashboard data. |
| `Enter` | Confirm a supported open operation dialog. |

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Project list, creation, audit access, and deletion. |
| `/dashboard` | Main annotation workspace. |
| `/popup/unique-ids` | Unique trajectory ID table. |
| `/popup/confusion` | Confusion review table. |

## Project structure

```text
src/
├── app/
│   ├── page.tsx                    # Project landing page
│   ├── dashboard/page.tsx          # Dashboard route
│   └── popup/                      # Unique IDs and confusion routes
├── components/
│   ├── annotation/                 # Project, audit, and dialog UI
│   ├── dashboard/                  # Video, sidebar, timelines, and tables
│   └── ui/                         # Shared UI primitives
├── lib/
│   ├── api/                        # Backend API clients
│   ├── trajectoryLinking.ts        # Continuation thresholds/helpers
│   └── utils/                      # Shared utilities
├── types/                          # Shared TypeScript types
├── styles/                         # Global styles
└── store/, hooks/, schemas/        # Shared state, hooks, and schemas
```

Important files:

- `MainFrames.tsx` owns shared object-selection and clip state.
- `DynamicVideo.tsx` implements playback, annotations, timelines, suggestions, and view shortcuts.
- `Sidebar.tsx` implements selection details and mutation workflows.
- `CreateProjectModal.tsx` implements project upload.
- `src/lib/api/` contains backend clients.

## Backend integration

The frontend uses backend endpoints for:

- Project upload/list/delete and processing status.
- Frame annotations, ranges, object metadata, and timeline coordinates.
- Link, swap, break, delete, interpolate, clip, undo, and redo.
- Audit logs and TRK export.
- Confusion calculation/status.
- Break navigation and linking suggestions.
- Clip suggestions, trajectory gaps, and trajectory-length browsing.

When adding an endpoint:

1. Add a typed client in `src/lib/api`.
2. Use `NEXT_PUBLIC_SERVER_ENDPOINT`.
3. Handle non-2xx and malformed responses.
4. Cancel stale range/suggestion requests where appropriate.
5. Refresh affected caches/state after mutations.

## Data flow

- TanStack Query manages project, frame, activity, and on-demand server data.
- Annotation/ID ranges are fetched incrementally around the current frame.
- `sessionStorage` carries project metadata from landing page to dashboard.
- `MainFrames` shares selected objects and clip boundaries between video and sidebar.
- Successful mutations refresh affected annotations and timelines.
- Suggestion requests are scoped to the current object; stale requests are cancelled or ignored.

## Troubleshooting

### Project or dashboard data does not load

- Confirm the backend is running and `.env` is correct.
- Restart `pnpm dev` after changing `.env`.
- Inspect failed `/api/v1/videos/...` requests in browser DevTools.

### Dashboard has no project/video information

Open it through the landing-page project row. The dashboard expects `sessionStorage` metadata.

### Operation buttons are disabled

- One object: Break, Delete, Clip, single-object Interpolate.
- Two objects: Swap, Link, two-object Interpolate.
- Clip additionally needs two captured boundaries.

### Skeleton timeline is empty

Select an object, choose a Skeleton X/Y mode, wait for loading, and confirm that tracking data contains skeleton coordinates.

### Suggestions are missing

- Linking suggestions require a valid mid-trajectory break.
- Clip suggestions require exactly one selected object.
- Continuation matches must pass frame and spatial thresholds.
- Confirm the backend suggestion endpoint succeeds in DevTools.
