# GeKnee Travel App — Architecture

> Living document. Update when adding new routes, components, or services.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| 3D Globe | React Three Fiber (R3F) + Drei |
| Maps | Google Maps JS (@googlemaps/js-api-loader) |
| Auth | NextAuth v5 beta + Prisma adapter |
| Database | Supabase (PostgreSQL via Prisma v6) |
| AI | Anthropic SDK (`claude-sonnet-4-5`) |
| Hosting | Vercel (auto-deploy from GitHub `main`) |
| Analytics | Vercel Speed Insights + Analytics |

---

## Directory Structure

```
travel-ai/
├── app/
│   ├── layout.tsx              # Root layout: SessionProvider, GlobalChat, Analytics
│   ├── page.tsx                # Redirects → /plan/location
│   │
│   ├── api/                    # All server-side API routes (Next.js Route Handlers)
│   │   ├── auth/
│   │   │   ├── [...nextauth]/route.ts   # NextAuth handler
│   │   │   └── register/route.ts        # Email/password registration
│   │   ├── chat/route.ts               # Genie AI chat (Anthropic streaming)
│   │   ├── itinerary/
│   │   │   ├── route.ts                # Generate full itinerary
│   │   │   ├── optimize/route.ts       # Re-order days for efficiency
│   │   │   └── replan/route.ts         # Modify itinerary on request
│   │   ├── trips/
│   │   │   ├── route.ts                # GET all trips / POST new trip
│   │   │   └── [id]/route.ts           # GET/PATCH/DELETE single trip
│   │   ├── trip-messages/route.ts      # Group chat messages (Prisma)
│   │   ├── friends/
│   │   │   ├── route.ts                # List friends / send request
│   │   │   └── [id]/route.ts           # Accept / remove friend
│   │   ├── presence/route.ts           # Real-time user presence (polling)
│   │   ├── geocode/route.ts            # Google Geocoding proxy
│   │   ├── weather/route.ts            # Weather data
│   │   ├── flights/route.ts            # Flight search
│   │   ├── flight-prices/route.ts      # Price chart data (may be unused in UI)
│   │   ├── transport/route.ts          # Transport between places
│   │   ├── images/route.ts             # Unsplash image search
│   │   ├── place-images/route.ts       # Google Places images
│   │   ├── place-photo/route.ts        # Single place photo proxy
│   │   ├── recommendations/route.ts    # AI place recommendations
│   │   └── me/username/route.ts        # Update username
│   │
│   ├── components/             # Shared client components (rendered in every page)
│   │   ├── GlobalChat.tsx      # Genie AI chat panel (bottom-left overlay)
│   │   ├── AuthModal.tsx       # Sign in / sign up modal
│   │   ├── SettingsPanel.tsx   # User settings drawer
│   │   └── TripSocialPanel.tsx # Friends, group chat, presence
│   │
│   └── plan/                   # Planning flow (sequential pages)
│       ├── location/
│       │   ├── page.tsx        # Thin SSR-disabled wrapper (no window access)
│       │   └── LocationClient.tsx  # Full 3D globe page (~4300 lines)
│       ├── style/
│       │   ├── page.tsx        # 5-step preferences form
│       │   └── FlightPriceChart.tsx
│       ├── dates/
│       │   ├── page.tsx        # Date picker
│       │   └── InteractiveRouteMap.tsx
│       ├── summary/
│       │   ├── page.tsx        # AI itinerary + tabs
│       │   ├── DayMap.tsx      # Per-day map with pins
│       │   ├── PlanningMap.tsx # Full-trip route overview
│       │   ├── RouteMap.tsx    # Google Maps route display
│       │   └── BookTab.tsx     # Booking links
│       └── book/
│           └── page.tsx        # Final booking page
│
├── lib/                        # Shared utilities (server + client)
│   ├── prisma.ts               # Prisma client singleton
│   ├── airports.ts             # ~300 airport IATA codes + coords
│   ├── geoLabels.ts            # Continent/region label data
│   ├── globeAnim.ts            # Globe rotation animation helpers
│   └── googleMapsLoader.ts     # Lazy Google Maps JS API loader
│
├── auth.ts                     # NextAuth config (Google + credentials providers)
├── prisma/
│   └── schema.prisma           # DB schema: User, Trip, TripMessage, Friend
├── public/
│   ├── ne_110m_admin_0_countries.json   # Country border GeoJSON (globe)
│   ├── ne_10m_admin_1_states_provinces.json  # State border GeoJSON
│   └── models/                 # GLB landmark models (gitignored — too large)
│       └── UPLOAD_GUIDE.txt    # Lists all 275 expected model paths
│
├── PRD.md                      # Product Requirements Document
├── ARCHITECTURE.md             # This file
├── PLAN.md                     # Implementation roadmap
├── next.config.ts
├── tailwind.config (inline in globals.css)
└── tsconfig.json
```

---

## Page Flow

