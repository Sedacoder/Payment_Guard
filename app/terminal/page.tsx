export default function PaymentTerminalPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-gray-100">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-4 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-8 animate-pulse"></div>
        
        {/* Skeletal QR / Payment Input Box */}
        <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center mb-6 border-2 border-dashed border-gray-300">
          <p className="text-gray-400 text-sm font-medium">Point-of-Sale QR Interface Loading...</p>
        </div>

        <div className="h-12 bg-gray-200 rounded w-full animate-pulse"></div>
      </div>
    </main>
  );
}