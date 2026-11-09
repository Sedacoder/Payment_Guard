import { connection } from "next/server";

import { listVerifiedMerchants } from "@/lib/lookupMerchant";

export async function GET() {
  await connection();
  const merchants = await listVerifiedMerchants();
  return Response.json({ merchants });
}
