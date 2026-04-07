import { useEffect, useState, useCallback, useMemo } from 'react';
import { FamilyMemberSummary } from './components/FamilyMemberSummary';
import { ShareCard } from './components/ShareCard';
import { PORTFOLIO, MOCK_PRICES } from './lib/data';
import { MarketTerminal } from './components/MarketTerminal';

export default function App() {
  const [prices, setPrices] = useState<Record<string, { price: number; change: number; history?: {date: string, price: number}[] }>>({});
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

    const newPrices: Record<string, { price: number; change: number; history?: {date: string, price: number}[] }> = {};
    const symbolsArray = Array.from(symbols);

    try {
      const response = await fetch(`/api/prices?symbols=${symbolsArray.join(',')}`);
      if (!response.ok) throw new Error('Failed to fetch from backend');
      const data = await response.json();

      for (const sym of symbolsArray) {
        if (data[sym]) {
          newPrices[sym] = data[sym];
        } else {
          console.warn(`Missing data for ${sym}, using mock.`);
          newPrices[sym] = MOCK_PRICES[sym];
        }
      }

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

  // Calculate overall summary
  const summary = useMemo(() => {
    let totalShares = 0;
    let totalInvestment = 0;
    let totalValueToday = 0;
    let totalValueYesterday = 0;

    for (const person in PORTFOLIO) {
      for (const [sym, qty] of Object.entries(PORTFOLIO[person as keyof typeof PORTFOLIO])) {
        totalShares += qty;
        
        let cost = qty * 100; // Assuming IPO price of 100
        if (person === "Arya Lamsal" && sym === "NRN") cost = 0; // Got these for free
        totalInvestment += cost;
        
        const priceData = prices[sym] || { price: 0, change: 0 };
        const currentPrice = priceData.price;
        const previousPrice = currentPrice - priceData.change;

        totalValueToday += qty * currentPrice;
        totalValueYesterday += qty * previousPrice;
      }
    }

    const gainLossToday = totalValueToday - totalValueYesterday;
    const gainLossTotal = totalValueToday - totalInvestment;

    return {
      totalShares,
      totalInvestment,
      totalValueToday,
      totalValueYesterday,
      gainLossToday,
      gainLossTotal,
      isPositiveToday: gainLossToday >= 0,
      isPositiveTotal: gainLossTotal >= 0
    };
  }, [prices]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Lamsal Family Portfolio</h1>
          <p className="text-base sm:text-lg text-slate-500 mt-2">Consolidated Report of Share Distributions</p>
        </header>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 mb-8">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>
          <p className="text-sm text-slate-500 font-medium">
            {loading ? 'Loading data...' : lastUpdated ? `✅ Updated at ${lastUpdated.toLocaleTimeString('en-NP')} (Nepal time)` : ''}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8 font-medium text-center border border-red-200 text-sm sm:text-base">
            ⚠️ Could not load live data. Market may be closed or API temporary issue. Using cached/demo data.
          </div>
        )}

        {/* NEPSE Market Terminal */}
        <MarketTerminal />

        {/* Overall Summary Section */}
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Overall Portfolio Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Total Shares</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{summary.totalShares}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Total Investment</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">NPR {summary.totalInvestment.toLocaleString('en-NP')}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Value Yesterday</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">NPR {summary.totalValueYesterday.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Value Today</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">NPR {summary.totalValueToday.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className={`p-4 rounded-lg border ${summary.isPositiveToday ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <p className={`text-xs sm:text-sm font-medium mb-1 ${summary.isPositiveToday ? 'text-emerald-700' : 'text-rose-700'}`}>Today's Gain/Loss</p>
              <p className={`text-xl sm:text-2xl font-bold ${summary.isPositiveToday ? 'text-emerald-600' : 'text-rose-600'}`}>
                {summary.isPositiveToday ? '+' : ''}NPR {summary.gainLossToday.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <FamilyMemberSummary prices={prices} />

        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">Share Performance</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {aggregatedShares.map(([sym, totalQty]) => (
            <ShareCard 
              key={sym} 
              symbol={sym} 
              totalQty={totalQty} 
              priceData={prices[sym] || { price: 100, change: 0 }} 
            />
          ))}
        </div>

        <div className="mt-8 sm:mt-12 bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">IPO / Corporate Actions</h2>
          <p className="text-sm sm:text-base text-slate-600">
            <strong>Note:</strong> Free price APIs do not have IPO data.<br className="hidden sm:block" />
            Check official notices here:{' '}
            <a href="https://newweb.nepalstock.com/notices" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">NEPSE Notices</a>
            {' '}or{' '}
            <a href="https://merolagani.com/ipo" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">MeroLagani IPO</a>
          </p>
        </div>

        <footer className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-slate-200 text-center text-slate-500 font-medium text-xs sm:text-sm">
          Grand total across all portfolios: 165 shares
        </footer>
      </div>
    </div>
  );
}

