# Payment Guard

Payment Guard is an in-flight runtime transaction firewall designed to hook directly into network transaction streams. It evaluates transaction risk using localized database tool parameters and enforces zero-trust access control checks before digital assets leave user custody.

Rather than relying on asynchronous chat interfaces or post-facto fraud alerts, Payment Guard embeds a Large Language Model (LLM) directly into production infrastructure pipelines as an inline risk sentinel utilizing Model Context Protocol (MCP) toolchains.

---

## Problem Statement

Modern payment systems face increasingly sophisticated social engineering and visual manipulation attack vectors at point-of-sale (POS) terminals and web checkout interfaces, including:

1. **Typo-Squatting and Look-Alike Brands:** Subtle alterations in payee names or business handles designed to trick users into transferring funds to malicious accounts (e.g., fraudulent impersonation of established merchants).
2. **Cloned Terminal QR Links:** Overlaid or swapped physical QR codes at point-of-sale systems routing transactions to unverified endpoints.
3. **Terminal Credential Snooping:** Interception of cleartext or weakly obfuscated payment requests in public or semi-trusted networks.

Standard payment processing rails execute transfers strictly based on matching database parameters without evaluating the contextual validity or risk of the recipient payload in real time.

---

## Technical Solution & Architecture

Payment Guard introduces an autonomous security layer positioned between order initiation and payment capture.

```
[ User / Terminal ] ──( 1. Create Order Request )──> [ Next.js API Router ]
                                                             │
                                                   ( 2. Intercept Payload )
                                                             ▼
[ Target Payment Rail ] <──( 4. Execute / Block )─── [ Inline Security Sentinel ]
  (e.g., PayPal Engine)                                (LLM + MCP Toolchain)
                                                             │
                                                   ( 3. Database Context )
                                                             ▼
                                                    [ Supabase DB Registry ]
```

### 1. In-Flight Interception Engine
Transactions are intercepted at the server API layer (`/api/create-order` and `/api/capture-order`). The application halts standard payment capture routines while passing incoming payload metadata to the security agent.

### 2. Zero-Trust Autonomous Risk Classification
The AI agent operates as an immutable risk sentinel. Using strict tool calling (via MCP), the engine checks payee credentials, domain signatures, and transaction metadata against verified relational records.

The sentinel enforces strict payload output contracts, returning one of three explicit system verdicts:
- `ALLOW`: Payload passes all contextual risk metrics. The server proceeds with payment capture.
- `WARN`: Elevated risk detected. UI displays a high-visibility modal warning before user authorization.
- `BLOCK`: Critical threat signature confirmed (e.g., look-alike brand match). Transaction route is terminated with an HTTP 403 response.

### 3. Strict Prompt Injection Hardening
To prevent attackers from using malicious payload text (e.g., crafted merchant names containing instruction overrides) to alter LLM decisions, the sentinel:
- Is isolated from transaction authority (it cannot directly move funds or alter routes).
- Functions strictly as a advisory payload classifier restricted to schema-enforced tool calls.
- Enforces absolute input type validation prior to evaluation.

### 4. Real-Time Security Telemetry
The administrative engine incorporates an enterprise telemetry dashboard powered by AG Grid. The console monitors live transaction channels, dynamic risk statuses, and blocked social-engineering attempt streams in real time.

---

## Core System Components

- **Next.js API Infrastructure:** Handles server-side transaction routes, HMAC payload verification, and standard rail bindings.
- **Supabase Backend:** Stores verified commercial identity registries, historical risk vectors, and immutable audit logs.
- **Model Context Protocol (MCP) Agent Layer:** Executes structural zero-ops runtime checks against payment payloads.
- **AG Grid Telemetry Engine:** Provides high-throughput monitoring and dynamic threat visualization for merchant operations.

---

## What runs today

The demo is **mock-first**: it runs end to end with no Supabase, PayPal or Anthropic credentials. Real integrations sit behind adapter seams so they can be switched on later without changing the UI or the guard contract.

| Layer | Implemented now | Production seam |
| --- | --- | --- |
| Guard rules | Deterministic engine in `lib/verdict.ts` + `lib/nameSimilarity.ts` | — |
| AI advisory | Optional Claude tool-calling pass in `lib/agent.ts` | Enabled by `ANTHROPIC_API_KEY` |
| Payment rail | In-memory mock rail in `lib/payment-rail.ts` | `PAYMENT_RAIL=paypal` → `lib/paypal-rail.ts` |
| Telemetry | In-memory sink + Server-Sent Events | Swap for Supabase Realtime |
| Dashboard | AG Grid console at `/dashboard` | — |
| Terminal | Guarded checkout at `/terminal` | — |

### Pages

