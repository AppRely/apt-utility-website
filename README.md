# Next.js 15 Hybrid Starter ⸺ Tailwind v4, shadcn/ui, TanStack Query v5, Zustand, Zod, nuqs

> A modern, opinionated template demonstrating a **hybrid-rendered** Next.js 15 app with a clean, scalable folder structure.

---

## ✨ Tech Stack

| Layer | Package | Purpose |
|-------|---------|---------|
| Framework | **next@canary (15)** | React 18 app-router, edge runtime, server actions |
| Styling | **tailwindcss@canary (v4)** | Utility-first CSS, JIT mode |
| UI primitives | **shadcn/ui** | Accessible, theme-able components (generated into `src/components/ui`) |
| Data fetching | **@tanstack/react-query v5** | Caching & network state management |
| Global state | **zustand** | Tiny, unopinionated store |
| Validation | **zod** | Runtime schemas ↔︎ TypeScript types |
| URL state | **nuqs** | Query-string ↔︎ React state sync |
| Utils | **clsx + tailwind-merge** | Class-name composition (`cn` helper) |

Dev-tooling: ESLint (Next + TS + Tailwind plugin), Prettier, TypeScript 5, pnpm 8, Turbopack dev server.

---

## 📂 Folder Structure (monorepo-friendly)

```
src/
│
├─ app/                 # Next.js app-router routes
│   ├─ layout.tsx       # Root layout (HTML, Providers, global CSS)
│   ├─ page.tsx         # Landing page (renders <Home />)
│   └─ api/hello/route.ts  # Edge function demo
│
├─ components/          # Re-usable *presentational* React components
│   ├─ ui/              # shadcn‐generated primitives (Button, Dialog, …)
│   ├─ layout/          # Navbar, Footer, Shell …
│   ├─ feedback/        # Spinner, ErrorState …
│   ├─ Home.tsx         # Showcase component (client)
│   └─ index.ts         # Barrel exports
│
├─ features/            # “Vertical slices” → UI + hooks + API + schema per domain
│   └─ posts/
│       ├─ posts-list.tsx
│       ├─ hooks.ts
│       ├─ api.ts
│       ├─ schema.ts
│       └─ index.ts
│
├─ hooks/               # Truly generic React hooks (useDebounce …)
│
├─ lib/                 # Cross-cutting runtime libraries (no JSX)
│   ├─ queryClient.ts
│   └─ api/fetcher.ts
│
├─ store/               # Global Zustand stores
├─ schemas/             # zod schemas used by multiple features
├─ utils/               # Stateless helpers (cn, formatDate …)
├─ data/                # Static mocks / fixtures
└─ types/               # Global TypeScript declarations
```

### Why this layout?

* **Separation of concerns.** UI vs feature domain vs low-level utilities.
* **Discoverability.** Find anything in one hop.
* **Scalability.** Each new domain becomes a new folder under `features/` without bloating `components/`.
* **Import clarity.** `@/components`, `@/features/posts`, `@/utils` etc. via path aliases.

---

## 🚀 Getting Started

1. **Install dependencies** (pnpm recommended):

```bash
pnpm install
```

2. **Run dev server** (Turbopack):

```bash
pnpm dev
```

3. Open <http://localhost:3000> → play with the counter, filter posts, inspect network tab — TanStack Query caches the mock request.

4. **Build & start prod preview**:

```bash
pnpm build && pnpm start
```

---

## 🛠️ How the pieces fit together

| Concern | Implementation |
|---------|----------------|
| **Global context** | `src/app/layout.tsx` wraps every route with `<Providers>` which mounts `QueryClientProvider` (TanStack Query). |
| **Styling** | `globals.css` imports Tailwind v4 layers; `tailwind.config.ts` enables dark mode (`class`) and shadcn preset. |
| **shadcn/ui** | CLI writes components into `src/components/ui`. `Button.tsx` demonstrates theming with Tailwind classes via `cn`. |
| **Data fetching** | `lib/queryClient.ts` exports a singleton; feature hooks (`features/posts/hooks.ts`) call `@tanstack/react-query`. |
| **Mock API** | `features/posts/api.ts` fetches from `data/posts.ts` (simulated latency) and validates with zod. |
| **State management** | `store/counter.ts` exposes a simple counter store consumed in `Home.tsx`. |
| **URL state** | `nuqs` kept filter query param in sync with React state (`Home.tsx`). |
| **Utilities** | `utils/cn.ts` merges class names safely; `utils/formatDate.ts` tiny example. |
| **Edge route** | `app/api/hello/route.ts` shows an Edge-runtime function returning JSON. |

---

## 🧭 Next Steps

* Run `pnpm shadcn` to add more UI primitives.
* Replace mocks in `data/` with real REST/GraphQL calls.
* Add feature folders (e.g., `auth/`, `profile/`), following the `posts/` blueprint.
* Enable **server actions** or **edge runtime** where beneficial — layout is already compatible.

Enjoy your new playground! ✌️