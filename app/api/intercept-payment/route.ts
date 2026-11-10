import { NextResponse } from 'next/server';
import { checkDeterministic } from '@/lib/verdict';
import { supabase } from '@/lib/dbConnection';


export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { payeeName, targetEmail, transactionAmount } = payload;
    const paypalOrderId = payload.paypalOrderId || `TRX_${Date.now()}`;

    // 1. Run Leon's unified verification engine
    const assessment = await checkDeterministic({ payeeName, targetEmail, transactionAmount });

    // 2. Log threat telemetry to Supabase matching Tallam's columns
    await supabase
      .from('security_audits')
      .insert([{
        id: paypalOrderId,
        payee_name: payeeName,
        target_email: targetEmail,
        transaction_amount: transactionAmount,
        currency: 'USD',
        verdict: assessment.verdict,
        reason: assessment.reason,
        suggestion: assessment.suggestion || null,
        risk_score: assessment.similarity || 0,
        execution_time_ms: 12, // Local computational latency log
        ai_used: false,
        rule_flags: assessment.verdict !== 'ALLOW' ? ['BRAND_SPOOF_CHECK'] : []
      }]);

    if (assessment.verdict === 'BLOCK') {
      return NextResponse.json({
        success: false,
        action: 'BLOCK',
        reason: assessment.reason,
        suggestion: assessment.suggestion
      }, { status: 403 });
    }

    return NextResponse.json({ success: true, action: assessment.verdict });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Internal Firewall Fault' }, { status: 500 });
  }
}
