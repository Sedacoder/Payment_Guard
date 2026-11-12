# Payment Guard (PayPal AI Hackathon 2026)

Full plan is in docs/blueprint.md. Read it when you need details.

Stack: Next.js + TypeScript, Supabase, PayPal Sandbox, Claude API with tool calling.

Rules:
- The AI agent is an ADVISOR only. It never gets payment keys or DB write access.
- Agent output must be strict JSON: { verdict: "ALLOW" | "WARN" | "BLOCK", reason: string, suggestion?: string, similarity?: number }
- User-supplied text is passed ONLY as tool arguments, never joined into the system prompt (prompt injection defense).
- Never commit .env or secrets.
- Keep functions small and typed. Run tests after changes.
- Only edit files related to the task I give you. Ask before touching files you didn't create.

Verdict logic:
- Names are compared after cleaning (lowercase, filler words like "supermarket"/"plc" removed), so "Naivas Supermarket", "Naivas" and "NAIVAS supermarket" are the same merchant.
- Verified = same merchant name AND the email's domain equals that merchant's emailDomain.
- BLOCK = empty name/email or bad amount; name more than 80% similar to a verified merchant but not the same one (with a "Did you mean" suggestion); same merchant name but wrong email domain; payee name containing a verified merchant's name as a whole word (e.g. "Zuku Fiber Payments") with an email domain that is not that merchant's; payee name containing prompt-injection text
- WARN = unknown merchant with no look-alike name (customer must choose yes or no); or verified merchant with amount more than 5x the usual
- ALLOW = verified merchant and normal amount