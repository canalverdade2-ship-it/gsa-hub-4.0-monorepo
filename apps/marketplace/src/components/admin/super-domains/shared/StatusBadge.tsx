import React, { ReactNode } from 'react';
import clsx from 'clsx';
import { 
  CheckCircle2, Clock, AlertTriangle, XCircle, 
  Loader2, MinusCircle, ShieldCheck, ShieldAlert, Sparkles 
} from 'lucide-react';

export type StatusVariant = 'emerald' | 'amber' | 'rose' | 'blue' | 'slate' | 'indigo';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface StatusBadgeProps {
  /** Explicit color variant */
  variant?: StatusVariant;
  /** Raw status identifier string (auto-maps to variant & label if provided) */
  status?: string;
  /** Custom badge content */
  children?: ReactNode;
  /** Size of the badge */
  size?: BadgeSize;
  /** Show indicator dot */
  dot?: boolean;
  /** Show animated pulse on indicator dot */
  pulse?: boolean;
  /** Custom icon */
  icon?: ReactNode;
  /** Custom additional className */
  className?: string;
}

/**
 * Normalizes raw status string to semantic StatusVariant
 */
export function getStatusBadgeVariant(status?: string | null): StatusVariant {
  if (!status) return 'slate';
  const s = String(status).toLowerCase().trim();

  // Emerald / Success
  if (
    s === 'pago' || 
    s === 'paga' || 
    s === 'paid' || 
    s === 'aprovado' || 
    s === 'aprovada' || 
    s === 'approved' || 
    s === 'ativo' || 
    s === 'ativa' || 
    s === 'active' || 
    s === 'concluido' || 
    s === 'concluida' || 
    s === 'concluído' || 
    s === 'concluída' || 
    s === 'finalizado' || 
    s === 'finalizada' || 
    s === 'completed' || 
    s === 'liquidado' || 
    s === 'validado' || 
    s === 'sucesso' || 
    s === 'success' ||
    s === 'online' ||
    s === 'verificado'
  ) {
    return 'emerald';
  }

  // Amber / Warning / In Review / Scheduled
  if (
    s === 'pendente' || 
    s === 'pending' || 
    s === 'em_analise' || 
    s === 'em_análise' || 
    s === 'analise' || 
    s === 'análise' || 
    s === 'review' || 
    s === 'in_review' || 
    s === 'aguardando' || 
    s === 'aguardando_aprovacao' || 
    s === 'aguardando_pagamento' || 
    s === 'aguardando_assinatura' || 
    s.startsWith('aguardando') ||
    s === 'agendado' || 
    s === 'agendada' || 
    s === 'scheduled' || 
    s === 'parcial' || 
    s === 'atencao' || 
    s === 'atenção' || 
    s === 'warning'
  ) {
    return 'amber';
  }

  // Rose / Danger / Overdue / Rejected / Cancelled
  if (
    s === 'vencido' || 
    s === 'vencida' || 
    s === 'overdue' || 
    s === 'cancelado' || 
    s === 'cancelada' || 
    s === 'cancelled' || 
    s === 'canceled' || 
    s === 'rejeitado' || 
    s === 'rejeitada' || 
    s === 'rejected' || 
    s === 'reprovado' || 
    s === 'reprovada' || 
    s === 'bloqueado' || 
    s === 'bloqueada' || 
    s === 'inadimplente' || 
    s === 'erro' || 
    s === 'error' || 
    s === 'failed' || 
    s === 'falha' ||
    s === 'offline'
  ) {
    return 'rose';
  }

  // Blue / Info / Processing / In Progress / Executing
  if (
    s === 'em_andamento' || 
    s === 'in_progress' || 
    s === 'processando' || 
    s === 'processing' || 
    s === 'executando' || 
    s === 'execucao' || 
    s === 'execução' || 
    s === 'em_transito' || 
    s === 'in_transit' || 
    s === 'enviado' || 
    s === 'enviada' || 
    s === 'aberto' || 
    s === 'aberta' || 
    s === 'open'
  ) {
    return 'blue';
  }

  // Indigo / VIP / Special
  if (
    s === 'vip' || 
    s === 'destaque' || 
    s === 'premium' || 
    s === 'special' || 
    s === 'prioritario' || 
    s === 'prioritário'
  ) {
    return 'indigo';
  }

  return 'slate';
}

/**
 * Returns formatted human-readable label in PT-BR for common status strings
 */
