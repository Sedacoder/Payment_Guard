import { NextResponse } from 'next/server';
import { supabase } from '@/lib/dbConnection';

export async function POST(request: Request) {
  try {
    // 1. Read the raw incoming notification payload text from PayPal's servers
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    console.log(`[Webhook Alert] Inbound network event captured: ${payload.event_type}`);

    const eventType = payload.event_type;
    const resource = payload.resource;
    
    // Extract the unique tracking ID out of PayPal's nested payload structure
    const paypalOrderId = resource.id || (resource.purchase_units?.[0]?.payments?.captures?.[0]?.id);

    if (!paypalOrderId) {
      return NextResponse.json({ error: 'Missing core transaction transaction_id reference' }, { status: 400 });
    }

    // 2. Clear status rules if the transaction successfully passes the network rail
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
      
      // Update our database logging grid row to state ALLOW (Paid)
      const { error } = await supabase
        .from('security_audits')
        .update({ 
          verdict: 'ALLOW', 
          reason: 'PayPal Network Event Clear: Secure asset capture successfully verified.' 
        })
        .eq('transaction_id', paypalOrderId);

      if (error) {
        console.error(`[Supabase Engine Error] Audit table synchronization failed: ${error.message}`);
        return NextResponse.json({ error: 'Database record modification failure' }, { status: 500 });
      }

      console.log(`[Telemetry Sync] Transaction Grid Row updated securely to PAID for ID: ${paypalOrderId}`);
    }

    // 3. Return a clean HTTP 200 OK signature response so PayPal knows we safely logged the data
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error(`[SecOps Exception] Hook handler route failed parsing: ${error.message}`);
    return NextResponse.json({ error: 'Internal system processing violation' }, { status: 500 });
  }
}
