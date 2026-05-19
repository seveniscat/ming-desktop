import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface VariableFillDialogProps {
  open: boolean;
  variables: string[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function VariableFillDialog({ open, variables, onConfirm, onCancel }: VariableFillDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      variables.forEach((v) => { initial[v] = ''; });
      setValues(initial);
    }
  }, [open, variables]);

  const handleConfirm = () => {
    onConfirm(values);
  };

  const allFilled = variables.every((v) => values[v]?.trim());

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fill Variables</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {variables.map((v) => (
            <div key={v}>
              <Label className="mb-1 block text-xs font-mono text-muted-foreground">{'{' + v + '}'}</Label>
              <Input
                value={values[v] || ''}
                onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                placeholder={`Value for ${v}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allFilled) handleConfirm();
                }}
                autoFocus
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!allFilled}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
