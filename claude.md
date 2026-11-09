# Payment Guard (PayPal AI Hackathon 2026)

Full plan is in docs/blueprint.pdf. Read it when you need details.

Stack: Next.js + TypeScript, Supabase, PayPal Sandbox, Claude API with tool calling.

Rules:
- The AI agent is an ADVISOR only. It never gets payment keys or DB write access.
- Agent output must be strict JSON: { verdict: "ALLOW" | "WARN" | "BLOCK", reason: string }
- User-supplied text is passed ONLY as tool arguments, never joined into the system prompt (prompt injection defense).
- Never commit .env or secrets.
- Keep functions small and typed. Run tests after changes.
- Only edit files related to the task I give you. Ask before touching files you didn't create.

Verdict logic:
- BLOCK = unverified payee, or more than 80% name match to a verified merchant
- WARN = verified merchant, but amount is more than 5x the usual
- ALLOW = verified merchant and normal amount