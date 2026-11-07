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
