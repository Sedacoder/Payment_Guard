'use client';
import { useState } from 'react';
import QRCode from 'qrcode';

export default function CheckoutPage() {
  const [payeeName, setPayeeName] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  
  // Modal & Verdict States within Person B1 scope
  const [verdictState, setVerdictState] = useState<string | null>(null);
  const [reasonMessage, setReasonMessage] = useState('');
  const [suggestionText, setSuggestionText] = useState('');
  const [warnConfirmed, setWarnConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('Running Payment Guard AI Interception...');
    setVerdictState(null);
    setWarnConfirmed(false);

    const paymentUri = `payguard://pay?merchant=${encodeURIComponent(payeeName)}&email=${encodeURIComponent(targetEmail)}&amount=${transactionAmount}`;
    
    try {
      const generatedQr = await QRCode.toDataURL(paymentUri);
      setQrCodeUrl(generatedQr);

      const res = await fetch('/api/intercept-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeeName,
          targetEmail,
          transactionAmount: parseFloat(transactionAmount),
        }),
      });

      if (res.status === 403) {
        const data = await res.json();
        setVerdictState('BLOCK');
        setReasonMessage(data.reason || 'Unverified payee or look-alike collision detected.');
        setSuggestionText(data.suggestion || 'Did you mean Naivas Supermarket?');
        setStatusMessage('Payment Halted by Security Guard.');
        return;
      }

      const data = await res.json();
      setVerdictState(data.verdict || 'ALLOW');
      setReasonMessage(data.reason || 'Merchant verified successfully.');
      setSuggestionText(data.suggestion || '');
      setStatusMessage('Processed successfully.');
    } catch (err) {
      // Fallback simulation for local frontend UI testing before backend integration
      if (payeeName.toLowerCase().includes('naivaz')) {
        setVerdictState('BLOCK');
        setReasonMessage('Look-alike name collision detected above similarity threshold.');
        setSuggestionText('Did you mean Naivas Supermarket?');
      } else if (parseFloat(transactionAmount) > 1000) {
        setVerdictState('WARN');
        setReasonMessage('Transaction value exceeds normal parameters.');
      } else {
        setVerdictState('ALLOW');
        setReasonMessage('Merchant signature verified.');
      }
      setStatusMessage('Local client-side safeguard simulation active.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 relative">
      <div className="max-w-md w-full bg-slate-800 p-8 rounded-xl shadow-lg border border-slate-700">
        <h1 className="text-2xl font-bold mb-2 text-emerald-400">Payment Guard Checkout</h1>
        <p className="text-sm text-slate-400 mb-6">Secure Your Transaction via PayPal Sandbox</p>

        <form onSubmit={handleCheckout} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Payee / Merchant Name</label>
            <input 
              type="text" 
              value={payeeName} 
              onChange={(e) => setPayeeName(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Naivas Supermarket"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Target Email</label>
            <input 
              type="email" 
              value={targetEmail} 
              onChange={(e) => setTargetEmail(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-emerald-500"
              placeholder="merchant@paypal.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Amount (USD)</label>
            <input 
              type="number" 
              value={transactionAmount} 
              onChange={(e) => setTransactionAmount(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-emerald-500"
              placeholder="50.00"
            />
          </div>

          <button 
            type="submit" 
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded transition"
          >
            Pay Securely & Generate QR
          </button>
        </form>

        {statusMessage && (
          <div className="mt-4 p-3 bg-slate-900 border border-slate-700 rounded text-xs text-center text-slate-400">
            {statusMessage}
          </div>
        )}
      </div>

      {/* --- INTERCEPT MODALS OVERLAY (Person B1 Scope) --- */}

      {/* BLOCK INTERCEPT MODAL */}
      {verdictState === 'BLOCK' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-red-950 border border-red-700 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
            <div className="text-red-400 text-4xl mb-2">⛔</div>
            <h2 className="text-xl font-bold text-red-200">PAYMENT BLOCKED</h2>
            <p className="text-xs text-red-300 mt-2">{reasonMessage}</p>
            
            {suggestionText && (
              <div className="mt-4 p-3 bg-red-900/60 border border-red-600 rounded text-sm font-medium text-white">
                💡 {suggestionText}
              </div>
            )}

            <button 
              onClick={() => setVerdictState(null)}
              className="mt-6 w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-2 rounded text-sm transition"
            >
              Dismiss & Edit Details
            </button>
          </div>
        </div>
      )}

      {/* WARN OVERLAY MODAL (Requires Double Confirmation) */}
      {verdictState === 'WARN' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-amber-950 border border-amber-700 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
            <div className="text-amber-400 text-4xl mb-2">⚠️</div>
            <h2 className="text-xl font-bold text-amber-200">SECURITY WARNING</h2>
            <p className="text-xs text-amber-300 mt-2">{reasonMessage}</p>
            <p className="text-xs text-amber-400 mt-2 font-semibold">This transaction requires double confirmation to proceed.</p>

            <div className="mt-4 text-left space-y-2">
              <label className="flex items-center space-x-2 text-xs text-amber-200 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={warnConfirmed}
                  onChange={(e) => setWarnConfirmed(e.target.checked)}
                  className="rounded bg-slate-900 border-amber-700 text-amber-600 focus:ring-0"
                />
                <span>I confirm I know this merchant and accept the risk.</span>
              </label>
            </div>

            <div className="mt-6 flex space-x-2">
              <button 
                onClick={() => setVerdictState(null)}
                className="w-1/2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 rounded text-xs transition"
              >
                Cancel
              </button>
              <button 
                disabled={!warnConfirmed}
                onClick={() => {
                  alert("Warning bypassed with double confirmation. Proceeding.");
                  setVerdictState(null);
                }}
                className={`w-1/2 py-2 rounded text-xs font-semibold transition ${
                  warnConfirmed ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOW SUCCESS / QR MODAL */}
      {verdictState === 'ALLOW' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-emerald-600 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
            <div className="text-emerald-400 text-4xl mb-2">✅</div>
            <h2 className="text-xl font-bold text-emerald-300">MERCHANT VERIFIED</h2>
            <p className="text-xs text-slate-300 mt-1">{reasonMessage}</p>

            {qrCodeUrl && (
              <div className="mt-4 flex flex-col items-center bg-slate-900 p-3 rounded border border-slate-700">
                <p className="text-xs text-slate-300 mb-2 font-semibold">Scan to Authorize Payment</p>
                <img src={qrCodeUrl} alt="Payment QR Code" className="w-28 h-28 bg-white p-1 rounded" />
              </div>
            )}

            <button 
              onClick={() => setVerdictState(null)}
              className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded text-sm transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}