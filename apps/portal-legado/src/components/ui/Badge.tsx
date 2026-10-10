import React from 'react';

export interface BadgeProps {
  status: string;
  variant?: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
  children?: React.ReactNode;
}

export function Badge({ status, variant }: BadgeProps) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const isAttentionStatus = ['em andamento', 'pendente', 'em análise'].includes(normalizedStatus) || normalizedStatus.startsWith('aguardando');
  let v = variant;
  if (!v && isAttentionStatus) v = 'yellow';
  if (!v) {
    const s = String(status || '').toLowerCase();
    if (['concluída', 'concluído', 'aceita', 'pago', 'ativo', 'assinado', 'aprovado'].some((w) => s.includes(w))) {
      v = 'green';
    } else if (['alta', 'urgente', 'recusada', 'vencido', 'cancelado', 'rejeitado', 'inativo'].some((w) => s.includes(w))) {
      v = 'red';
    } else if (['em andamento', 'os única', 'aberto', 'novo', 'enviado'].some((w) => s.includes(w))) {
      v = 'blue';
    } else if (['aguardando', 'em atendimento', 'em análise', 'pendente'].some((w) => s.includes(w))) {
      v = 'yellow';
    } else {
      v = 'gray';
    }
  }

  const isInProgress = String(status || '').trim().toLowerCase() === 'em andamento';
  const usesAttentionStyle = isAttentionStatus && v === 'yellow';
  return <span className={`pill pill--${v}${usesAttentionStyle ? ' pill--attention' : ''}${isInProgress ? ' pill--in-progress' : ''}`}>{status}</span>;
}

export default Badge;
