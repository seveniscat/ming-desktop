import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface ComposerVariableCardProps {
  variables: string[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function ComposerVariableCard({
  variables,
  onConfirm,
  onCancel,
}: ComposerVariableCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    variables.forEach((v) => { initial[v] = ''; });
    setValues(initial);
  }, [variables]);

  const allFilled = variables.every((v) => values[v]?.trim());

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 mb-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">
          Fill Variables
        </span>
        <button
          onClick={onCancel}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2">
        {variables.map((v) => (
          <div key={v}>
            <label className="block text-xs font-mono text-muted-foreground mb-1">
              {'{' + v + '}'}
            </label>
            <Input
              value={values[v] || ''}
              onChange={(e) => setValues({ ...values, [v]: e.target.value })}
              placeholder={`Value for ${v}`}
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && allFilled) onConfirm(values);
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={() => onConfirm(values)} disabled={!allFilled}>
          <Check size={14} className="mr-1" />
          插入
        </Button>
      </div>
    </div>
  );
}
