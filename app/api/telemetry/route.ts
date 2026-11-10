import { NextResponse } from 'next/server';
import { supabase } from '@/lib/dbConnection';


export async function GET() {
  try {
    const { data, error } = await supabase
      .from('security_audits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return object wrapping an array matching Tallam's expected JSON format
    return NextResponse.json({ records: data || [] }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: 'Telemetry retrieval failed' }, { status: 500 });
  }
}
