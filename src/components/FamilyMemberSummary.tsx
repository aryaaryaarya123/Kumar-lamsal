import { useMemo } from 'react';
import { PORTFOLIO, IPO_PRICE, formatCurrency } from '../lib/data';

interface FamilyMemberSummaryProps {
  prices: Record<string, { price: number; change: number }>;
}

export function FamilyMemberSummary({ prices }: FamilyMemberSummaryProps) {
  const members = useMemo(() => {
    return Object.entries(PORTFOLIO).map(([name, holdings]) => {
      let totalShares = 0;
      let totalInvested = 0;
      let totalCurrent = 0;
      let todaysPL = 0;

      for (const [sym, qty] of Object.entries(holdings)) {
        totalShares += qty;
        
        let cost = qty * IPO_PRICE;
        if (name === "Arya Lamsal" && sym === "NRN") cost = 0; // Got these for free
        totalInvested += cost;
        
        const priceData = prices[sym] || { price: IPO_PRICE, change: 0 };
        totalCurrent += qty * priceData.price;
        todaysPL += qty * priceData.change;
      }

      const totalPL = totalCurrent - totalInvested;

      return { name, totalShares, totalPL, todaysPL };
    });
  }, [prices]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-12">
      {members.map(m => (
        <div key={m.name} className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-semibold">
              {m.name.charAt(0)}
            </div>
            <h3 className="font-semibold text-lg text-slate-900">{m.name}</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Total Shares</span>
              <span className="font-semibold text-slate-900">{m.totalShares}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Total P/L</span>
              <span className={`font-semibold ${m.totalPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {m.totalPL >= 0 ? '+' : ''}{formatCurrency(m.totalPL)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Today's P/L</span>
              <span className={`font-semibold ${m.todaysPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {m.todaysPL >= 0 ? '+' : ''}{formatCurrency(m.todaysPL)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
