# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📁 Project Structure

```
src/
├── app/                 # App Router (Next.js 13+)
│   ├── api/             # API Route Handlers
│   │   ├── auth/        # Authentication endpoints (NextAuth)
│   │   ├── bots/        # Trading bot CRUD operations
│   │   ├── prices/      # CoinGecko integration (real crypto prices)
│   │   ├── reports/     # Trading report generation
│   │   ├── vaults/      # Vault investment management
│   │   └── yield/       # Yield opportunity endpoints
│   ├── dashboard/       # Dashboard pages (protected routes)
│   │   ├── ai/          # AI trading assistant
│   │   ├── bots/        # Bot management interface
│   │   └── builder/     # Bot creation wizard
│   ├── layout.tsx       # Root layout (providers, metadata)
│   └── page.tsx         # Landing page
├── components/          # Shared UI components
├── context/             # React contexts (AuthContext)
├── hooks/               # Custom React hooks (useCoingecko, etc.)
├── lib/                 # Utilities, services, configs
│   ├── coingecko.ts     # CoinGecko API service (real price data)
│   ├── mongo.ts         # MongoDB connection manager
│   ├── auth-store.ts    # User data persistence (JSON file fallback)
│   └── models/          # Mongoose schemas (TradingBot, User, etc.)
├── store/               # App state management (AppStoreContext)
├── styles/              # CSS/Tailwind configuration
└── types/               # TypeScript interfaces
```

## 🔧 Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:4028)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code with Prettier
npm run format

# Type checking
npm run type-check
```

## 🔑 Key Features & Implementation Details

### Authentication
- **NextAuth.js** with Google OAuth provider
- Session management via JWT tokens
- User data stored in MongoDB with fallback to JSON file
- Role-based access (Admin/Trader)

### Data Layer
- **MongoDB** via Mongoose ODA
- Connection pooling with caching to prevent excessive connections
- Models: User, TradingBot, Vault, YieldOpportunity, Report
- Automatic indexing on frequently queried fields

### Real-time Data
- **CoinGecko API integration** (free tier, no key required)
- Caching layer (1-minute TTL) to prevent rate limiting
- Endpoints: `/api/prices` (current prices) & `/api/prices/chart` (historical data)
- Used in dashboard components for live price charts and metrics

### State Management
- Custom `AppStoreContext` (React Context + useState/useEffect)
- Manages user session, bots, toasts, reports, vaults, active tab
- Persists user data from AuthContext on login
- Provides methods for CRUD operations on entities

### Styling & UI
- **Tailwind CSS** with custom configuration
- Dark/light mode support via CSS variables
- Responsive design (mobile-first approach)
- Reusable components in `/components`
- Lucide icons for consistent visual language

### API Routes
All API routes follow REST conventions and are located in `src/app/api/`:
- Protected routes verify session via `getSessionFromRequest()`
- Input validation with specific error messages
- Proper HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Error logging to console for debugging

## 🚫 Constraints & Best Practices

1. **File Size Limit**: Keep components under 500 lines
2. **No Direct DOM Access**: Use React refs when necessary
3. **Environment Variables**: Never commit `.env` - use `.env.example` template
4. **Error Boundaries**: Implement for client-side error boundaries
5. **Loading States**: All async operations should show loading/UI states
6. **Accessibility**: Ensure proper ARIA labels, keyboard navigation, focus management
7. **Type Safety**: Use TypeScript interfaces/types, avoid `any` when possible
8. **Database**: Always validate data before saving to DB
9. **API Routes**: Handle edge cases (missing params, invalid data, db disconnection)
10. **Authentication**: Protect all dashboard routes and API endpoints

## 🔍 Common Development Tasks

### Adding a New API Endpoint
1. Create route file: `src/app/api/[resource]/route.ts`
2. Implement GET/POST/PUT/DELETE handlers as needed
3. Add validation and error handling
4. Protect with session check: `const session = await getSessionFromRequest(request)`
5. Return appropriate JSON responses with correct status codes

### Adding a New Dashboard Page
1. Create page file: `src/app/dashboard/[page-name]/page.tsx`
2. Use `useAppStore` hook for shared state
3. Fetch data via `useEffect` + API calls or WebSocket (if implemented)
4. Implement loading and empty states
5. Add to navigation in `DashboardHeader.tsx` (if applicable)

### Modifying Database Schema
1. Update model in `src/lib/models/[ModelName].ts`
2. Add/index fields as needed
3. Run migration script if existing data needs updating
4. Update related API routes and service functions

### Integrating Third-Party API
1. Create service in `lib/` directory (e.g., `lib/newsapi.ts`)
2. Add caching layer if rate-limited
3. Create custom hook in `hooks/` (e.g., `useNews.ts`)
4. Use hook in components/pages
5. Handle loading/error states appropriately

## 🗄️ Database Models Overview

### User
- id, email, name, role (Admin/Trader), createdAt
- Optional: image, googleId (for OAuth), passwordHash (for email/password)

### TradingBot
- type (Grid/DCA/Arbitrage/Trailing Stop)
- pair (e.g., "BTC/USDT")
- userId (ref to User)
- confidence (0-100)
- status (running/paused/fallback)
- pnl (string format: "+4.2%" or "-0.6%")
- timestamps

### Vault/Yield Opportunity
- Various investment products with APY, risk level, minimum investment

### Report
- Generated trading reports with performance metrics
- Linked to user for personalization

## 🌐 External Services

1. **CoinGecko** - Free cryptocurrency market data API
   - Used for real-time price charts and market data
   - Rate limit: 50-100 calls/minute (mitigated by client-side caching)

2. **Resend** - Email transactional service
   - Used for sending verification, welcome, and notification emails

3. **Google OAuth** - Authentication provider
   - Configured via NextAuth with custom callback handling

## 📱 Responsive Design Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

Navigation sidebar converts to bottom navigation on mobile (< 768px) as implemented in DashboardHeader.

## 🔐 Security Considerations

1. **Authentication**: All dashboard routes and API endpoints are protected
2. **Data Validation**: All API inputs validated for type, format, and business rules
3. **Environment Variables**: Secrets stored in `.env` (never committed)
4. **CORS**: Next.js API routes are same-origin by default
5. **Rate Limiting**: Implemented via caching for external APIs (CoinGecko)
6. **Input Sanitization**: User inputs validated before database operations