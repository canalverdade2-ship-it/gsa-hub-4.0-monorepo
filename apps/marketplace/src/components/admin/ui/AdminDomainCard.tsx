import React from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  badge?: number;
  icon: LucideIcon;
  submetrics?: { label: string; value: string | number }[];
  onClick?: () => void;
}

export function AdminDomainCard({ title, badge, icon: Icon, submetrics, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex flex-col rounded-[2rem] bg-white p-5 text-left shadow-sm ring-1 ring-neutral-100 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3 w-full border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-50 text-neutral-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="font-black text-neutral-900">{title}</h3>
        </div>
        {badge && badge > 0 ? (
          <span className="shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-red-100 text-xs font-black text-red-600 ring-1 ring-red-200/50">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : (
          <span className="shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-neutral-100 text-xs font-bold text-neutral-400">
            0
          </span>
        )}
      </div>

      {submetrics && submetrics.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-y-3 gap-x-2 w-full">
          {submetrics.map((metric, index) => (
            <div key={index} className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {metric.label}
              </span>
              <span className="mt-0.5 text-sm font-semibold text-neutral-900">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
