import React from 'react';
import { Clock, CheckCircle2, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { AdminNotificacao } from '../../../hooks/useAdminNotifications';

interface Props {
  notifications: AdminNotificacao[];
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

export function AdminActivityFeed({ notifications, onNavigate }: Props) {
  const getIcon = (tipo: string, prioridade?: string) => {
    if (prioridade === 'alta') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (tipo.includes('sucesso') || tipo.includes('concluid')) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (tipo.includes('cancelad') || tipo.includes('falha')) return <XCircle className="w-4 h-4 text-red-500" />;
    if (tipo.includes('pendente') || tipo.includes('novo')) return <Clock className="w-4 h-4 text-amber-500" />;
    return <RefreshCw className="w-4 h-4 text-indigo-500" />;
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min atrás`;
    
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    
    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays} dias atrás`;
    
    return formatDateShort(date);
  };
  
  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const handleItemClick = (notification: AdminNotificacao) => {
    if (onNavigate && notification.modulo) {
      onNavigate(notification.modulo, notification.tab, notification.item_id);
    }
  };

  const feedItems = notifications.slice(0, 15);

  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-sm ring-1 ring-neutral-100 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100 bg-neutral-50/50">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
            <Clock className="w-5 h-5" />
          </span>
          <h3 className="font-black text-neutral-900">Timeline da Operação</h3>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {feedItems.length > 0 ? (
          feedItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              disabled={!item.modulo}
              className={`w-full flex items-start gap-4 p-4 rounded-2xl text-left transition ${item.modulo ? 'hover:bg-neutral-50 hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
            >
              <div className="shrink-0 mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-50 border border-neutral-100">
                {getIcon(item.tipo, item.prioridade)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-900 leading-snug">{item.titulo}</p>
                <p className="text-xs text-neutral-500 truncate mt-1">{item.mensagem}</p>
              </div>
              <div className="shrink-0 text-[10px] font-black uppercase tracking-wider text-neutral-400 mt-1 whitespace-nowrap">
                {getTimeAgo(item.created_at)}
              </div>
            </button>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-neutral-400">
            <p className="text-sm font-semibold">Nenhuma atividade recente</p>
          </div>
        )}
      </div>
    </div>
  );
}
