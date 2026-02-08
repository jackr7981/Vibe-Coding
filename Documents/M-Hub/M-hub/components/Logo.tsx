import React from 'react';
import { Anchor } from 'lucide-react';

export const Logo: React.FC<{ size?: 'sm' | 'md' | 'lg', color?: 'white' | 'blue' }> = ({ size = 'md', color = 'blue' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const textColor = color === 'white' ? 'text-white' : 'text-slate-800';
  const iconColor = color === 'white' ? 'text-sky-300' : 'text-blue-600';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`rounded-full border-2 ${color === 'white' ? 'border-sky-300' : 'border-blue-600'} p-2 mb-2`}>
        <Anchor className={`${sizeClasses[size]} ${iconColor}`} />
      </div>
      <h1 className={`${textSizes[size]} font-bold ${textColor} tracking-tight`}>
        BD <span className={color === 'white' ? 'text-sky-300' : 'text-blue-600'}>Mariner</span> Hub
      </h1>
    </div>
  );
};
