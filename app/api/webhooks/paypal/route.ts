import { NextResponse } from 'next/server';
import { supabase } from '@/lib/dbConnection';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    console.log(`[Webhook Event Received] Tracking Type: ${payload.event_type}`);

    const eventType = payload.event_type;
    const resource = payload.resource;
    
    const paypalOrderId = resource.id || (resource.purchase_units?.[0]?.payments?.captures?.[0]?.id);

    if (!paypalOrderId) {
      return NextResponse.json({ error: 'Missing core tracking ID reference' }, { status: 400 });
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
      const { error } = await supabase
        .from('security_audits')
        .update({ 
          verdict: 'ALLOW', 
          reason: 'PayPal Webhook Loopback Confirmation: Asset capture successfully verified.' 
        })
        .eq('transaction_id', paypalOrderId);

      if (error) {
        console.error(`[Supabase Engine Error] Audit table sync failed: ${error.message}`);
        return NextResponse.json({ error: 'Database record modification failure' }, { status: 500 });
      }

      console.log(`[Telemetry Sync] Transaction log row updated to PAID for ID: ${paypalOrderId}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error(`[Webhook Intercept Exception] ${error.message}`);
    return NextResponse.json({ error: 'Internal system processing failure' }, { status: 500 });
  }
}
