# Georgian Micro Entrepreneur Tax PWA — Architectural Plan

## Executive Summary

A mobile-first Progressive Web App (PWA) that allows Georgian Individual Entrepreneurs (IEs) with **Small Business Status (1% tax regime)** to file their monthly tax declarations on rs.ge and pay taxes — all within 2 taps. The app integrates with **Bank of Georgia (BOG)** and **TBC Bank** to automatically read last month's turnover, auto-fills the rs.ge declaration form, and submits it via browser automation (Playwright).

---

## 1. Research Findings

### 1.1 rs.ge (Georgian Revenue Service)

**Official API Limitations:**
- The only public SOAP/WSDL API is the **WayBill Service** (`https://services.rs.ge/WayBillService/WayBillService.asmx?WSDL`) — focused on transport documents, **not tax declarations**.
- There is **no public REST or SOAP API** for filing monthly small business income tax declarations.
- Open-source clients ([dimakura/rs.ge](https://github.com/dimakura/rs.ge), [RealJTG/rsge](https://github.com/RealJTG/rsge)) only wrap the WayBill service and system/dictionary operations.
- The rs.ge downloads page (`eservices.rs.ge/app/Downloads`) provides downloadable tools but not a programmatic declaration submission API.

**Authentication on rs.ge Portal:**
- Login requires **username/password + SMS-based 2FA** (OTP sent to a Georgian phone number).
- There is **no documented device ID mechanism** to persist sessions and skip 2FA on trusted devices. However, the web portal does use cookies/session tokens that could theoretically be reused within a browser context.
- **Playwright/Puppeteer is the only viable approach** for declaration filing automation.

**Strategy: Playwright with Persistent Browser Context**
- Use Playwright's `browserContext.storageState()` to save cookies, localStorage, and sessionStorage after initial login+2FA.
- On subsequent runs, restore the storage state to attempt session reuse.
- If the session has expired, prompt the user for a new SMS OTP.
- The persistent context effectively acts as a "device ID" — rs.ge recognizes the browser session.

**Declaration Form (Updated Dec 2024):**

| Column | Description |
|--------|-------------|
| 15 | Cumulative total turnover for the year (GEL) |
| 16 | Tax rate (auto-calculated: 1% if under 500K threshold) |
| 17 | Monthly income for the reporting period (auto-calculated) |
| 18 | Income via cash register |
| 19 | Income via POS terminal |
| 20 | Income received to bank account (transfers) |
| 21 | Other income (PayPal, Wise, crypto, etc.) |

**Key constraint:** Declaration must be filed by the **15th of each month** for the previous month.

### 1.2 Bank of Georgia (BOG) — Business Online API

**API Base URL:** `https://api.businessonline.ge/api`

**Authentication:** OAuth 2.0
- Register app at `bonline.bog.ge/admin/api`
- Receive `client_id` + `client_secret`
- Token endpoint: `POST //account.bog.ge/auth/realms/bog/protocol/openid-connect/token`
- Uses Basic Auth header (client_id:client_secret) + `grant_type=client_credentials`
- Returns Bearer token for subsequent API calls

**Relevant Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| Account Balance | Available + current balance per account (ISO 4217 currency) |
| Statement Generation | Generate statement for account + date range (max 1000 records) |
| Statement Summary | Global + daily balances for generated statement |
| Statement Paging | Paginate through statement entries (1000 per page) |

**Flow for Monthly Turnover:**
1. Authenticate with OAuth2 → get Bearer token
2. Call Account Balance to list accounts
3. Call Statement Generation for PE account, date range = 1st to last day of previous month
4. Sum all **credit entries** (incoming payments) = monthly turnover
5. Categorize by payment method where possible (POS, transfer, etc.) for columns 18-21

**Docs:**
- [BOG API Portal](https://api.bog.ge/docs/en/)
- [Business Online Introduction](https://api.bog.ge/docs/en/bonline/introduction)
- [Statement API](https://api.bog.ge/docs/en/bonline/statement/)
- [Account Balance](https://api.bog.ge/docs/en/bonline/accounts)

### 1.3 TBC Bank — Open Banking API (NextGenPSD2)

**API Base URL:** `https://api.tbcbank.ge` (production), `https://test-openbanking.tbcbank.ge/0.8/v1/` (sandbox)

**Framework:** NextGenPSD2 XS2A Framework v1.3.6

**Authentication:**
- Register as TPP (Third Party Provider) at `developers.tbcbank.ge`
- Obtain `apikey` for general access
- OAuth2 + consent-based access to customer accounts
- Digital certificate required (eIDAS or equivalent)

**Relevant Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `GET /accounts/{account-id}/transactions` | Read transaction list with balances |
| `GET /card-accounts/{account-id}/transactions` | Read card account transactions |
| Account balances | Available via account information service |

**Parameters:** `dateFrom`, `dateTo`, `bookingStatus`

**Consent Flow (PSD2):**
1. App requests consent from customer (redirect to TBC)
2. Customer authorizes access via SCA (Strong Customer Authentication)
3. App receives consent token
4. App can read account data within consent scope and validity period

**Docs:**
- [TBC Developer Portal](https://developers.tbcbank.ge)
- [Open Banking Overview](https://developers.tbcbank.ge/docs/open-banking-overview)
- [Open Banking Service](https://developers.tbcbank.ge/page/open-banking-service)
- [Read Account Transactions](https://developers.tbcbank.ge/reference/aisreadaccounttransactionlist)

### 1.4 Key Regulatory Context

- **1% tax** on turnover up to **500,000 GEL/year** (Small Business Status)
- **0% tax** for Micro Business up to **30,000 GEL/year**
- If annual cumulative exceeds 500K, excess taxed at **3%**
- Agritourism threshold: **700,000 GEL**
- Monthly declaration + payment deadline: **15th of each month**

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (PWA)                          │
│  Next.js 14+ App Router · React · TailwindCSS           │
│  Service Worker · Web Push · Installable (A2HS)         │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   API GATEWAY                            │
│            Next.js API Routes / tRPC                     │
│         Auth (NextAuth.js) · Rate Limiting               │
└────┬──────────┬──────────────┬──────────────────────────┘
     │          │              │
     ▼          ▼              ▼
┌─────────┐ ┌──────────┐ ┌──────────────────────────────┐
│ BOG API │ │ TBC API  │ │   rs.ge Automation Service    │
│ (REST)  │ │(PSD2 REST│ │   (Playwright on server)      │
│ OAuth2  │ │ OAuth2)  │ │   Persistent browser context  │
└─────────┘ └──────────┘ └──────────────────────────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │   rs.ge Web  │
                              │   Portal     │
                              └──────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 14+ (App Router), React 18, TypeScript | SSR/SSG, PWA-friendly, single codebase |
| **Styling** | Tailwind CSS + shadcn/ui | Mobile-first, fast iteration |
| **PWA** | next-pwa / Serwist | Service worker, offline support, install prompt |
| **Backend** | Next.js API Routes + tRPC | Type-safe API, co-located with frontend |
| **Database** | PostgreSQL (Supabase or Neon) | Relational, stores user profiles, declaration history |
| **ORM** | Drizzle ORM | Lightweight, type-safe, good DX |
| **Auth** | NextAuth.js v5 (Auth.js) | Multi-provider, session management |
| **Browser Automation** | Playwright (server-side) | Cross-browser, persistent context, better than Puppeteer |
| **Job Queue** | BullMQ + Redis | Scheduled declaration filing, retries |
| **Push Notifications** | Web Push API + web-push lib | Monthly reminders |
| **Hosting** | Vercel (frontend) + Railway/Fly.io (Playwright worker) | Vercel can't run Playwright; worker needs a VM |
| **Monitoring** | Sentry + Uptime Kuma | Error tracking, uptime monitoring |

### 2.3 Why Playwright Over Puppeteer

1. **Persistent browser context** — `storageState()` saves/restores cookies + localStorage, acting as a device fingerprint for rs.ge
2. **Auto-waiting** — Less flaky automation on rs.ge's potentially slow Georgian-government pages
3. **Multi-browser** — Can fall back to Firefox/WebKit if Chrome gets blocked
4. **Better API** — Locators, assertions, and network interception built-in

---

## 3. Data Model

```
┌──────────────────────┐
│        users          │
├──────────────────────┤
│ id           UUID PK  │
│ email        TEXT      │
│ phone        TEXT      │   ← Georgian phone for SMS OTP relay
│ tin          TEXT      │   ← Tax Identification Number
│ name_ka      TEXT      │   ← Name in Georgian
│ name_en      TEXT      │
│ business_type TEXT     │   ← 'micro' | 'small'
│ created_at   TIMESTAMP│
│ updated_at   TIMESTAMP│
└──────────┬───────────┘
           │ 1:N
           ▼
┌──────────────────────┐        ┌──────────────────────┐
│   bank_connections    │        │   rsge_sessions       │
├──────────────────────┤        ├──────────────────────┤
│ id         UUID PK    │        │ id          UUID PK   │
│ user_id    UUID FK    │        │ user_id     UUID FK   │
│ bank       ENUM       │        │ storage_state JSONB   │  ← Playwright context
│            (BOG|TBC)  │        │ rsge_username TEXT     │
│ access_token TEXT     │        │ rsge_pass_enc TEXT     │  ← Encrypted
│ refresh_token TEXT    │        │ last_login  TIMESTAMP  │
│ consent_id TEXT       │        │ is_valid    BOOLEAN    │
│ accounts   JSONB      │        │ updated_at  TIMESTAMP  │
│ expires_at TIMESTAMP  │        └──────────────────────┘
│ created_at TIMESTAMP  │
└──────────┬───────────┘
           │ 1:N
           ▼
┌──────────────────────┐
│    declarations       │
├──────────────────────┤
│ id           UUID PK  │
│ user_id      UUID FK  │
│ period_month INT      │   ← 1-12
│ period_year  INT      │
│ cumulative_turnover DECIMAL  │  ← Col 15
│ tax_rate     DECIMAL  │        ← Col 16 (usually 0.01)
│ monthly_income DECIMAL│        ← Col 17
│ income_cash  DECIMAL  │        ← Col 18
│ income_pos   DECIMAL  │        ← Col 19
│ income_bank  DECIMAL  │        ← Col 20
│ income_other DECIMAL  │        ← Col 21
│ tax_amount   DECIMAL  │
│ status       ENUM     │   ← draft|submitted|paid|failed
│ filed_at     TIMESTAMP│
│ paid_at      TIMESTAMP│
│ rsge_confirmation TEXT│   ← Reference number from rs.ge
│ created_at   TIMESTAMP│
└──────────────────────┘
```

---

## 4. Core User Flows

### 4.1 Onboarding Flow (One-time Setup)

```
[1] Welcome Screen
    "File your 1% tax in 2 taps"
         │
         ▼
[2] Sign Up / Login
    Email + Phone (Georgian number)
         │
         ▼
[3] Enter TIN & Business Details
    Auto-validate TIN via rs.ge SOAP API (get_name_from_tin)
         │
         ▼
[4] Connect rs.ge Account
    ├── Enter rs.ge username/password
    ├── Playwright opens headless session → triggers SMS OTP
    ├── User enters OTP in our app → relayed to Playwright
    ├── Playwright completes login → saves storageState
    └── Session persisted for future use
         │
         ▼
[5] Connect Bank(s)
    ├── BOG: OAuth2 redirect → bonline.bog.ge → consent → callback
    └── TBC: PSD2 redirect → TBC consent page → SCA → callback
         │
         ▼
[6] Select PE Account(s)
    Fetch account list from connected banks, user selects PE account(s)
         │
         ▼
[7] Done — Dashboard
```

### 4.2 Monthly Declaration Flow ("2 Taps")

```
[Push Notification: "Your January declaration is ready to review"]
         │
         ▼
[TAP 1] Open App → Dashboard
    ├── Auto-fetched: bank statements for previous month
    ├── Auto-calculated: turnover breakdown (cols 18-21)
    ├── Auto-filled: declaration preview
    │     Monthly income: 15,000 GEL
    │     Tax (1%): 150 GEL
    │     Cash: 3,000 | POS: 5,000 | Bank: 7,000 | Other: 0
    └── User reviews the pre-filled data
         │
         ▼
[TAP 2] "File & Pay" button
    ├── Playwright opens rs.ge with saved session
    │   ├── If session valid → navigates to declaration form
    │   ├── If session expired → prompts for SMS OTP (in-app)
    │   └── Fills form fields → submits declaration
    ├── Receives confirmation number from rs.ge
    ├── [Optional] Initiates payment via BOG/TBC payment API
    └── Shows success screen with confirmation
```

### 4.3 Session Management Strategy for rs.ge

```
                    ┌──────────────────┐
                    │  User taps       │
                    │  "File & Pay"    │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ Load saved       │
                    │ storageState     │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ Navigate to      │  ← Test if session is alive
                    │ rs.ge dashboard  │
                    └────────┬─────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
          ┌───────▼──────┐    ┌────────▼────────┐
          │ Session valid │    │ Redirected to   │
          │ (dashboard   │    │ login page      │
          │ loaded)      │    │ (session expired)│
          └───────┬──────┘    └────────┬────────┘
                  │                    │
                  │           ┌────────▼────────┐
                  │           │ Auto-fill user/  │
                  │           │ pass (encrypted) │
                  │           │ Submit login     │
                  │           └────────┬────────┘
                  │                    │
                  │           ┌────────▼────────┐
                  │           │ SMS OTP sent     │
                  │           │ Push notification│
                  │           │ to user: "Enter  │
                  │           │ OTP code"        │
                  │           └────────┬────────┘
                  │                    │
                  │           ┌────────▼────────┐
                  │           │ User enters OTP  │
                  │           │ in our app →     │
                  │           │ relayed to       │
                  │           │ Playwright       │
                  │           └────────┬────────┘
                  │                    │
                  │           ┌────────▼────────┐
                  │           │ Save new         │
                  │           │ storageState     │
                  │           └────────┬────────┘
                  │                    │
                  └────────┬───────────┘
                           │
                  ┌────────▼────────┐
                  │ Navigate to     │
                  │ declaration form│
                  │ Fill + Submit   │
                  └─────────────────┘
```

---

## 5. Module Breakdown

### Module 1: PWA Shell & Auth
- Next.js app with App Router
- Service worker registration (Serwist/next-pwa)
- Install prompt (A2HS) for mobile
- NextAuth.js: email/password + phone verification
- Responsive mobile-first layout (max-width: 430px primary target)

### Module 2: Onboarding
- Multi-step form wizard (React Hook Form + Zod validation)
- TIN validation via rs.ge SOAP (get_name_from_tin)
- rs.ge account linking (credentials stored encrypted, AES-256-GCM)
- Bank OAuth flows (BOG + TBC)
- Account selection UI

### Module 3: Bank Integration Service
- **BOG Adapter:**
  - OAuth2 token management (auto-refresh)
  - Account listing
  - Statement generation for date range
  - Transaction categorization (credit entries → income by type)
- **TBC Adapter:**
  - PSD2 consent management
  - Account information service (AIS)
  - Transaction listing with dateFrom/dateTo
  - Balance retrieval
- **Unified Interface:**
  - `getMonthlyTurnover(userId, month, year) → TurnoverBreakdown`
  - Aggregates across multiple bank connections
  - Returns: `{ total, cash, pos, bankTransfer, other }`

### Module 4: rs.ge Automation Service (Playwright)
- **Runs on a dedicated server** (not Vercel — needs browser binary)
- Playwright with Chromium, persistent browser contexts per user
- Encrypted credential storage (user's rs.ge login)
- Session state management (save/restore `storageState`)
- Declaration form automation:
  - Navigate to monthly declaration page
  - Fill columns 15, 18-21 (16, 17 are auto-calculated by rs.ge)
  - Handle Georgian-language form fields (field names mapped to constants)
  - Submit and capture confirmation number
- Error handling: screenshot on failure, retry logic
- SMS OTP relay: WebSocket channel between app and Playwright worker

### Module 5: Declaration Engine
- Fetches bank data → calculates turnover breakdown
- Applies tax rules (1% of monthly turnover, 3% on excess over 500K cumulative)
- Generates declaration draft
- Stores in DB with `draft` status
- After filing: updates to `submitted`, stores confirmation
- After payment: updates to `paid`

### Module 6: Notification & Scheduling
- **BullMQ scheduled jobs:**
  - 1st of month: fetch previous month bank statements, generate draft
  - 5th of month: push notification "Your declaration is ready to review"
  - 13th of month: warning if not yet filed ("2 days left!")
  - 15th of month: urgent reminder if still unfiled
- Web Push notifications via `web-push` library

### Module 7: Payment Integration (Phase 2)
- BOG payment initiation API or redirect to bank payment page
- TBC payment initiation via PSD2 PIS (Payment Initiation Service)
- Treasury payment details (Georgian Treasury account for tax payments)
- Payment status tracking

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|------------|
| rs.ge credentials at rest | AES-256-GCM encryption, key in env/vault, not in DB |
| Bank tokens | Encrypted at rest, short-lived access tokens, refresh flow |
| Playwright browser context | Stored encrypted per user, isolated contexts |
| SMS OTP relay | WebSocket with JWT auth, OTP never stored, forwarded in real-time |
| Data in transit | TLS 1.3 everywhere |
| Session hijacking | HTTP-only secure cookies, CSRF tokens |
| Rate limiting | Per-user rate limits on filing endpoints |
| Audit trail | Every declaration action logged with timestamp |

---

## 7. Infrastructure & Deployment

```
┌─────────────────────────────────┐
│          Vercel                  │
│  ┌───────────────────────────┐  │
│  │  Next.js App (Frontend +  │  │
│  │  API Routes)              │  │
│  └───────────────────────────┘  │
└────────────┬────────────────────┘
             │
     ┌───────┴────────┐
     │                │
     ▼                ▼
┌─────────┐    ┌────────────────────────┐
│ Supabase│    │   Fly.io / Railway     │
│ (Postgres│    │  ┌──────────────────┐  │
│  + Auth) │    │  │ Playwright Worker│  │
│         │    │  │ (Node.js + BullMQ│  │
│         │    │  │  + Chromium)     │  │
└─────────┘    │  └──────────────────┘  │
               │  ┌──────────────────┐  │
               │  │ Redis (BullMQ)   │  │
               │  └──────────────────┘  │
               └────────────────────────┘
```

**Why split Playwright to a separate server:**
- Vercel serverless functions have a 250MB bundle limit and 10s-60s execution timeout
- Playwright + Chromium binary = ~400MB
- Declaration filing can take 30-120 seconds
- Need persistent browser contexts stored on disk

---

## 8. Implementation Phases

### Phase 1: Foundation (MVP)
1. Next.js project scaffold with PWA support
2. Database schema + Drizzle ORM setup
3. Auth system (NextAuth.js)
4. Onboarding flow UI (mobile-first)
5. BOG OAuth2 integration + statement fetching
6. Basic Playwright rs.ge automation (login + session persistence)
7. Declaration form auto-fill + submission
8. Dashboard showing current month status

**Deliverable:** Working app where a BOG user can file declarations via rs.ge

### Phase 2: TBC + Polish
9. TBC Open Banking (PSD2) integration
10. Multi-bank aggregation
11. Push notifications + monthly scheduling (BullMQ)
12. Declaration history view
13. Error recovery + retry logic
14. Comprehensive logging + Sentry

**Deliverable:** Full multi-bank support with automated monthly reminders

### Phase 3: Payment + Scale
15. Payment initiation (BOG + TBC APIs or redirect)
16. Treasury payment tracking
17. Annual summary / analytics
18. Georgian language support (i18n)
19. Performance optimization + caching
20. Load testing + security audit

**Deliverable:** Complete "2-tap" flow including payment

### Phase 4: Growth
21. Accountant/advisor multi-user view
22. Micro business (0%) support
23. Additional bank integrations (Liberty, Credo, etc.)
24. Document storage (receipts, confirmations)
25. Revenue analytics + threshold warnings (approaching 500K)

---

## 9. Project Structure

```
georgian-tax-pwa/
├── apps/
│   ├── web/                          # Next.js PWA
│   │   ├── app/
│   │   │   ├── (auth)/               # Login, signup pages
│   │   │   ├── (onboarding)/         # Multi-step onboarding
│   │   │   ├── (dashboard)/          # Main dashboard
│   │   │   ├── api/
│   │   │   │   ├── trpc/[trpc]/      # tRPC handler
│   │   │   │   ├── auth/[...nextauth]/ # NextAuth
│   │   │   │   ├── webhooks/
│   │   │   │   │   ├── bog/          # BOG OAuth callback
│   │   │   │   │   └── tbc/          # TBC OAuth callback
│   │   │   │   └── cron/             # Vercel cron triggers
│   │   │   ├── layout.tsx
│   │   │   └── manifest.ts           # PWA manifest
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── onboarding/
│   │   │   ├── dashboard/
│   │   │   └── declaration/
│   │   ├── lib/
│   │   │   ├── trpc/                 # tRPC client + router
│   │   │   ├── auth/                 # NextAuth config
│   │   │   └── utils/
│   │   ├── public/
│   │   │   ├── sw.js                 # Service worker
│   │   │   └── icons/                # PWA icons
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── worker/                       # Playwright worker service
│       ├── src/
│       │   ├── rsge/
│       │   │   ├── automation.ts     # Core Playwright automation
│       │   │   ├── declaration.ts    # Declaration form filling
│       │   │   ├── session.ts        # Session/context management
│       │   │   └── fields.ts         # Georgian form field mappings
│       │   ├── queue/
│       │   │   ├── declaration.queue.ts
│       │   │   └── statement.queue.ts
│       │   ├── ws/                   # WebSocket server for OTP relay
│       │   └── index.ts
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── db/                           # Drizzle schema + migrations
│   │   ├── schema/
│   │   ├── migrations/
│   │   └── index.ts
│   ├── bank-adapters/                # BOG + TBC API clients
│   │   ├── bog/
│   │   │   ├── auth.ts
│   │   │   ├── accounts.ts
│   │   │   └── statements.ts
│   │   ├── tbc/
│   │   │   ├── auth.ts
│   │   │   ├── consent.ts
│   │   │   └── accounts.ts
│   │   └── types.ts                  # Unified bank interface
│   ├── tax-engine/                   # Declaration calculation logic
│   │   ├── calculator.ts
│   │   ├── rules.ts                  # 1%, 3% threshold logic
│   │   └── types.ts
│   └── shared/                       # Shared types, constants
│       ├── types.ts
│       └── constants.ts
│
├── turbo.json                        # Turborepo config
├── package.json
└── pnpm-workspace.yaml
```

---

## 10. Key Technical Decisions

### Decision 1: Playwright on Separate Server vs. Serverless
**Choice:** Dedicated server (Fly.io/Railway)
**Reason:** Playwright + Chromium is ~400MB, needs persistent disk for browser contexts, and declaration filing takes 30-120s (exceeds serverless timeouts).

### Decision 2: Monorepo with Turborepo
**Choice:** Monorepo (`apps/web` + `apps/worker` + `packages/*`)
**Reason:** Shared types between frontend, API, and worker. Single source of truth for tax calculation logic and bank adapter interfaces.

### Decision 3: tRPC over REST
**Choice:** tRPC
**Reason:** End-to-end type safety between Next.js frontend and API. No code generation needed. Excellent DX with React Query integration.

### Decision 4: BullMQ for Job Queue
**Choice:** BullMQ + Redis
**Reason:** Reliable job scheduling (cron), retry logic, rate limiting, and delayed jobs. Critical for monthly declaration automation and bank statement fetching.

### Decision 5: Supabase for Database
**Choice:** Supabase (PostgreSQL)
**Reason:** Managed Postgres with built-in auth helpers, real-time subscriptions (useful for OTP relay fallback), and edge functions. Free tier generous enough for MVP.

---

## 11. Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| rs.ge changes HTML structure | High | Medium | Playwright selectors abstracted to config; screenshot-based monitoring; alert on failure |
| rs.ge blocks automation | High | Low | Use realistic browser fingerprints; rate-limit to human-speed interactions; fallback to manual filing with pre-filled data |
| Bank API access denied | High | Medium | Apply early for BOG bonline + TBC TPP registration; have manual bank statement upload as fallback |
| SMS OTP delivery delay | Medium | Medium | Retry prompt; timeout + manual entry; consider partnership with Georgian telecom for SMS API |
| Session expiry unpredictable | Medium | High | Always attempt session reuse first; gracefully handle re-auth; queue retries |
| Data encryption key leak | Critical | Low | Use cloud KMS (e.g., AWS KMS / GCP KMS); rotate keys; minimal credential storage |
| Regulatory changes to declaration form | Medium | Medium | Abstract form field mappings; monitor rs.ge announcements; versioned form definitions |

---

## 12. API Registration Checklist

- [ ] **BOG:** Register at [bonline.bog.ge/admin/api](https://bonline.bog.ge/admin/api/) — need a BOG business account
- [ ] **TBC:** Register at [developers.tbcbank.ge](https://developers.tbcbank.ge) — apply for Open Banking TPP access
- [ ] **rs.ge:** Create service user via SOAP API (for TIN validation only; declaration filing uses Playwright)
- [ ] **Web Push:** Generate VAPID keys for push notifications
- [ ] **Domain:** Register Georgian-friendly domain (.ge TLD recommended)

---

## Sources

- [rs.ge Revenue Service Portal](https://www.rs.ge/Home-en)
- [rs.ge E-services](https://www.rs.ge/Eservices-en)
- [dimakura/rs.ge Ruby Client](https://github.com/dimakura/rs.ge)
- [RealJTG/rsge Python Client](https://github.com/RealJTG/rsge)
- [BOG API Documentation Portal](https://api.bog.ge/docs/en/)
- [BOG Business Online API](https://api.bog.ge/docs/en/bonline/introduction)
- [BOG Statement API](https://api.bog.ge/docs/en/bonline/statement/)
- [BOG Account Balance](https://api.bog.ge/docs/en/bonline/accounts)
- [BOG App Registration](https://bonline.bog.ge/admin/api/)
- [TBC Developer Portal](https://developers.tbcbank.ge)
- [TBC Open Banking Service](https://developers.tbcbank.ge/page/open-banking-service)
- [TBC Open Banking Overview](https://developers.tbcbank.ge/docs/open-banking-overview)
- [TBC GitHub](https://github.com/tbcbank)
- [Integrals.ge rs.ge Integration](https://www.integrals.ge/en/integrations/rs-ge-sistemebis-inteqracia)
- [JustAdvisors — 2025 Declaration Updates](https://en.justadvisors.ge/blog/finance/deklaration_pe_2025)
- [ExpatHub — 1% Tax Guide](https://expathub.ge/tax-freelancers-individuals-small-businesses-georgia/)
- [Andersen — 1% Tax Regime](https://ge.andersen.com/1-tax-regime/)
- [IBCCS — Tax Regime Guide](https://www.ibccs.ge/post/georgia-s-1-tax-regime-a-guide-to-individual-entrepreneur-and-small-business-status)
- [National Bank of Georgia — Open Banking](https://nbg.gov.ge/en/page/open-banking)
