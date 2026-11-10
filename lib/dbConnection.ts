import { createClient } from '@supabase/supabase-js';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey,{
    auth: {
        persistSession: false
    },
    global:{
        headers: { 'x-application-name': 'payment-guard-firewall'}
    }
});



export async function dbLookupMerchant(name: string){
    const { data, error } = await supabase
        .from('verified_merchants')
        .select('id, merchant_name, target_email, email_domain, historical_median_amount')
        .ilike('merchant_name' , name)
        .maybeSingle();

    if (error) throw new Error (`Supabase query exception: ${error.message}`);
    return data;

}

export async function dbGetMerchantRegistryStubs(){
    const { data, error } = await supabase
        .from ('verified_merchants')
        .select('merchant_name, target_email, email_domain');

    if (error) throw new Error(`Supabase registry serialization error: ${error.message}`);
    return data || [];
}