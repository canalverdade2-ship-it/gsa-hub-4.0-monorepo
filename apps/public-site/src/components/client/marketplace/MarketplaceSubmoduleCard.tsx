import type { ElementType, Key, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface MarketplaceSubmoduleCardProps {
  key?: Key;
  icon: ElementType;
  title: string;
  description: string;
  actionLabel: string;
  image: string;
  imageAlt: string;
  categoryLabel: string;
  onClick: () => void;
  accentColor?: string;
  badge?: ReactNode;
  index?: number;
}

export function MarketplaceSubmoduleCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  image,
  imageAlt,
  categoryLabel,
  onClick,
  accentColor = '#0c2340',
  badge,
  index = 0,
}: MarketplaceSubmoduleCardProps) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.35 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="group grid min-h-[176px] w-full min-w-0 grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-left shadow-[0_6px_20px_rgba(12,35,64,0.05)] transition-all duration-300 hover:border-[#17345f]/30 hover:shadow-[0_16px_36px_rgba(12,35,64,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17345f] focus-visible:ring-offset-2 md:block md:min-h-[340px] cursor-pointer"
    >
      <div className="relative min-h-full overflow-hidden bg-slate-100 md:h-44 md:min-h-0 lg:h-48">
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/15 pointer-events-none" />
        <span className="absolute left-3 top-3 hidden rounded-lg bg-slate-900/85 backdrop-blur-md px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-xs md:inline-flex border border-white/15">
          {categoryLabel}
        </span>
        {badge && <span className="absolute right-3 top-3">{badge}</span>}
      </div>

      <div className="flex min-w-0 flex-col justify-between p-4 md:min-h-[160px] md:p-5">
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                style={{ color: accentColor, backgroundColor: `${accentColor}15` }}
              >
                <Icon className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500 md:hidden">
                {categoryLabel}
              </span>
            </div>
            {badge && <span className="shrink-0 md:hidden">{badge}</span>}
          </div>

          <h3 className="break-words text-base font-black leading-tight text-[#0c2340] sm:text-lg group-hover:text-[#17345f] transition-colors">{title}</h3>
          <p className="mt-1.5 break-words text-xs font-medium leading-relaxed text-slate-500">
            {description}
          </p>
        </div>

        <div className="mt-3 flex w-full items-center justify-between gap-2 border-t border-slate-100 pt-3 md:mt-4 md:pt-3.5">
          <span className="min-w-0 break-words pr-2 text-[10px] font-black uppercase tracking-wider text-[#17345f] group-hover:text-[#d8bd73] transition-colors md:text-xs">
            {actionLabel}
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#17345f] text-white transition-all duration-300 group-hover:bg-[#d8bd73] group-hover:text-slate-950 md:h-8 md:w-8 shadow-xs">
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </motion.button>
  );
}