```
/ (redirects)
    ↓
/plan/location          ← 3D globe, type or click a destination
    ↓  ?location=X
/plan/style             ← 5-step preferences (purpose, style, budget, interests, constraints)
    ↓  ?location=X&purpose=...&style=...&budget=...&interests=...&constraints=...
/plan/dates             ← date picker (departure + return)
    ↓  + &departure=...&return=...&nights=N
/plan/summary           ← AI-generated itinerary, tabs: Overview / Days / Map / Book
    ↓
/plan/book              ← booking links (flights, hotels)
```

All parameters are passed as **URL query strings** — no global state, no cookies.

---

## Key Architectural Patterns

### 1. R3F ↔ React Communication (module-level bridge)

R3F Canvas runs in a separate React root. Props/context don't cross the boundary.
Solution: module-level function refs set from the parent, called from inside R3F.

```ts
// LocationClient.tsx (top of file)
let _lmNav: ((loc: string) => void) | null = null;
let _globeClick: (() => void) | null = null;
function _setLmNav(fn: (loc: string) => void) { _lmNav = fn; }
function _setGlobeClick(fn: () => void) { _globeClick = fn; }

// Registered in LocationPage component:
useState(() => {
  _setLmNav((loc) => {
    setLocation(loc);
    window.dispatchEvent(new CustomEvent('geknee:globeselect', { detail: { location: loc } }));
  });
  _setGlobeClick(() => {
    window.dispatchEvent(new CustomEvent('geknee:globeselect', { detail: { location: '' } }));
  });
});
```

### 2. Globe → GlobalChat via Custom Events

```
Landmark click → _lmNav(loc) → CustomEvent('geknee:globeselect', { location })
Globe click    → _globeClick() → CustomEvent('geknee:globeselect', { location: '' })
                                      ↓
                             GlobalChat listens, opens panel, populates confirming state
```

### 3. SSR Disabled for Globe

`app/plan/location/page.tsx` is a thin wrapper:
```tsx
const LocationClient = dynamic(() => import('./LocationClient'), { ssr: false });
```
Three.js/R3F access `window` at import time — SSR would crash.

### 4. GLB Models with Error Boundary

```tsx
<ModelErrorBoundary fallback={<>{children}</>}>    ← catches fetch/parse errors
  <Suspense fallback={<>{children}</>}>             ← handles loading state
    <GlbModel path={model.path} scale={1} />
  </Suspense>
</ModelErrorBoundary>
```
GLBs are gitignored (too large). Production falls back to primitive shapes.

### 5. Prisma Singleton

`lib/prisma.ts` exports a global singleton to avoid exhausting DB connections during hot reload:
```ts
const globalForPrisma = globalThis as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

## Database Schema (Prisma)

```
User
  id, email, name, username, image, password (hashed)
  → trips (Trip[])
  → friends (Friend[])
  → messages (TripMessage[])

Trip
  id, userId, title, destination, startDate, endDate
  itinerary (JSON), preferences (JSON), status
  → members (User[])
  → messages (TripMessage[])

TripMessage
  id, tripId, userId, content, createdAt

Friend
  id, requesterId, addresseeId, status (PENDING | ACCEPTED)
```

---

## API Routes Reference

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/chat` | POST | optional | Genie AI streaming chat |
| `/api/itinerary` | POST | yes | Generate itinerary from prefs |
| `/api/itinerary/optimize` | POST | yes | Re-order for efficiency |
| `/api/itinerary/replan` | POST | yes | Modify itinerary |
| `/api/trips` | GET/POST | yes | List / create trips |
| `/api/trips/[id]` | GET/PATCH/DELETE | yes | Single trip CRUD |
| `/api/trip-messages` | GET/POST | yes | Group chat |
| `/api/friends` | GET/POST | yes | Friends list / request |
| `/api/friends/[id]` | PATCH/DELETE | yes | Accept / remove |
| `/api/presence` | GET/POST | yes | Online presence |
| `/api/geocode` | GET | no | Google Geocoding proxy |
| `/api/weather` | GET | no | Weather for destination |
| `/api/flights` | GET | no | Flight search |
| `/api/images` | GET | no | Unsplash destination images |
| `/api/place-images` | GET | no | Google Places photos |
| `/api/place-photo` | GET | no | Single photo proxy |
| `/api/recommendations` | POST | no | AI place recommendations |
| `/api/transport` | POST | no | Transport between places |

---

## External Services & API Keys

| Service | Env Var | Usage | Cost |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | Genie chat, itinerary gen | ~$0.003/msg |
| Google Maps | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Geocoding, Places, Maps JS, route maps | $200/mo free credit |
| Google OAuth | `GOOGLE_CLIENT_ID/SECRET` | Sign in with Google | Free |
| Supabase | `DATABASE_URL`, `DIRECT_URL` | PostgreSQL database | Free tier |
| Vercel | (auto) | Hosting, Cron (planned) | Free tier |

All keys live in `.env.local` (gitignored) and Vercel Environment Variables dashboard.

---

## Deployment

- **Repo**: GitHub (`main` branch)
- **Auto-deploy**: Every push to `main` triggers Vercel rebuild
- **Domain**: `geknee.com` → Vercel project `geknee-travel-ai`
- **CLI deploys**: Avoid — SSL interception on this machine breaks `vercel --prod`. Use git push instead.
- **Environment**: Vercel dashboard > Settings > Environment Variables (do not paste quotes around values)
