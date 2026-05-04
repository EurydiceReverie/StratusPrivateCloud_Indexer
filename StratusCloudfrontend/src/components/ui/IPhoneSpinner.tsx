import React from 'react';

export const IPhoneSpinnerSimple: React.FC = () => (
  <div style={{ position: 'relative', width: '28px', height: '28px' }}>
    {Array.from({ length: 12 }).map((_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      const r = 9;
      const cx = 14 + r * Math.sin(angle);
      const cy = 14 - r * Math.cos(angle);
      return (
        <div key={i} style={{
          position: 'absolute', width: '2px', height: '5px', borderRadius: '2px',
          background: 'currentColor', left: `${cx}px`, top: `${cy}px`,
          transformOrigin: 'center center', transform: `rotate(${i * 30}deg)`,
          opacity: (i + 1) / 12,
          animation: 'iphone-spin 1.2s linear infinite',
          animationDelay: `${(i / 12) - 1}s`,
        }} />
      );
    })}
  </div>
);
