import React from 'react';
import { Calendar, Clock, UserCheck, ChevronRight, ArrowLeft, BriefcaseBusiness } from 'lucide-react';
import { Order } from '../../types';
import Stepper from '../ui/Stepper';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import { api, isDemoMode } from '../../api';

export interface ClientOrdersProps {
  order?: Order;
  onBack?: () => void;
  routeDetail?: string | null;
  onOpenOrder?: (code: string) => void;
  onCloseOrder?: () => void;
}

export function ClientOrders({ order: propOrder, routeDetail, onOpenOrder, onCloseOrder }: ClientOrdersProps) {
  // Sample data matching Images 3 and 4
  const fallbackOrder: Order = propOrder || {
    id: 105,
    code: 'OS105',
    clientId: 108,
    serviceId: 101,
    title: 'Abertura de empresa',
    type: 'OS Única',
    priority: 'Alta',
    status: 'Em andamento',
    rpsName: 'João Carlos da Silva',
    start: '2026-10-01',
    end: '2026-10-30',
    total: 153000,
    stages: [
      {
        id: '1',
        name: 'Recebimento da documentação',
        clientUpdate: 'Documentação inicial recebida e registrada no sistema.',
        description: 'Receber e verificar a documentação inicial enviada pelo cliente.',
        completedAt: '2026-10-02',
        status: 'Concluída'
      },
      {
        id: '2',
        name: 'Conferência dos documentos',
        clientUpdate: 'Documentos conferidos e validados conforme os requisitos.',
        description: 'Conferir a documentação e validar informações com os órgãos competentes.',
        completedAt: '2026-10-03',
        status: 'Concluída'
      },
      {
        id: '3',
        name: 'Protocolo no órgão responsável',
        clientUpdate: 'Protocolo em preparação para envio ao órgão responsável.',
        description: 'Protocolar a solicitação junto à Junta Comercial.',
        completedAt: null,
        status: 'Em andamento'
      },
      {
        id: '4',
        name: 'Acompanhamento do processo',
        clientUpdate: 'Aguardando protocolo para iniciar o acompanhamento no órgão.',
        description: 'Acompanhar o andamento e responder eventuais diligências.',
        completedAt: null,
        status: 'Não iniciada'
      },
      {
        id: '5',
        name: 'Emissão dos documentos finais',
        clientUpdate: 'Documentos finais em emissão.',
        description: 'Receber e revisar os documentos finais emitidos pelo órgão competente.',
        completedAt: null,
        status: 'Não iniciada'
      },
      {
        id: '6',
        name: 'Serviço concluído',
        clientUpdate: 'Entrega dos documentos ao cliente e encerramento da OS.',
        description: 'Entrega dos documentos ao cliente e encerramento.',
        completedAt: null,
        status: 'Não iniciada'
      }
    ],
    updates: [
      {
        date: '03/10/2026',
        text: 'Conferência dos documentos concluída',
        details: 'Documentos conferidos e validados conforme os requisitos.'
      },
      {
        date: '02/10/2026',
        text: 'Documentação recebida',
        details: 'Documentação inicial recebida e registrada no sistema.'
      },
      {
        date: '01/10/2026',
        text: 'Ordem de Serviço criada',
        details: 'Sua OS foi registrada e está em processamento.'
      }
    ]
  };

  const [remoteOrders, setRemoteOrders] = React.useState<Order[]>([]);
  React.useEffect(() => {
    const reload = async () => {
      try {
        const state = await api('/client-state');
        if (Array.isArray(state.orders)) setRemoteOrders(state.orders);
      } catch {
        // Keep the local fixture visible if the server is unavailable.
      }
    };
    void reload();
    window.addEventListener('gsa:reload', reload);
    return () => window.removeEventListener('gsa:reload', reload);
  }, []);
  const sampleOrder: Order | undefined = remoteOrders.find((item) => item.code === routeDetail) || remoteOrders[0] || propOrder || (isDemoMode ? fallbackOrder : undefined);
  const [selectedOrder, setSelectedOrder] = React.useState<Order | null>(routeDetail ? sampleOrder : propOrder ?? null);
  React.useEffect(() => {
    setSelectedOrder(routeDetail && sampleOrder && routeDetail === sampleOrder.code ? sampleOrder : null);
  }, [routeDetail, remoteOrders]);
  const order = selectedOrder ?? sampleOrder;
  if (!order) {
    return (
      <div className="client-orders-list-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="client-orders-list-heading">
          <div>
            <h1 className="page-title">Meus Serviços</h1>
            <p className="page-subtitle">Nenhuma Ordem de Serviço disponível no momento.</p>
          </div>
          <span className="client-orders-list-count">0 Serviços</span>
        </div>
      </div>
    );
  }
  const doneCount = order.stages.filter((s) => s.status === 'Concluída').length;
  const totalCount = order.stages.length;
  const progressPercent = Math.round((doneCount / totalCount) * 100);
  const remoteOrder = order as Order & { clientName?: string; clientCode?: string; client?: { name?: string; code?: string } };
  const displayClientName = remoteOrder.clientName || remoteOrder.client?.name || 'Cliente';
  const displayClientCode = remoteOrder.clientCode || remoteOrder.client?.code || `CL${order.clientId}`;

  if (!selectedOrder) {
    if (!sampleOrder) return null;
    return (
      <div className="client-orders-list-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="client-orders-list-heading">
          <div>
            <h1 className="page-title">Meus Serviços</h1>
            <p className="page-subtitle">Escolha uma Ordem de Serviço para acompanhar etapas, prazos e atualizações.</p>
          </div>
          <span className="client-orders-list-count">1 Serviço Ativo</span>
        </div>

        <button type="button" className="client-service-list-card" onClick={() => { setSelectedOrder(sampleOrder); onOpenOrder?.(sampleOrder.code); }}>
          <span className="client-service-list-icon"><BriefcaseBusiness size={23} /></span>
          <span className="client-service-list-content">
            <span className="client-service-list-topline">
              <strong>{sampleOrder.code}</strong>
              <Badge status={sampleOrder.status} />
            </span>
            <b>{sampleOrder.title}</b>
            <span>{(sampleOrder as Order & { clientName?: string; client?: { name?: string } }).clientName || (sampleOrder as Order & { client?: { name?: string } }).client?.name || 'Cliente'} · {sampleOrder.type}</span>
            <span className="client-service-list-progress">
              <i><em style={{ width: `${Math.round((sampleOrder.stages.filter((stage) => stage.status === 'Concluída').length / sampleOrder.stages.length) * 100)}%` }} /></i>
              {sampleOrder.stages.filter((stage) => stage.status === 'Concluída').length} de {sampleOrder.stages.length} etapas concluídas
            </span>
          </span>
          <span className="client-service-list-arrow"><ChevronRight size={19} /></span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <button type="button" className="client-orders-back" onClick={() => { setSelectedOrder(null); onCloseOrder?.(); }}>
        <ArrowLeft size={17} /> Voltar Para Meus Serviços
      </button>
      {/* Breadcrumbs (Image 3) */}
      <div className="breadcrumbs">
        <span>Ordens de Serviço</span>
        <span>&gt;</span>
        <span style={{ fontWeight: 600, color: '#0f172a' }}>{order.code}</span>
      </div>

      {/* Page Title */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Acompanhamento da OS</h1>
        <p className="page-subtitle">
          Acompanhe em tempo real o andamento da sua Ordem de Serviço, com todas as etapas e atualizações.
        </p>
      </div>

      {/* OS Summary Header Card (Image 3) */}
      <section className="order-summary" aria-label="Dados da ordem de serviço">
        <div className="order-summary-heading">
          <div className="order-summary-title-row">
            <span className="order-summary-code">{order.code}</span>
            <Badge status={order.status} />
          </div>
          <h2>{order.title}</h2>
          <div className="order-summary-client">
            <span>{displayClientCode} · {displayClientName}</span>
            <Badge status={order.type} variant="blue" />
          </div>
        </div>
        <dl className="order-summary-details">
          <div className="order-summary-owner">
            <dt><UserCheck size={15} /> Responsável pelo serviço</dt>
            <dd>{order.rpsName}</dd>
            <span className="order-summary-owner-code">RPS{order.rpsId ?? 100}</span>
          </div>
          <div className="order-summary-dates">
            <div className="order-summary-date-row order-summary-date-row--start">
              <dt><Calendar size={15} /> Data de início</dt>
              <dd>{order.start ? new Date(order.start + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</dd>
            </div>
            <div className="order-summary-timeline-connector" aria-hidden="true">
              <span className="timeline-connector-node timeline-connector-node--start" />
              <div className="timeline-connector-track">
                <span className="timeline-connector-beam" />
                <span className="timeline-connector-pulse-dot" />
              </div>
              <span className="timeline-connector-node timeline-connector-node--end" />
            </div>
            <div className="order-summary-date-row order-summary-date-row--end">
              <dt><Clock size={15} /> Prazo previsto</dt>
              <dd>{order.end ? new Date(order.end + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</dd>
            </div>
          </div>
        </dl>
      </section>

      <div className="layout-2col-main">
          {/* Progresso da OS (Compacto antes das Etapas) */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '12px 16px',
              marginBottom: 16,
              boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 750, color: '#0f172a' }}>Progresso da OS</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>• {doneCount} de {totalCount} concluídas</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 850, color: '#2563eb', whiteSpace: 'nowrap' }}>
                {progressPercent}%
              </span>
            </div>
            <div className="progress-bar-wrap" style={{ margin: '8px 0 2px' }}>
              <div
                className="progress-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <Card
            title="Etapas da Ordem de Serviço"
            subtitle="Veja o histórico completo e o que está acontecendo agora."
          >
            <Stepper stages={order.stages} interactive={true} />
          </Card>
      </div>
    </div>
  );
}

export default ClientOrders;