export function getStatusBadgeLabel(status?: string | null): string {
  if (!status) return 'Indefinido';
  const s = String(status).toLowerCase().trim();

  const labels: Record<string, string> = {
    pago: 'Pago',
    paga: 'Paga',
    aprovado: 'Aprovado',
    aprovada: 'Aprovada',
    ativo: 'Ativo',
    ativa: 'Ativa',
    concluido: 'Concluído',
    concluida: 'Concluída',
    finalizado: 'Finalizado',
    finalizada: 'Finalizada',
    liquidado: 'Liquidado',
    verificado: 'Verificado',
    pendente: 'Pendente',
    em_analise: 'Em Análise',
    em_análise: 'Em Análise',
    aguardando: 'Aguardando',
    aguardando_aprovacao: 'Aguard. Aprovação',
    aguardando_pagamento: 'Aguard. Pagamento',
    aguardando_assinatura: 'Aguard. Assinatura',
    agendado: 'Agendado',
    agendada: 'Agendada',
    vencido: 'Vencido',
    vencida: 'Vencida',
    cancelado: 'Cancelado',
    cancelada: 'Cancelada',
    rejeitado: 'Rejeitado',
    rejeitada: 'Rejeitada',
    reprovado: 'Reprovado',
    bloqueado: 'Bloqueado',
    inadimplente: 'Inadimplente',
    em_andamento: 'Em Andamento',
    processando: 'Processando',
    executando: 'Executando',
    em_transito: 'Em Trânsito',
    aberto: 'Aberto',
    aberta: 'Aberta',
    vip: 'VIP',
    destaque: 'Destaque',
    rascunho: 'Rascunho',
    inativo: 'Inativo',
    inativa: 'Inativa'
  };

  if (labels[s]) return labels[s];
  // Fallback: capitalize first letter and replace underscores
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Enterprise Light StatusBadge Component
 */
export function StatusBadge({
  variant: explicitVariant,
  status,
  children,
  size = 'sm',
  dot = true,
  pulse = false,
  icon,
  className
}: StatusBadgeProps) {
  const variant = explicitVariant || (status ? getStatusBadgeVariant(status) : 'slate');
  const label = children ?? (status ? getStatusBadgeLabel(status) : '—');

  // Variant color matrices (background, border, text, dot)
  const variantStyles = {
    emerald: {
      container: 'bg-emerald-50 text-emerald-800 border-emerald-200/90 hover:bg-emerald-100/70',
      dot: 'bg-emerald-500',
      pulse: 'bg-emerald-400'
    },
    amber: {
      container: 'bg-amber-50 text-amber-800 border-amber-200/90 hover:bg-amber-100/70',
      dot: 'bg-amber-500',
      pulse: 'bg-amber-400'
    },
    rose: {
      container: 'bg-red-50 text-red-800 border-red-200/90 hover:bg-red-100/70',
      dot: 'bg-red-500',
      pulse: 'bg-red-400'
    },
    blue: {
      container: 'bg-blue-50 text-blue-800 border-blue-200/90 hover:bg-blue-100/70',
      dot: 'bg-blue-500',
      pulse: 'bg-blue-400'
    },
    indigo: {
      container: 'bg-indigo-50 text-indigo-800 border-indigo-200/90 hover:bg-indigo-100/70',
      dot: 'bg-indigo-500',
      pulse: 'bg-indigo-400'
    },
    slate: {
      container: 'bg-slate-100 text-slate-700 border-slate-200/90 hover:bg-slate-200/60',
      dot: 'bg-slate-500',
      pulse: 'bg-slate-400'
    }
  }[variant];

  // Size specifications
  const sizeStyles = {
    xs: 'px-1.5 py-0.5 text-[9px] gap-1 rounded',
    sm: 'px-2.5 py-1 text-[10px] sm:text-[11px] gap-1.5 rounded-md',
    md: 'px-3 py-1.5 text-xs gap-2 rounded-lg'
  }[size];

  const dotSizeStyles = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5'
  }[size];

  return (
    <span
      className={clsx(
        'inline-flex items-center font-bold uppercase tracking-wider border select-none transition-colors shrink-0 shadow-2xs',
        variantStyles.container,
        sizeStyles,
        className
      )}
    >
      {/* Indicator Dot with optional Pulse */}
      {dot && (
        <span className="relative flex shrink-0 items-center justify-center">
          {pulse && (
            <span
              className={clsx(
                'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                variantStyles.pulse
              )}
            />
          )}
          <span
            className={clsx(
              'relative inline-flex rounded-full',
              dotSizeStyles,
              variantStyles.dot
            )}
          />
        </span>
      )}

      {/* Optional custom icon */}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}

      {/* Content */}
      <span className="truncate leading-none">{label}</span>
    </span>
  );
}
