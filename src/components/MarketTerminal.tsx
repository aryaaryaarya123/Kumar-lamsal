import { useState, FormEvent } from 'react';
import { Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

export function MarketTerminal() {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;

    setLoading(true);
    setError('');
    setData(null);

    try {
      const response = await fetch(`/api/stock/${symbol.trim().toUpperCase()}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Data currently unavailable from NEPSE.');
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Data currently unavailable from NEPSE.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8 mt-8">
      <h2 className="text-xl font-bold text-slate-900 mb-4">NEPSE Market Terminal</h2>
      
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-slate-900 focus:border-slate-900 text-sm"
            placeholder="Search Scrip (e.g., NABIL, NICA)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !symbol}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Search
        </button>
      </form>

      {error && (
        <div className="text-red-600 bg-red-50 p-4 rounded-lg text-sm border border-red-100 font-medium">
          ⚠️ {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-slate-50 rounded-lg border border-slate-100">
          <div className="col-span-2 md:col-span-4 flex items-center justify-between border-b border-slate-200 pb-4 mb-2">
            <div>
              <p className="text-sm font-medium text-slate-500">Symbol</p>
              <h3 className="text-2xl font-bold text-slate-900">{data.symbol}</h3>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-500">LTP</p>
              <div className="flex items-center justify-end gap-2">
                <span className="text-3xl font-bold text-slate-900">
                  {data.ltp?.toLocaleString('en-NP', { style: 'currency', currency: 'NPR' }) || 'N/A'}
                </span>
                {data.pointChange !== undefined && data.pointChange !== null && !isNaN(data.pointChange) && (
                  <span className={`flex items-center text-sm font-semibold px-2 py-1 rounded-full ${data.pointChange >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {data.pointChange >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                    {Math.abs(data.pointChange).toFixed(2)} ({data.percentChange?.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Open</p>
            <p className="text-lg font-semibold text-slate-900">{data.open ? data.open.toLocaleString() : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">High</p>
            <p className="text-lg font-semibold text-slate-900">{data.high ? data.high.toLocaleString() : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Low</p>
            <p className="text-lg font-semibold text-slate-900">{data.low ? data.low.toLocaleString() : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total Volume</p>
            <p className="text-lg font-semibold text-slate-900">{data.volume ? data.volume.toLocaleString() : '-'}</p>
          </div>
        </div>
      )}
    </div>
  );
}