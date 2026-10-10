import React, { useEffect, useState } from 'react';
import { Bell, AlertCircle, Info, Calendar, Sparkles, Check } from 'lucide-react';
import Card from '../ui/Card';
import { api, isDemoMode, when } from '../../api';
import { notificationTarget, type NotificationTarget } from '../../notifications';

const staticNotices = [
  {
    id: 'n-1',
    title: 'Atenção aos Prazos de Faturamento do Simples Nacional (Competência 09/2026)',
    type: 'important',
    category: 'Fiscal & Tributário',
    date: '02/10/2026',
    content: 'Informamos a todos os clientes enquadrados no Simples Nacional que o envio das notas fiscais de serviços emitidas no mês de Setembro/2026 deve ser realizado até 05/10/2026 para que nossa equipe efetue a apuração tempestiva da guia DAS.'
  },
  {
    id: 'n-2',
    title: 'Novo Portal GSA HUB 3.0: Acompanhamento em Tempo Real das Ordens de Serviço',
    type: 'feature',
    category: 'Novidade na Plataforma',
    date: '01/10/2026',
    content: 'Seja bem-vindo ao novo GSA HUB 3.0! Agora você pode acompanhar cada etapa do fluxo operacional da sua empresa com linha do tempo interativa, visualização de contratos em PDF e envio direto de pendências documentais.'
  },
  {
    id: 'n-3',
    title: 'Expediente no Feriado Nacional de 12 de Outubro',
    type: 'operational',
    category: 'Aviso Institucional',
    date: '28/09/2026',
    content: 'Não haverá atendimento presencial ou emissão de protocolos nos órgãos públicos (Junta Comercial e Receita Federal) na segunda-feira, 12/10. O atendimento regular será retomado na terça-feira às 08:30.'
  }
];

const remoteNotice = (notification: any) => ({
  id: notification.id,
  title: notification.kind === 'proposals' ? 'Atualização de proposta comercial' : 'Nova atualização no GSA HUB',
  type: notification.kind === 'proposals' ? 'feature' : 'operational',
  category: notification.kind === 'proposals' ? 'Propostas comerciais' : 'Notificação do sistema',
  date: when(notification.createdAt),
  content: notification.message || 'Há uma nova atualização disponível para sua conta.',
  unread: !notification.read,
  target: notificationTarget(notification),
  remote: true
});

interface ClientNoticesProps {
  role?: 'admin' | 'client';
  onNavigate?: (screen: string, detail?: string | null) => void;
}

export function ClientNotices({ role = 'client', onNavigate }: ClientNoticesProps) {
  const [remoteNotices, setRemoteNotices] = useState<any[]>([]);

  const reload = async () => {
    try {
      const result = await api('/notifications');
      if (Array.isArray(result)) setRemoteNotices(result.map(remoteNotice));
    } catch {
      // The static institutional notices remain available while offline.
    }
  };

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  const markRead = async (notice: any) => {
    if (!notice.remote || !notice.unread) return true;
    try {
      await api(`/notifications/${notice.id}/read`, {}, 'PATCH');
      setRemoteNotices((items) => items.map((item) => item.id === notice.id ? { ...item, unread: false } : item));
      // Refresh the bell counter immediately while the SSE event propagates.
      window.dispatchEvent(new Event('gsa:reload'));
      return true;
    } catch {
      // Keep the notification visible if the update cannot be saved.
      return false;
    }
  };

  const openNotice = async (notice: any) => {
    await markRead(notice);
    const target: NotificationTarget | null = notice.target || null;
    if (target && onNavigate) onNavigate(target.screen, target.detail);
  };

  const notices = [...remoteNotices, ...(isDemoMode ? staticNotices : [])];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Mural de Comunicados</h1>
        <p className="page-subtitle">Avisos importantes, atualizações tributárias e comunicados operacionais da GSA.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {notices.map((notice) => (
          <Card
            key={notice.id}
            onClick={() => { void openNotice(notice); }}
            style={{ padding: 24, cursor: notice.remote && notice.target ? 'pointer' : 'default' }}
          >
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: notice.type === 'important' ? '#fef2f2' : notice.type === 'feature' ? '#eff6ff' : '#f8fafc', color: notice.type === 'important' ? '#ef4444' : notice.type === 'feature' ? '#2563eb' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {notice.type === 'important' ? <AlertCircle size={18} /> : notice.type === 'feature' ? <Sparkles size={18} /> : <Info size={18} />}
                </div>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{notice.title}</h2>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, fontSize: 12, color: '#64748b' }}>
                    <span>{notice.category}</span><span>•</span><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> {notice.date}</span>
                  </div>
                </div>
              </div>
              {notice.remote && notice.unread && <span className="pill pill--blue" style={{ fontSize: 11 }}><Bell size={12} /> Nova</span>}
              {notice.remote && !notice.unread && <span className="pill pill--gray" style={{ fontSize: 11 }}><Check size={12} /> Lida</span>}
              {!notice.remote && <span className={`pill pill--${notice.type === 'important' ? 'red' : notice.type === 'feature' ? 'blue' : 'gray'}`} style={{ fontSize: 11 }}>{notice.type === 'important' ? 'Importante' : notice.type === 'feature' ? 'Novidade' : 'Informativo'}</span>}
            </div>

            <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, paddingLeft: 42 }}>{notice.content}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ClientNotices;
