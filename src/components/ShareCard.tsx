import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatCurrency } from '../lib/data';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface ShareCardProps {
  key?: React.Key;
  symbol: string;
  totalQty: number;
  priceData: { 
    price: number; 
    change: number; 
    totalVolume1Y?: number;
    history?: {date: string, price: number, volume?: number}[] 
  };
}

export function ShareCard({ symbol, totalQty, priceData }: ShareCardProps) {
  const [timeRange, setTimeRange] = useState<'1D' | '1W' | '1M' | '1Y'>('1M');

  const { price, change, history = [], totalVolume1Y = 0 } = priceData;
  const isPositive = change >= 0;
  const changePercent = price > 0 ? (change / (price - change)) * 100 : 0;

  // Format large volume numbers
  const formatVol = (vol: number) => {
    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
    return vol.toString();
  };

  // Generate chart data based on real history from database
  const chartData = useMemo(() => {
    let filteredHistory = [...history];
    
    // Filter history based on selected time range
    if (filteredHistory.length > 0) {
      const now = new Date();
      let cutoffDate = new Date();
      
      if (timeRange === '1W') cutoffDate.setDate(now.getDate() - 7);
      else if (timeRange === '1M') cutoffDate.setMonth(now.getMonth() - 1);
      else if (timeRange === '1Y') cutoffDate.setFullYear(now.getFullYear() - 1);
      
      if (timeRange !== '1D') {
        const cutoffStr = cutoffDate.toISOString().split('T')[0];
        filteredHistory = filteredHistory.filter(h => h.date >= cutoffStr);
      } else {
        // For 1D, just show the last 2 points if available
        filteredHistory = filteredHistory.slice(-2);
      }
    }

    const data = filteredHistory.map(h => h.price);
    const labels = filteredHistory.map(h => h.date);
    
    // Always append current live price at the end
    labels.push('Now');
    data.push(price);

    // If we still don't have enough data points (e.g. brand new DB), generate a tiny visual trend
    if (data.length <= 2) {
      const effectiveChange = change !== 0 ? change : (price * 0.005); 
      let currentVal = price - (effectiveChange * 5);
      
      data.unshift(currentVal);
      labels.unshift('T-1');
    }

    return {
      labels,
      datasets: [{
        label: 'Price',
        data,
        borderColor: isPositive ? '#10b981' : '#f43f5e',
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 150);
          if (isPositive) {
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
          } else {
            gradient.addColorStop(0, 'rgba(244, 63, 94, 0.2)');
            gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');
          }
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      }]
    };
  }, [price, change, history, timeRange, isPositive]);

  return (
    <div className="card p-4 sm:p-6 flex flex-col">
      <div className="flex justify-between items-start mb-4 sm:mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs">
              {symbol.substring(0, 2)}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">{symbol}</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-2">Family Shares: <span className="text-slate-900">{totalQty}</span></p>
        </div>
        <div className="text-right">
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{formatCurrency(price)}</div>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">1Y Vol: {formatVol(totalVolume1Y)}</p>
          <div className={`text-xs sm:text-sm font-medium mt-1 flex items-center justify-end gap-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isPositive ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 sm:w-4 sm:h-4">
                <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 sm:w-4 sm:h-4">
                <path fillRule="evenodd" d="M12 13a1 1 0 100 2h5a1 1 0 001-1V9a1 1 0 10-2 0v2.586l-4.293-4.293a1 1 0 00-1.414 0L8 9.586 3.707 5.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L11 9.414 14.586 13H12z" clipRule="evenodd" />
              </svg>
            )}
            {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="h-24 sm:h-32 mb-4 sm:mb-6 mt-auto">
        <Line 
          data={chartData} 
          options={{ 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: {
              x: { display: false },
              y: { display: false }
            },
            interaction: {
              intersect: false,
              mode: 'index',
            },
          }} 
        />
      </div>

      <div className="flex gap-2 mt-auto">
        {(['1D', '1W', '1M', '1Y'] as const).map(range => (
          <button 
            key={range} 
            onClick={() => setTimeRange(range)}
            className={`btn-time flex-1 ${timeRange === range ? 'active' : ''}`}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}