- `/` — landing page and architecture summary.
- `/terminal` — customer checkout: submit payee, email and amount; renders BLOCK, WARN (with confirmation), or ALLOW with a QR hand-off and simulated capture.
- `/dashboard` — admin SOC console: live AG Grid telemetry, verdict filters, search, risk scores, rule flags and guard latency.

### API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/intercept-payment` | POST | Evaluate a payment and return a verdict without creating an order. |
| `/api/create-order` | POST | Evaluate, then create a payment order. BLOCK → `403`; WARN → `requiresConfirmation` until `confirmed: true`. |
| `/api/capture-order` | POST | Capture a created order (mock rail by default). |
| `/api/merchants` | GET | Verified merchant registry. |
| `/api/telemetry` | GET | Current telemetry snapshot. |
| `/api/telemetry/stream` | GET | SSE snapshot + live events. |

`POST` bodies use `{ "payeeName": string, "targetEmail": string, "transactionAmount": number }`. `create-order` additionally accepts `currency` (ISO 4217) and `confirmed` (boolean).

### Verdict policy

- **BLOCK** — payee is not in the verified registry. If the name is more than 80% similar to a verified merchant, the response includes a `Did you mean …?` suggestion.
- **WARN** — verified merchant, but the amount is more than 5x its typical amount. Requires explicit confirmation.
- **ALLOW** — verified merchant with matching email and a normal amount.

The deterministic engine is the floor. The optional AI advisory can only escalate a verdict (`combineVerdicts`), never downgrade it. Prompt-injection tails in a payee name are stripped before similarity comparison, so injected text cannot hide a look-alike brand.

---

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Everything works with zero configuration.

### Scripts

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest (rule engine, injection handling, agent escalation)
```

### Environment variables

All variables are optional for the mock demo. See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAYMENT_RAIL` | `mock` | Set to `paypal` to use the PayPal Sandbox adapter. |
| `ANTHROPIC_API_KEY` | unset | Enables the AI advisory pass. Without it, the rule engine runs alone. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Model used for advisory checks. |
| `PAYMENT_GUARD_AI` | unset | Set to `off` to force rules-only mode. |
| `PAYPAL_CLIENT_ID` | unset | Required for `PAYMENT_RAIL=paypal`. |
| `PAYPAL_CLIENT_SECRET` | unset | Required for `PAYMENT_RAIL=paypal`. |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` | PayPal API host. |
| `PAYPAL_CURRENCY` | `USD` | Currency used when the PayPal rail is active (PayPal does not settle KES). |
| `NEXT_PUBLIC_SUPABASE_URL` | unset | Reserved for the future Supabase telemetry adapter. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | unset | Reserved for the future Supabase telemetry adapter. |

---

## Demo script

1. Open `/terminal` and choose **Cloned terminal** (`Naivaz` + a prompt-injection tail) → **BLOCK**, similarity `0.833`, “Did you mean Naivas Supermarket?”.
2. Choose **Legitimate merchant** → **ALLOW**, order created, QR shown. Click **Simulate customer approval & capture** → `COMPLETED`.
3. Choose **Amount spike** (`20,000` vs `2,500` typical) → **WARN**, then **Confirm and continue** → order and capture.
4. Open `/dashboard` in a second tab. Each terminal action appears live over SSE; filter by verdict, search by payee, email or rule flag.
5. Inspect the seeded feed: the eight shipped mock exploits plus the demo WARN case.

---

## Project structure

```
app/
  page.tsx                     landing page
  terminal/page.tsx            customer terminal
  dashboard/page.tsx           admin console shell
  api/                         intercept, orders, merchants, telemetry, SSE
components/
  SecurityDashboard.tsx        AG Grid console with live SSE ingestion
lib/
  types.ts                     shared GuardInput / GuardResult contract
  verdict.ts                   deterministic verdict rules
  nameSimilarity.ts            normalization + Levenshtein similarity
  lookupMerchant.ts            verified merchant registry
  validation.ts                strict request validation
  agent.ts                     optional AI advisory + stricter-verdict combining
  intercept.ts                 shared guarded evaluation + telemetry
  telemetry.ts                 in-memory sink and record shaping
  telemetry-seed.ts            seeded demo feed
  payment-rail.ts              mock rail + rail selection
  paypal-rail.ts               PayPal Sandbox adapter
tests/                         Vitest suites
```

---

## Notes and limitations

- Telemetry is per-process and in-memory: it resets when the server restarts and is not shared across serverless instances. The `TelemetryRecord` shape already matches the planned Supabase table.
- The mock rail stores orders in memory. The PayPal adapter is wired but untested without sandbox credentials.
- The AI advisory is advisory only: it holds no payment keys and cannot move funds or write to the database.
- Sandbox money only — no real funds move.
