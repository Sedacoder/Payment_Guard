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
  it("still ALLOWs a verified merchant with a normal email", async () => {
    expect((await decide("Naivas Supermarket", "pay@naivas.co.ke")).verdict).toBe("ALLOW");
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
