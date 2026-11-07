export default function MerchantDashboardPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="h-8 bg-gray-800 rounded w-64 animate-pulse"></div>
          <div className="h-10 bg-gray-800 rounded w-32 animate-pulse"></div>
        </div>

        {/* Skeletal Data Table View */}
        <div className="w-full h-96 bg-gray-800 rounded-xl flex items-center justify-center border border-gray-700 animate-pulse">
          <p className="text-gray-400 text-sm font-medium">Enterprise Monitoring Table Grid Initializing...</p>
        </div>
      </div>
    </main>
  );
}