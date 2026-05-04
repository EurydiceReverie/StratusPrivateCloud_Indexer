import React from 'react';
import { Heart, Cloud } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border/50 py-3 px-4 flex items-center justify-between text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Cloud className="w-3 h-3" /> Dropbox Drive
      </span>
      <span className="flex items-center gap-1">
        Made with <Heart className="w-3 h-3 text-red-500 fill-red-500" />
      </span>
    </footer>
  );
};
