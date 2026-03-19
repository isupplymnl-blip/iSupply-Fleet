import React from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function TripleWhaleCard({ title, value, trendPct, data, color = "#10b981" }) {
  // Format the data for Recharts
  const chartData = data?.map((val, index) => ({ index, value: val })) || [];
  
  const isPositive = trendPct > 0;
  const isNegative = trendPct < 0;
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive ? "text-emerald-500" : isNegative ? "text-red-500" : "text-gray-500";

  return (
    <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col justify-between h-40 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-gray-700">
      
      {/* Top Row: Title & Trend */}
      <div className="flex justify-between items-start">
        <h3 className="text-gray-400 font-bold text-sm tracking-wide">{title}</h3>
        <div className={`flex items-center text-xs font-bold ${trendColor}`}>
          <TrendIcon className="w-4 h-4 mr-1" />
          {trendPct !== 0 ? `${Math.abs(trendPct).toFixed(1)}%` : '--'}
        </div>
      </div>

      {/* Middle: The Main Value */}
      <div className="mt-2">
        <span className="text-3xl font-extrabold text-white tracking-tight">{value}</span>
      </div>

      {/* Bottom: The Sparkline Graph */}
      <div className="h-12 w-full mt-auto opacity-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line 
              type="monotone" // This makes the line beautifully curved!
              dataKey="value" 
              stroke={color} 
              strokeWidth={3} 
              dot={false} 
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}