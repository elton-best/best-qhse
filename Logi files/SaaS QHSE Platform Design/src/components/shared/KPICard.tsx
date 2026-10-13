import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: LucideIcon;
  color?: string;
  onClick?: () => void;
}

export default function KPICard({
  title,
  value,
  change,
  trend = 'neutral',
  icon: Icon,
  color = 'from-[#6366f1] to-[#818cf8]',
  onClick
}: KPICardProps) {
  const trendColors = {
    up: 'bg-[#10b981]/10 text-[#10b981]',
    down: 'bg-[#ef4444]/10 text-[#ef4444]',
    neutral: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
  };

  return (
    <div
      onClick={onClick}
      className={`
        glass rounded-2xl p-6 transition-all duration-200
        ${onClick ? 'hover:scale-[1.02] cursor-pointer' : ''}
      `}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {change && (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${trendColors[trend]}`}>
            {change}
          </span>
        )}
      </div>
      <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
        {value}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {title}
      </p>
    </div>
  );
}
