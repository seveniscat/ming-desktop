import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { SkillParameter } from '../../../shared/types';

interface ComposerParameterCardProps {
  skillName: string;
  parameters: SkillParameter[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function ComposerParameterCard({
  skillName,
  parameters,
  onConfirm,
  onCancel,
}: ComposerParameterCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const p of parameters) {
      if (p.type === 'select') {
        initial[p.name] = p.options?.[0]?.value || '';
      } else if (p.type === 'boolean') {
        initial[p.name] = String(p.default ?? false);
      } else {
        initial[p.name] = typeof p.default === 'string' ? p.default : '';
      }
    }
    setValues(initial);
  }, [parameters]);

  const allFilled = parameters.every((p) => {
    if (p.type === 'boolean') return true;
    return values[p.name]?.trim();
  });

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 mb-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">
          {skillName}
        </span>
        <button
          onClick={onCancel}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {parameters.map((param) => (
          <div key={param.name}>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {param.label}
            </label>

            {param.type === 'select' && (
              <div className="flex flex-wrap gap-1.5">
                {param.options?.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setValues({ ...values, [param.name]: opt.value })}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                      values[param.name] === opt.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-[hsl(var(--border))] hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {param.type === 'text' && (
              <Input
                value={values[param.name] || ''}
                onChange={(e) => setValues({ ...values, [param.name]: e.target.value })}
                placeholder={param.placeholder || `Enter ${param.label}`}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allFilled) onConfirm(values);
                }}
              />
            )}

            {param.type === 'boolean' && (
              <button
                onClick={() =>
                  setValues({ ...values, [param.name]: String(values[param.name] !== 'true') })
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  values[param.name] === 'true' ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    values[param.name] === 'true' ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={() => onConfirm(values)} disabled={!allFilled}>
          <Check size={14} className="mr-1" />
          确定
        </Button>
      </div>
    </div>
  );
}
