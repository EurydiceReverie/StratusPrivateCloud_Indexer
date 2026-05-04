import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck } from 'lucide-react';

interface PinDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  isSetup?: boolean; // if true, asks for new PIN + confirm
}

export const PinDialog: React.FC<PinDialogProps> = ({
  open, title = 'Enter PIN', description, onConfirm, onCancel, isSetup = false,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setPin(''); setConfirmPin(''); setError(''); }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    if (isSetup && pin !== confirmPin) { setError('PINs do not match'); return; }
    onConfirm(pin);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            {title}
          </DialogTitle>
          {description && <p className="text-sm text-muted-foreground pt-1">{description}</p>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{isSetup ? 'New PIN' : 'PIN'}</Label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={8}
              placeholder="••••"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
              autoFocus
            />
          </div>
          {isSetup && (
            <div className="space-y-2">
              <Label>Confirm PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="••••"
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setError(''); }}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit">Confirm</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
