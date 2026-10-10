import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  size = 'md',
}: EmptyStateProps) {
  const isDark = variant === 'dark';
  const paddings = { sm: 'py-12', md: 'py-20', lg: 'py-32' };
  const iconSizes = { sm: 'h-10 w-10 p-2.5', md: 'h-14 w-14 p-3.5', lg: 'h-20 w-20 p-5' };
  const iconInner = { sm: 'h-5 w-5', md: 'h-7 w-7', lg: 'h-10 w-10' };

  return (
    <div className={`flex flex-col items-center justify-center text-center ${paddings[size]}`}>
      <div
        className={`rounded-2xl flex items-center justify-center mb-5 ${iconSizes[size]} ${
          isDark ? 'bg-white/10' : 'bg-neutral-100 ring-1 ring-neutral-200'
        }`}
      >
        <Icon className={`${iconInner[size]} ${isDark ? 'text-white/30' : 'text-neutral-300'}`} />
      </div>
      <h3
        className={`font-black uppercase tracking-tight mb-1.5 ${
          size === 'lg' ? 'text-lg' : 'text-base'
        } ${isDark ? 'text-white/60' : 'text-neutral-400'}`}
      >
        {title}
      </h3>
      {description && (
        <p
          className={`text-[11px] font-semibold max-w-xs leading-relaxed ${
            isDark ? 'text-white/25' : 'text-neutral-300'
          }`}
        >
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className={`mt-5 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${
            isDark
              ? 'bg-white text-neutral-900 hover:bg-neutral-100'
              : 'bg-neutral-900 text-white hover:bg-black'
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
