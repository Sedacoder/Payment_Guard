import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

export async function lookupMerchant(payeeName: string, targetEmail: string) {
  const { data, error } = await supabase
    .from('verified_merchants')
    .select('id, merchant_name, target_email, historical_median_amount')
    .ilike('merchant_name', payeeName)
    .ilike('target_email', targetEmail)
    .maybeSingle();

  if (error) throw new Error(`Database read error: ${error.message}`);
  if (!data) return null;

  // Map Supabase snake_case data straight to Leon's Merchant shape
  return {
    id: data.id,
    name: data.merchant_name,
    email: data.target_email,
    typicalAmount: Number(data.historical_median_amount)
  };
}

export async function listVerifiedMerchants() {
  const { data, error } = await supabase
    .from('verified_merchants')
    .select('id, merchant_name, target_email, historical_median_amount');

  if (error) throw new Error(`Database registry extraction failed: ${error.message}`);
  if (!data) return [];

  return data.map(m => ({
    id: m.id,
    name: m.merchant_name,
    email: m.target_email,
    typicalAmount: Number(m.historical_median_amount)
  }));
}
