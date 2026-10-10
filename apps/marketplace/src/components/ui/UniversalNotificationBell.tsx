import { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDateTime } from '../../lib/utils';
import { Module } from '../../types';

export interface StandardNotification {
  id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
  modulo?: string;
  tab?: string;
  item_id?: string;
  prioridade?: string;
}

interface UniversalNotificationBellProps {
  notifications: StandardNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onDeleteAll?: () => Promise<void>;
  onNavigate: (module: Module, tab?: string, itemId?: string) => void;
  variant?: 'admin' | 'provider' | 'client';
}

export function UniversalNotificationBell({ 
  notifications, 
  unreadCount, 
  onMarkAsRead, 
  onMarkAllAsRead,
  onDeleteAll,
  onNavigate,
  variant = 'client'
}: UniversalNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(unreadCount);

  // Efeito para animação de "novo" quando o contador aumenta
  useEffect(() => {
    if (unreadCount > lastCountRef.current) {
      setHasNew(true);
      const timer = setTimeout(() => setHasNew(false), 3000);
      return () => clearTimeout(timer);
    }
    lastCountRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (n: StandardNotification) => {
    if (!n.lida) {
      setMarkingId(n.id);
      try {
        await onMarkAsRead(n.id);
      } finally {
        setMarkingId(null);
      }
    }
    onNavigate((n.modulo as Module) || 'dashboard', n.tab, n.item_id);
    setIsOpen(false);
  };

  const getPriorityColor = (prioridade?: string) => {
    switch (prioridade) {
      case 'urgente': return '#ef4444';
      case 'alta': return '#f97316';
      default: return '#4f46e5';
    }
  };

  return (
    <div className="relative z-[100]" ref={dropdownRef}>
      <motion.button 
        onClick={() => setIsOpen(!isOpen)}
        animate={hasNew ? { 
          rotate: [0, -10, 10, -10, 10, 0],
          scale: [1, 1.2, 1.2, 1]
        } : {}}
        transition={{ duration: 0.5 }}
        className="relative rounded-full bg-white p-2.5 shadow-sm ring-1 ring-black/5 transition-all hover:bg-black/5"
        title="Notificações"
      >
        <Bell className={`h-5 w-5 ${hasNew ? 'text-indigo-600' : 'text-[#1a1a1a]'}`} />
        {unreadCount > 0 && (
          <motion.span 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 20, scale: 0.98, filter: 'blur(10px)' }}
            className="absolute right-0 mt-5 w-72 sm:w-80 overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.05] z-50 origin-top-right border border-neutral-100"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 p-6 bg-white">
              <h3 className="text-2xl font-bold text-neutral-900 tracking-tight">Notificações</h3>
              <button 
                onClick={() => setIsOpen(false)} 
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length > 0 ? (
                <div className="divide-y divide-neutral-100">
                  {notifications.map((n, index) => (
                    <motion.button
                      key={n.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleNotificationClick(n)}
                      disabled={markingId === n.id}
                      className={`flex w-full flex-col p-4 text-left transition-colors ${!n.lida ? 'bg-indigo-50/30 hover:bg-indigo-50/60' : 'hover:bg-neutral-50'} ${markingId === n.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${!n.lida ? 'font-semibold text-neutral-900' : 'text-neutral-700'}`}>
                          {n.titulo}
                        </p>
                        {!n.lida && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getPriorityColor(n.prioridade) }} />
                        )}
                      </div>
                      
                      <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                        {n.mensagem}
                      </p>
                      
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400">
                          {formatDateTime(n.created_at)}
                        </span>
                        {n.modulo && (
                           <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 capitalize">
                             {n.modulo.replace('-', ' ')}
                           </span>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="mb-3 rounded-full bg-neutral-50 p-3">
                    <Bell className="h-6 w-6 text-neutral-300" />
                  </div>
                  <p className="text-sm font-medium text-neutral-900">Nenhuma notificação</p>
                  <p className="mt-1 text-xs text-neutral-500">Você está em dia com tudo!</p>
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="border-t border-neutral-100 p-3 bg-neutral-50/50 flex flex-col gap-2">
                <button 
                  onClick={onMarkAllAsRead}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Marcar todas como lidas
                </button>
                {onDeleteAll && (
                  <button 
                    onClick={onDeleteAll}
                    className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Excluir todas notificações
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
