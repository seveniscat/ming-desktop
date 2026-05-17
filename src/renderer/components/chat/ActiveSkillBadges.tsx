import { X, Zap } from 'lucide-react';

interface ActiveSkill {
  id: string;
  name: string;
}

interface ActiveSkillBadgesProps {
  skills: ActiveSkill[];
  onRemove: (skillId: string) => void;
}

export function ActiveSkillBadges({ skills, onRemove }: ActiveSkillBadgesProps) {
  if (skills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {skills.map(skill => (
        <span
          key={skill.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
        >
          <Zap size={10} />
          {skill.name}
          <button
            type="button"
            onClick={() => onRemove(skill.id)}
            className="ml-0.5 hover:text-destructive transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
