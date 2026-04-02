# CrewTracker

Real-time crew tracking and management platform for shipping, logistics, and servicing companies. Tracks seafarer movements globally with a web dashboard and mobile app.

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Realtime + Auth + Storage + Edge Functions)
- **Map:** Mapbox GL JS (globe view)
- **State:** Zustand + React Query
- **Deployment:** Vercel (web) + Expo EAS (mobile)

## Getting Started

```bash
npm install
cp .env.example .env.local  # Add your Supabase + Mapbox credentials
npm run dev
```

## Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_MAPBOX_TOKEN=
```

## Project Structure

```
src/
  lib/        - Supabase client, types, Mapbox config
  stores/     - Zustand state (auth, crew, dashboard)
  hooks/      - Custom hooks (realtime, events, stats, uploads)
  components/ - UI components (map, layout, stats, crew, feed)
  pages/      - Route pages (Dashboard, Crew, Vessels, Itineraries)
supabase/
  migrations/ - Database schema, RLS, RPC functions
  functions/  - Edge functions (ticket parser, status update, stats)
scripts/
  seed.ts     - Demo data generator (1000 crew, 8 vessels)
```
