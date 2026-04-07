import { useState, FormEvent } from 'react';
import { Search, TrendingUp, TrendingDown, Loader2, Activity, ArrowUpRight, ArrowDownRight, BarChart3, Maximize2, Minimize2, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-12 mt-4">
      {/* Header Decor */}
      <div className="h-2 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900" />
      
      <div className="p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-slate-100 rounded-lg">
                <Activity className="w-5 h-5 text-slate-700" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">NEPSE Market Terminal</h2>
            </div>
            <p className="text-sm text-slate-500 font-medium">Real-time individual stock lookup & analysis</p>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 text-sm transition-all placeholder:text-slate-400 font-medium"
                placeholder="Search Scrip (e.g., NABIL, NICA)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !symbol}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </button>
          </form>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-rose-600 bg-rose-50 p-4 rounded-xl text-sm border border-rose-100 font-semibold flex items-center gap-3"
            >
              <div className="p-1.5 bg-rose-100 rounded-lg">
                <Database className="w-4 h-4 text-rose-600" />
              </div>
              {error}
            </motion.div>
          )}

          {data && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className="space-y-6"
            >
              {/* Main Price Card */}
              <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-slate-200 relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2.5 py-1 bg-white/10 rounded-md text-xs font-bold tracking-widest uppercase text-slate-300 border border-white/10">EQUITY</span>
                      <h3 className="text-3xl sm:text-4xl font-black tracking-tight">{data.symbol}</h3>
                    </div>
                    <p className="text-slate-400 font-medium text-sm sm:text-base">Nepal Stock Exchange Live Data</p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Last Traded Price</p>
                    <div className="flex items-baseline sm:justify-end gap-3">
                      <span className="text-4xl sm:text-5xl font-black">
                        {data.ltp?.toLocaleString('en-NP')}
                      </span>
                      <span className="text-lg font-bold text-slate-400">NPR</span>
                    </div>
                    
                    {data.pointChange !== undefined && (
                      <div className={`flex items-center sm:justify-end gap-2 mt-3 font-bold ${data.pointChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {data.pointChange >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                        <span className="text-lg">
                          {Math.abs(data.pointChange).toFixed(2)} ({data.percentChange?.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Open', value: data.open, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
                  { label: 'High', value: data.high, icon: Maximize2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                  { label: 'Low', value: data.low, icon: Minimize2, color: 'text-rose-500', bg: 'bg-rose-50' },
                  { label: 'Total Volume', value: data.volume, icon: BarChart3, color: 'text-amber-500', bg: 'bg-amber-50' },
                ].map((stat, idx) => (
                  <motion.div 
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + (idx * 0.05) }}
                    className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2 ${stat.bg} rounded-lg`}>
                        <stat.icon className={`w-4 h-4 ${stat.color}`} />
                      </div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                    </div>
                    <p className="text-xl font-bold text-slate-900">
                      {stat.value ? stat.value.toLocaleString() : '—'}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {!data && !error && !loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50"
            >
              <div className="p-4 bg-white rounded-2xl shadow-sm mb-4">
                <Search className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium text-center max-w-xs">
                Enter a stock symbol above to view real-time market performance and trade data.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}