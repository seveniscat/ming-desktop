import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import type { SkillParameter } from '../../../shared/types';

interface SkillParameterDialogProps {
  open: boolean;
  skillName: string;
  parameters: SkillParameter[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function SkillParameterDialog({ open, skillName, parameters, onConfirm, onCancel }: SkillParameterDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      for (const p of parameters) {
        initial[p.name] = p.options[0]?.value || '';
      }
      setValues(initial);
    }
  }, [open, parameters]);

  const allFilled = parameters.every((p) => values[p.name]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{skillName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {parameters.map((param) => (
            <div key={param.name}>
              <label className="block text-sm font-medium text-muted-foreground mb-2">{param.label}</label>
              <div className="flex flex-wrap gap-2">
                {param.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setValues({ ...values, [param.name]: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                      values[param.name] === opt.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-[hsl(var(--border))] hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button onClick={() => onConfirm(values)} disabled={!allFilled}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
