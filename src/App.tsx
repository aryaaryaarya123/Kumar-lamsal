import { useEffect, useState, useCallback, useMemo } from 'react';
import { FamilyMemberSummary } from './components/FamilyMemberSummary';
import { ShareCard } from './components/ShareCard';
import { PORTFOLIO, MOCK_PRICES } from './lib/data';

export default function App() {
  const [prices, setPrices] = useState<Record<string, { price: number; change: number }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    const symbols = new Set<string>();
    for (const person in PORTFOLIO) {
      for (const sym in PORTFOLIO[person as keyof typeof PORTFOLIO]) {
        symbols.add(sym);
      }
    }

    const newPrices: Record<string, { price: number; change: number }> = {};
    const symbolsArray = Array.from(symbols);

    try {
      // 1. Try to fetch all live market data at once
      let bulkData: any[] = [];
      try {
        const res = await fetch('https://nepseapi.surajrimal.dev/LiveMarket');
        if (res.ok) {
          bulkData = await res.json();
        }
      } catch (err) {
        console.warn("Bulk API failed, will fallback to individual API", err);
      }

      const bulkMap = new Map();
      if (Array.isArray(bulkData)) {
        bulkData.forEach((stock: any) => {
          if (stock.symbol) {
            bulkMap.set(stock.symbol, stock);
          }
        });
      }

      // 2. Process each symbol
      await Promise.all(symbolsArray.map(async (sym) => {
        try {
          if (bulkMap.has(sym)) {
            const stock = bulkMap.get(sym);
            const priceStr = (stock.lastTradedPrice || stock.ltp || '0').toString().replace(/,/g, '');
            const price = parseFloat(priceStr);
            
            // Calculate absolute change if not directly provided
            let change = parseFloat((stock.change || '0').toString().replace(/,/g, ''));
            if (!change && stock.percentageChange) {
               const pct = parseFloat((stock.percentageChange || '0').toString().replace(/,/g, ''));
               const prevClose = price / (1 + (pct / 100));
               change = price - prevClose;
            }
            newPrices[sym] = { price, change };
          } else {
            // Fallback to individual stock API
            const response = await fetch(`https://nepsetty.kokomo.workers.dev/api?symbol=${sym}`);
            if (!response.ok) throw new Error(`Failed to fetch ${sym}`);
            const stockData = await response.json();
            
            const priceStr = (stockData.ltp || stockData.lastTradedPrice || stockData.price || '0').toString().replace(/,/g, '');
            const price = parseFloat(priceStr);
            
            // SAFETY CHECK – prevent wrong data
            if (price <= 0) {
              console.warn(`Skipped ${sym} – suspicious LTP=0`);
              throw new Error(`Suspicious LTP=0 for ${sym}`);
            }

            const change = parseFloat((stockData.change || '0').toString().replace(/,/g, ''));
            newPrices[sym] = { price, change };
          }
        } catch (err) {
          console.warn(`Failed to fetch data for ${sym}, using mock.`, err);
          newPrices[sym] = MOCK_PRICES[sym];
        }
      }));

      // Check if we ended up using mostly mock data
      const isMostlyMock = symbolsArray.every(sym => newPrices[sym] === MOCK_PRICES[sym]);
      if (isMostlyMock) {
        setError(true);
      } else {
        setLastUpdated(new Date());
      }

      localStorage.setItem('lamsal_portfolio_cache', JSON.stringify({
        prices: newPrices,
        timestamp: new Date().getTime()
      }));
    } catch (err) {
      console.error("All API fetches failed.", err);
      setError(true);
      
      const cached = localStorage.getItem('lamsal_portfolio_cache');
      if (cached) {
        Object.assign(newPrices, JSON.parse(cached).prices);
        setLastUpdated(new Date(JSON.parse(cached).timestamp));
      } else {
        Object.assign(newPrices, MOCK_PRICES);
      }
    }

    setPrices(newPrices);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 15 seconds (only during market hours)
    const interval = setInterval(() => {
      const hour = new Date().getHours();
      // Nepal market hours approx 10 to 15
      if (hour >= 10 && hour < 15) {
        fetchData();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Calculate total shares per symbol across the family
  const aggregatedShares = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const person in PORTFOLIO) {
      for (const [sym, qty] of Object.entries(PORTFOLIO[person as keyof typeof PORTFOLIO])) {
        totals[sym] = (totals[sym] || 0) + qty;
      }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]); // Sort by highest quantity
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Lamsal Family Portfolio</h1>
          <p className="text-lg text-slate-500 mt-2">Consolidated Report of Share Distributions</p>
        </header>

        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>
          <p className="text-sm text-slate-500 font-medium">
            {loading ? 'Loading data...' : lastUpdated ? `✅ Updated at ${lastUpdated.toLocaleTimeString('en-NP')} (Nepal time)` : ''}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8 font-medium text-center border border-red-200">
            ⚠️ Could not load live data. Market may be closed or API temporary issue. Using cached/demo data.
          </div>
        )}

        <FamilyMemberSummary prices={prices} />

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Share Performance</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {aggregatedShares.map(([sym, totalQty]) => (
            <ShareCard 
              key={sym} 
              symbol={sym} 
              totalQty={totalQty} 
              priceData={prices[sym] || { price: 100, change: 0 }} 
            />
          ))}
        </div>

        <div className="mt-12 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">IPO / Corporate Actions</h2>
          <p className="text-slate-600">
            <strong>Note:</strong> Free price APIs do not have IPO data.<br />
            Check official notices here:{' '}
            <a href="https://newweb.nepalstock.com/notices" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">NEPSE Notices</a>
            {' '}or{' '}
            <a href="https://merolagani.com/ipo" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">MeroLagani IPO</a>
          </p>
        </div>

        <footer className="mt-12 pt-8 border-t border-slate-200 text-center text-slate-500 font-medium text-sm">
          Grand total across all portfolios: 165 shares
        </footer>
      </div>
    </div>
  );
}

