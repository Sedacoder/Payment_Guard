import { NextResponse } from 'next/server';

/**
 * Internal helper to query PayPal's OAuth server for a temporary secure access token
 */
async function generatePayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing client_id or client_secret variables in .env.local');
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://paypal.com', {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${authString}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const data = await response.json();
  return data.access_token;
}

/**
 * PAYPAL ORDERS INTERFACE
 * Generates an active session invoice token directly inside the PayPal Sandbox system.
 */
export async function POST(request: Request) {
  try {
    const { amount } = await request.json();

    // 1. Generate active bearer authentication token
    const accessToken = await generatePayPalAccessToken();

    // 2. Dispatch standardized purchase properties to the PayPal sandbox platform
    const response = await fetch('https://paypal.com', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: amount.toString(),
            },
          },
        ],
      }),
    });

    const orderData = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: 'PayPal engine rejected checkout compilation' }, { status: response.status });
    }

    return NextResponse.json({ id: orderData.id, status: orderData.status }, { status: 200 });

  } catch (error: any) {
    console.error(`[PayPal Rail Panic] ${error.message}`);
    return NextResponse.json({ error: 'Internal payment rail failure' }, { status: 500 });
  }
}
