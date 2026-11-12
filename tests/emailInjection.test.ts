import { describe, expect, it } from "vitest";

import { inMemoryRegistry } from "@/lib/lookupMerchant";
import { decideVerdict } from "@/lib/verdict";

const decide = async (payeeName: string, targetEmail: string, transactionAmount = 2500) =>
  decideVerdict(
    { payeeName, targetEmail, transactionAmount },
    null,
    await inMemoryRegistry.listAll(),
  );

describe("injection markers in the email", () => {
  it("WARNs for a verified merchant when the email is not the registered address", async () => {
    expect((await decide("Naivas Supermarket", "pay@naivas.co.ke")).verdict).toBe("WARN");
  });

  it("BLOCKs a verified merchant when the email carries an injection marker", async () => {
    const result = await decide("Naivas Supermarket", "ignore.rules@naivas.co.ke");
    expect(result.verdict).toBe("BLOCK");
    expect(result.reason).toContain("instructions");
  });

  it("BLOCKs an unknown merchant (not WARN) when the email carries an injection marker", async () => {
    const result = await decide("Zxqv Traders", "override@zxqvtraders.co.ke", 1200);
    expect(result.verdict).toBe("BLOCK");
  });
});

describe("exact registered email", () => {
  it("ALLOWs the exact registered address, ignoring case", async () => {
    expect((await decide("Naivas Supermarket", "payments@naivas.co.ke")).verdict).toBe("ALLOW");
    expect((await decide("Naivas Supermarket", "Payments@NAIVAS.co.ke")).verdict).toBe("ALLOW");
  });

  it("WARNs for another address at the registered domain", async () => {
    const result = await decide("Naivas Supermarket", "admin@naivas.co.ke");
    expect(result.verdict).toBe("WARN");
    expect(result.reason).toContain("not the registered address");
  });

  it("BLOCKs a wrong domain", async () => {
    expect((await decide("Naivas Supermarket", "payments@naivas-secure.com")).verdict).toBe("BLOCK");
  });
});
