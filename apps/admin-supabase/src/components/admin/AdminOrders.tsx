import React, { useEffect, useState } from 'react';
import {
  Calendar,
  GripVertical,
  MoreVertical,
  Plus,
  Info,
  Paperclip,
  Check,
  ChevronDown,
  Search,
  ArrowLeft,
  ListChecks,
  UserCheck,
  Clock,
  ChevronRight,
  Filter, FileText
  ,Trash2, ArrowUp, ArrowDown, Settings
} from 'lucide-react';
import { Order, Stage } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import { api, isDemoMode } from '../../api';

export interface AdminOrdersProps {
  order?: Order;
  onSave?: (updatedOrder: Order) => void;
  onBack?: () => void;
  routeDetail?: string | null;
  onOpenOrder?: (code: string) => void;
  onCloseOrder?: () => void;
}

export function AdminOrders({ order: initialOrder, onSave, onBack, routeDetail, onOpenOrder, onCloseOrder }: AdminOrdersProps) {
  // Mode: 'list' (default table view) | 'flow' (stage builder matching Image 1)
  const [viewMode, setViewMode] = useState<'list' | 'flow'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Em andamento' | 'Concluída' | 'Pendente'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'Alta' | 'Urgente' | 'Normal'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ client: isDemoMode ? '108' : '', title: '', description: '', startDate: '', type: 'OS Única', priority: 'Normal' });
  const [clients, setClients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [rpsList, setRpsList] = useState<any[]>([]);

  // List of Orders
  const [ordersList, setOrdersList] = useState<Order[]>(isDemoMode ? [
    {
      id: 105,
      code: 'OS105',
      clientId: 108,
      serviceId: 101,
      rpsId: 100,
      rpsName: 'João Carlos da Silva',
      title: 'Abertura de empresa',
      description:
        'Serviço de abertura de empresa com acompanhamento completo até a entrega dos documentos finais.',
      type: 'OS Única',
      priority: 'Alta',
      status: 'Em andamento',
      start: '2026-10-01',
      end: '2026-10-30',
      total: 250000,
      stages: [
        {
          id: '1',
          name: 'Recebimento da documentação',
          deadlineDays: '2 dias',
          status: 'Em andamento',
          internalNote: 'Verificar se todos os documentos estão legíveis.',
          description: 'Receber e verificar a documentação inicial enviada pelo cliente.',
          clientUpdate: 'Documentação recebida e em análise.'
        },
        {
          id: '2',
          name: 'Conferência dos documentos',
          deadlineDays: '3 dias',
          status: 'Pendente',
          internalNote: 'Validar pendências no checklist interno.',
          description: 'Conferir a documentação e validar informações com os órgãos competentes.',
          clientUpdate: 'Documentos em conferência.'
        },
        {
          id: '3',
          name: 'Protocolo no órgão responsável',
          deadlineDays: '5 dias',
          status: 'Pendente',
          internalNote: 'Anexar o comprovante de protocolo ao processo.',
          description:
            'Protocolar a solicitação junto ao órgão responsável (e.g. Junta Comercial, Prefeitura, Receita Federal).',
          clientUpdate: 'Processo protocolado no órgão responsável.'
        },
        {
          id: '4',
          name: 'Acompanhamento do processo',
          deadlineDays: '15 dias',
          status: 'Pendente',
          internalNote: 'Monitorar diariamente e registrar todas as movimentações.',
          description: 'Acompanhar o andamento e responder eventuais diligências.',
          clientUpdate: 'Processo em andamento junto ao órgão.'
        },
        {
          id: '5',
          name: 'Emissão dos documentos finais',
          deadlineDays: '5 dias',
          status: 'Pendente',
          internalNote: 'Conferir dados da empresa antes de enviar ao cliente.',
          description: 'Receber e revisar os documentos finais emitidos pelo órgão competente.',
          clientUpdate: 'Documentos finais em emissão.'
        },
        {
          id: '6',
          name: 'Serviço concluído',
          deadlineDays: '3 dias',
          status: 'Pendente',
          internalNote: 'Confirmar recebimento com o cliente e arquivar processo.',
          description: 'Entrega dos documentos ao cliente e encerramento.',
          clientUpdate: 'Serviço concluído. Documentos entregues.'
        }
      ]
    },
    {
      id: 108,
      code: 'OS108',
      clientId: 105,
      serviceId: 102,
      rpsId: 101,
      rpsName: 'Ana Martins',
      title: 'Alteração Contratual de Sócios',
      description: 'Alteração de quadro societário e inclusão de novas atividades econômicas.',
      type: 'OS Única',
      priority: 'Normal',
      status: 'Em andamento',
      start: '2026-09-20',
      end: '2026-10-18',
      total: 180000,
      stages: [
        { id: '1', name: 'Coleta de assinaturas', status: 'Concluída' },
        { id: '2', name: 'Junta Comercial', status: 'Concluída' },
        { id: '3', name: 'Receita Federal', status: 'Em andamento' }
      ]
    },
    {
      id: 109,
      code: 'OS109',
      clientId: 102,
      serviceId: 104,
      rpsId: 102,
      rpsName: 'Mariana Souza',
      title: 'BPO Fiscal & Contábil Mensal',
      description: 'Rotina mensal de apuração fiscal e conformidade tributária.',
      type: 'OS Recorrente',
      priority: 'Normal',
      status: 'Em andamento',
      start: '2026-01-01',
      total: 150000,
      stages: [
        { id: '1', name: 'Fechamento Fiscal', status: 'Em andamento' },
        { id: '2', name: 'Emissão de Guias DAS', status: 'Pendente' }
      ]
    },
    {
      id: 104,
      code: 'OS104',
      clientId: 109,
      serviceId: 103,
      rpsId: 100,
      rpsName: 'João Carlos da Silva',
      title: 'Encerramento e Baixa de Filial',
      description: 'Baixa completa de CNPJ e certidões negativas.',
      type: 'OS Única',
      priority: 'Urgente',
      status: 'Concluída',
      start: '2026-09-01',
      end: '2026-09-28',
      total: 220000,
      stages: [
        { id: '1', name: 'Distrato Social', status: 'Concluída' },
        { id: '2', name: 'Baixa CNPJ', status: 'Concluída' },
        { id: '3', name: 'Certidões', status: 'Concluída' }
      ]
    }
  ] : []);

  const reloadOrders = async () => {
    try {
      const state = await api('/state');
      if (Array.isArray(state.orders)) setOrdersList(state.orders as Order[]);
      if (Array.isArray(state.clients)) {
        setClients(state.clients);
        const firstActiveClient = state.clients.find((client: any) => client.active !== false);
        if (firstActiveClient) {
          setCreateForm((current) => ({ ...current, client: current.client || String(firstActiveClient.id) }));
        }
      }
      if (Array.isArray(state.services)) setServices(state.services);
      if (Array.isArray(state.rps)) setRpsList(state.rps);
    } catch {
      // Keep the seeded list available if the server is temporarily offline.
    }
  };
  useEffect(() => {
    void reloadOrders();
    const handleReload = () => { void reloadOrders(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  // Selected Order for stage flow builder
  const [selectedOrder, setSelectedOrder] = useState<Order>((ordersList[0] || initialOrder) as Order);
  React.useEffect(() => {
    const matchingOrder = routeDetail && ordersList.find((order) => order.code === routeDetail);
    if (matchingOrder) setSelectedOrder(matchingOrder);
    setViewMode(matchingOrder ? 'flow' : 'list');
  }, [routeDetail, ordersList]);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [activeStageIdx, setActiveStageIdx] = useState<number | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState('');
  const [updateDraft, setUpdateDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [updateDate, setUpdateDate] = useState('');
  const [noteDate, setNoteDate] = useState('');
  
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; action: () => void }>({ open: false, title: '', message: '', action: () => {} });
  const [promptState, setPromptState] = useState<{ open: boolean; title: string; label: string; value: string; action: (val: string) => void }>({ open: false, title: '', label: '', value: '', action: () => {} });

  const clientNameFor = (clientId: number | string) => {
    const client = clients.find((item) => String(item.id) === String(clientId));
    return client?.name || `Cliente CL${clientId}`;
  };

  const handleStageChange = (index: number, field: keyof Stage, value: any) => {
    setSelectedOrder((current) => {
      const updatedStages = [...current.stages];
      updatedStages[index] = { ...updatedStages[index], [field]: value };
      return { ...current, stages: updatedStages };
    });
  };

  const handleAddStage = () => {
    const newStage: Stage = {
      id: String(selectedOrder.stages.length + 1),
      name: `Nova etapa ${selectedOrder.stages.length + 1}`,
      deadlineDays: '3 dias',
      status: 'Em andamento',
      internalNote: '',
      description: '',
      clientUpdate: ''
    };
    setSelectedOrder({ ...selectedOrder, stages: [...selectedOrder.stages, newStage] });
  };

  const handleRemoveStage = (index: number) => {
    if (selectedOrder.stages.length <= 1) return;
    setConfirmState({
      open: true,
      title: 'Excluir etapa',
      message: 'Excluir esta etapa do fluxo? Esta ação não pode ser desfeita.',
      action: () => {
        setSelectedOrder({ ...selectedOrder, stages: selectedOrder.stages.filter((_, stageIndex) => stageIndex !== index) });
        setConfirmState(prev => ({ ...prev, open: false }));
      }
    });
  };

  const handleMoveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedOrder.stages.length) return;
    const stages = [...selectedOrder.stages];
    [stages[index], stages[target]] = [stages[target], stages[index]];
    setSelectedOrder({ ...selectedOrder, stages });
  };

  const handleSave = async () => {
    const allStagesComplete = selectedOrder.stages.length > 0 && selectedOrder.stages.every((stage) => stage.status === 'Concluída');
    const orderToSave: Order = {
      ...selectedOrder,
      status: allStagesComplete ? 'Concluída' : selectedOrder.status,
      stages: selectedOrder.stages.map((stage) => ({
        ...stage,
        completedAt: stage.status === 'Concluída' ? (stage.completedAt || new Date().toISOString().slice(0, 10)) : stage.completedAt
      }))
    };
    setSelectedOrder(orderToSave);
    try {
      await api(`/orders/${orderToSave.id}`, { stages: orderToSave.stages, status: orderToSave.status }, 'PATCH');
      await reloadOrders();
    } catch {
      // The local state is still updated below so the editor remains usable.
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setToastMessage('Fluxo da OS salvo com sucesso!');
      // Update in list
      setOrdersList(ordersList.map((o) => (o.id === orderToSave.id ? orderToSave : o)));
      setTimeout(() => {
        setToastMessage(null);
        setViewMode('list');
        onCloseOrder?.();
      }, 1500);
      onSave?.(orderToSave);
    }, 400);
  };

  const handleOpenFlow = (ord: Order) => {
    setSelectedOrder(ord);
    setViewMode('flow');
    onOpenOrder?.(ord.code);
  };

  const handleCreateNewOS = () => {
    setIsCreateModalOpen(true);
  };

  const handleSaveNewOS = async () => {
    if (!isDemoMode && !createForm.client) {
      setToastMessage('Cadastre um cliente antes de criar a Ordem de Serviço.');
      return;
    }
    const newOS: Order = {
      id: Date.now(),
      code: `OS${Math.floor(Math.random() * 1000) + 200}`,
      clientId: Number(createForm.client) || 108,
      serviceId: Number(services[0]?.id || 101),
      rpsId: Number(rpsList[0]?.id || 100),
      rpsName: rpsList[0]?.name || 'Responsável operacional',
      title: createForm.title || 'Novo Serviço Operacional',
      description: createForm.description || 'Descrição do novo serviço solicitado pelo cliente.',
      type: createForm.type as any,
      priority: createForm.priority as any,
      status: 'Em andamento',
      start: createForm.startDate || '2026-10-02',
      end: '2026-11-02',
      total: 200000,
      stages: [
        {
          id: '1',
          name: 'Coleta inicial e checklist',
          deadlineDays: '2 dias',
          status: 'Em andamento',
          internalNote: 'Conferir documentação básica.',
          description: 'Recebimento de dados do cliente.',
          clientUpdate: 'Início da execução.'
        }
      ]
    };
    try {
      const result = await api('/orders', newOS);
      const state = await api('/state');
      const persisted = (state.orders || []).find((item: any) => String(item.id) === String(result.id));
      const nextOrder = persisted || newOS;
      setOrdersList((current) => [nextOrder, ...current.filter((item) => String(item.id) !== String(nextOrder.id))]);
      setSelectedOrder(nextOrder);
    } catch {
      setOrdersList((current) => [newOS, ...current]);
      setSelectedOrder(newOS);
    }
    setIsCreateModalOpen(false);
    setViewMode('flow');
    onOpenOrder?.(newOS.code);
  };

  const filteredOrders = ordersList.filter((o) => {
    const matchesSearch =
      o.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.rpsName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || o.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#10b981',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontWeight: 600,
            fontSize: 14
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: LISTAGEM DE ORDENS DE SERVIÇO (Default View) */}
      {/* ========================================================================= */}
      {viewMode === 'list' ? (
        <div>
          {/* Header */}
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 className="page-title">Ordens de Serviço</h1>
              <p className="page-subtitle">
                Acompanhe e gerencie as ordens em execução, prazos, fluxo de etapas e entregas operacionais.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={16} />}
              onClick={handleCreateNewOS}
            >
              Nova Ordem de Serviço
            </Button>
          </div>

          {/* Search and Filters Bar */}
          <div className="responsive-row admin-orders-filters" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div className="topbar-search-wrap" style={{ maxWidth: 380 }}>
              <input
                type="text"
                className="topbar-search-input"
                placeholder="Buscar por código (OS105), serviço ou RPS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={16} className="topbar-search-icon" />
            </div>

            <div className="responsive-row admin-orders-filter-groups" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className="responsive-row admin-orders-filter-group" style={{ display: 'flex', gap: 6 }}>
                {(['all', 'Em andamento', 'Concluída'] as const).map((st) => (
                  <Button
                    key={st}
                    variant={statusFilter === st ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setStatusFilter(st)}
                  >
                    {st === 'all' ? 'Todos os Status' : st}
                  </Button>
                ))}
              </div>

              <div style={{ height: 28, width: 1, background: '#e2e8f0', margin: 'auto 4px' }} />

              <div className="responsive-row admin-orders-filter-group" style={{ display: 'flex', gap: 6 }}>
                {(['all', 'Urgente', 'Alta', 'Normal'] as const).map((pr) => (
                  <Button
                    key={pr}
                    variant={priorityFilter === pr ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setPriorityFilter(pr)}
                  >
                    {pr === 'all' ? 'Todas as Prioridades' : pr}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Lista de ordens de serviço" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Código</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Serviço / Título da OS</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Cliente</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Tipo</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Prioridade</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Responsável (RPS)</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Etapas</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => {
                  const doneStages = ord.stages.filter((s) => s.status === 'Concluída').length;
                  const totalStages = ord.stages.length;
                  const percent = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0;

                  return (
                    <tr
                      key={ord.id}
                      className="admin-order-card"
                      onClick={() => handleOpenFlow(ord)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        transition: 'background 150ms ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td data-label="Código" style={{ padding: '16px 20px' }}>
                        <span className="pill pill--blue" style={{ fontSize: 12, fontWeight: 800 }}>
                          {ord.code}
                        </span>
                      </td>

                      <td data-label="Serviço" style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{ord.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          Início: {ord.start} {ord.end ? `• Prazo: ${ord.end}` : '• Recorrente'}
                        </div>
                      </td>

                      <td data-label="Cliente" style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {clientNameFor(ord.clientId)}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>CL{ord.clientId}</div>
                      </td>

                      <td data-label="Tipo" style={{ padding: '16px 20px' }}>
                        <span className="pill pill--gray" style={{ fontSize: 11 }}>
                          {ord.type}
                        </span>
                      </td>

                      <td data-label="Prioridade" style={{ padding: '16px 20px' }}>
                        <span
                          className={`pill pill--${ord.priority === 'Urgente' || ord.priority === 'Alta' ? 'red' : 'gray'}`}
                          style={{ fontSize: 11 }}
                        >
                          {ord.priority}
                        </span>
                      </td>

                      <td data-label="Responsável" style={{ padding: '16px 20px' }}>
                        <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155' }}>
                          <UserCheck size={14} color="#2563eb" />
                          <span>{ord.rpsName || 'João Carlos da Silva'}</span>
                        </div>
                      </td>

                      <td data-label="Etapas" style={{ padding: '16px 20px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                          {doneStages} de {totalStages} ({percent}%)
                        </div>
                        <div style={{ width: 90, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${percent}%`,
                              background: percent === 100 ? '#10b981' : '#2563eb',
                              borderRadius: 3
                            }}
                          />
                        </div>
                      </td>

                      <td data-label="Status" style={{ padding: '16px 20px' }}>
                        <Badge
                          status={ord.status}
                          variant={ord.status === 'Concluída' ? 'green' : ord.status === 'Em andamento' ? 'yellow' : 'gray'}
                        />
                      </td>

                      <td data-label="Ações" style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Settings size={18} color="#64748b" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenFlow(ord);
                          }}
                          aria-label="Configurar Fluxo"
                          title="Configurar Fluxo"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </Card>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE 2: CONFIGURAÇÃO DO FLUXO DA OS (Image 1 Fidelity) */
        /* ========================================================================= */
        <div>
          {/* Back button to return to orders list */}
          <button
            type="button"
            className="back-btn"
            onClick={() => { setViewMode('list'); onCloseOrder?.(); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#2563eb',
              fontWeight: 700,
              fontSize: 13,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginBottom: 16
            }}
          >
            <ArrowLeft size={16} /> Voltar para listagem de Ordens de Serviço
          </button>

          {/* Header matching Image 1 */}
          <div style={{ marginBottom: 24 }}>
            <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="page-title">{selectedOrder.code} — {selectedOrder.title}</h1>
              <Badge status={selectedOrder.type} variant="blue" />
              <span className="pill pill--red">Prioridade: {selectedOrder.priority}</span>
              <Badge status={selectedOrder.status} variant="blue" />
            </div>
            <p className="page-subtitle" style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
              Cliente: CL{selectedOrder.clientId} — {clientNameFor(selectedOrder.clientId)}
            </p>
          </div>

          {/* 2-Column Grid */}
          <div className="layout-2col">
            {/* Left Column: Stage Flow Builder */}
            <div className="layout-2col-main">
              <div className="stage-builder-header">
                <h2 className="stage-builder-title">Cadastrar fluxo da OS</h2>
                <p className="stage-builder-subtitle">
                  Defina as etapas que compõem a execução deste serviço até a conclusão.
                </p>
              </div>

              <div className="stage-list">
                {selectedOrder.stages.map((stage, idx) => (
                  <div key={stage.id || idx} className="stage-card stage-card-collapsed" onClick={() => setActiveStageIdx(idx)}>
                    {/* Left drag and circle */}
                    <div className="stage-card-left">
                      <div className="stage-drag-handle">
                        <GripVertical size={16} />
                      </div>
                      <div className="stage-number-circle">{idx + 1}</div>
                      {idx < selectedOrder.stages.length - 1 && <div className="stage-card-connector" />}
                    </div>

                    {/* Main stage fields */}
                    <div className="stage-card-content">
                      <div className="stage-collapsed-summary"><strong>{stage.name || `Etapa ${idx + 1}`}</strong><span>{stage.status} · {stage.deadlineDays || 'Sem prazo'}</span></div>
                      <div className="stage-expanded-editor">
                      <div className="stage-row-1">
                        <div className="form-group stage-name-field">
                          <div className="stage-field-heading"><label className="form-label">Nome da etapa</label><div className="stage-actions" aria-label={`Ações da etapa ${idx + 1}`}><button type="button" title="Mover para cima" disabled={idx === 0} onClick={() => handleMoveStage(idx, -1)}><ArrowUp size={14} /></button><button type="button" title="Mover para baixo" disabled={idx === selectedOrder.stages.length - 1} onClick={() => handleMoveStage(idx, 1)}><ArrowDown size={14} /></button><button type="button" title="Excluir etapa" disabled={selectedOrder.stages.length <= 1} onClick={() => handleRemoveStage(idx)}><Trash2 size={14} /></button></div></div>
                          <input
                            type="text"
                            className="form-input"
                            value={stage.name}
                            onChange={(e) => handleStageChange(idx, 'name', e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Prazo previsto</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              className="form-input"
                              style={{ paddingLeft: 28 }}
                              value={stage.deadlineDays || ''}
                              onChange={(e) => handleStageChange(idx, 'deadlineDays', e.target.value)}
                            />
                            <Calendar
                              size={14}
                              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Status</label>
                          <select
                            className="form-input"
                            value={stage.status}
                            onChange={(e) => handleStageChange(idx, 'status', e.target.value)}
                          >
                            <option value="Em andamento">● Em andamento</option>
                            <option value="Pendente">● Pendente</option>
                            <option value="Concluída">● Concluída</option>
                            <option value="Não iniciada">● Não iniciada</option>
                          </select>
                        </div>
                      </div>

                      <div className="stage-row-2">
                        <div className="form-group">
                          <label className="form-label">Descrição</label>
                          <textarea
                            className="form-textarea"
                            value={stage.description || ''}
                            placeholder="Instruções e detalhamento da etapa."
                            onChange={(e) => handleStageChange(idx, 'description', e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Atualização para o cliente</label>
                          <textarea
                            className="form-textarea"
                            value={stage.clientUpdate || ''}
                            placeholder="Mensagem visível na linha do tempo do cliente."
                            onChange={(e) => handleStageChange(idx, 'clientUpdate', e.target.value)}
                          />
                        </div>
                      </div>

                      {selectedOrder.status === 'Em andamento' && stage.status === 'Em andamento' && (
                        <div className="stage-document-request">
                          <div className="stage-document-request-copy">
                            <FileText size={16} />
                            <div><strong>Documento necessário para concluir esta etapa</strong><span>Solicite ao cliente o arquivo que está pendente.</span></div>
                          </div>
                          <input className="form-input" value={stage.requestedDocument || ''} placeholder="Ex.: Contrato social assinado" onChange={(e) => handleStageChange(idx, 'requestedDocument', e.target.value)} />
                        </div>
                      )}

                      {/* Yellow Callout: Nota interna */}
                      <div className="callout-internal-note">
                        <Info size={16} className="callout-internal-note-icon" />
                        <div style={{ flex: 1 }}>
                          <div className="callout-internal-note-title">
                            Nota interna (não aparece para o cliente)
                          </div>
                          <input
                            type="text"
                            style={{
                              width: '100%',
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              fontSize: 13,
                              color: '#78350f'
                            }}
                            value={stage.internalNote || ''}
                            placeholder="Adicione observações sigilosas para a equipe interna..."
                            onChange={(e) => handleStageChange(idx, 'internalNote', e.target.value)}
                          />
                        </div>
                  <button
                          type="button"
                    onClick={() => setAttachModalOpen(true)}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline-blue"
                size="md"
                icon={<Plus size={16} />}
                onClick={handleAddStage}
                style={{ width: 'fit-content' }}
              >
                Adicionar etapa
              </Button>
            </div>

            {/* Right Column: Resumo da OS and Widgets (Image 1) */}
            <div className="layout-2col-rail">
              {/* Resumo da OS */}
              <div className="rail-widget">
                <h3 className="rail-widget-title">Resumo da OS</h3>
                <div className="rail-meta-row">
                  <span className="rail-meta-label">Código da OS</span>
                  <span className="rail-meta-val">{selectedOrder.code}</span>
                </div>
                <div className="rail-meta-row">
                  <span className="rail-meta-label">Serviço</span>
                  <span className="rail-meta-val">{selectedOrder.title}</span>
                </div>
                <div className="rail-meta-row">
                  <span className="rail-meta-label">Cliente</span>
                  <span className="rail-meta-val">CL{selectedOrder.clientId} — {clientNameFor(selectedOrder.clientId)}</span>
                </div>
                <div className="rail-meta-row">
                  <span className="rail-meta-label">Tipo</span>
                  <span className="rail-meta-val">{selectedOrder.type}</span>
                </div>
                <div className="rail-meta-row">
                  <span className="rail-meta-label">Prioridade</span>
                  <span className="pill pill--red" style={{ padding: '2px 8px', fontSize: 11 }}>
                    {selectedOrder.priority}
                  </span>
                </div>
                <div className="rail-meta-row">
                  <span className="rail-meta-label">Status</span>
                  <span className="pill pill--blue" style={{ padding: '2px 8px', fontSize: 11 }}>
                    {selectedOrder.status}
                  </span>
                </div>
              </div>

              {/* Responsável pelo serviço */}
              <div className="rail-widget">
                <h3 className="rail-widget-title">Responsável pelo serviço</h3>
                <div className="form-group">
                  <select
                    className="form-input"
                    value={selectedOrder.rpsId}
                    onChange={(e) => setSelectedOrder({ ...selectedOrder, rpsId: Number(e.target.value) })}
                  >
                    <option value={100}>RPS100 — João Carlos da Silva</option>
                    <option value={101}>RPS101 — Ana Martins</option>
                  </select>
                </div>
                <div className="rail-date-boxes">
                  <div className="rail-date-box">
                    <Calendar size={18} />
                    <div className="rail-date-box-content">
                      <span className="rail-date-box-label">Início</span>
                      <span className="rail-date-box-val">{selectedOrder.start || '01/10/2026'}</span>
                    </div>
                  </div>
                  <div className="rail-date-box">
                    <Calendar size={18} />
                    <div className="rail-date-box-content">
                      <span className="rail-date-box-label">Prazo</span>
                      <span className="rail-date-box-val">{selectedOrder.end || '30 dias'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Observações da OS */}
              <div className="rail-widget">
                <h3 className="rail-widget-title">Observações da OS</h3>
                <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                  {selectedOrder.description}
                </p>
              </div>

              {/* Arquivos relacionados */}
              <div className="rail-widget">
                <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Paperclip size={16} color="#64748b" />
                    <h3 className="rail-widget-title" style={{ margin: 0 }}>Arquivos relacionados</h3>
                  </div>
                  <ChevronDown size={16} color="#94a3b8" />
                </div>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: '12px 0 8px' }}>
                  — Nenhum arquivo anexado.
                </p>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Paperclip size={14} /> Anexar arquivos
                </button>
              </div>

              {/* Callout Sobre as notas internas */}
              <div className="callout-info-blue">
                <Info size={16} className="callout-info-blue-icon" />
                <div>
                  <div className="callout-info-blue-title">Sobre as notas internas</div>
                  <div className="callout-info-blue-text">
                    As notas internas são de uso exclusivo da equipe e não são exibidas para o cliente.
                  </div>
                </div>
              </div>

              {/* Action buttons (Image 1) */}
              <div className="responsive-row" style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <Button
                  variant="secondary"
                  size="md"
                  style={{ flex: 1 }}
                  onClick={() => { setViewMode('list'); onCloseOrder?.(); }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  style={{ flex: 1 }}
                  onClick={handleSave}
                  disabled={saving}
                  icon={<Check size={16} />}
                >
                  {saving ? 'Salvando...' : 'Salvar fluxo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <Modal open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Nova Ordem de Serviço">
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>Preencha os dados básicos para iniciar uma nova Ordem de Serviço.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cliente</label>
              <select className="form-select" value={createForm.client} onChange={e => setCreateForm({...createForm, client: e.target.value})}>
                {isDemoMode ? <>
                  <option value="102">Empresa Alfa Ltda (Matriz)</option>
                  <option value="108">Empresa Alfa Ltda (Serviços)</option>
                  <option value="103">Mariana Costa Silva</option>
                </> : clients.filter((client) => client.active !== false).map((client) => (
                  <option key={client.id} value={client.id}>{client.name} — {client.code}</option>
                ))}
                {!isDemoMode && clients.length === 0 && <option value="" disabled>Nenhum cliente disponível</option>}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Título da OS</label>
              <input className="form-input" placeholder="Ex: Abertura de Filial" value={createForm.title} onChange={e => setCreateForm({...createForm, title: e.target.value})} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Descrição</label>
              <textarea className="form-textarea" placeholder="Descreva o escopo da OS" value={createForm.description} onChange={e => setCreateForm({...createForm, description: e.target.value})} />
            </div>
            
            <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tipo</label>
                <select className="form-select" value={createForm.type} onChange={e => setCreateForm({...createForm, type: e.target.value})}>
                  <option value="OS Única">OS Única</option>
                  <option value="OS Recorrente">OS Recorrente</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Prioridade</label>
                <select className="form-select" value={createForm.priority} onChange={e => setCreateForm({...createForm, priority: e.target.value})}>
                  <option value="Normal">Normal</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data de Início</label>
                <input type="date" className="form-input" value={createForm.startDate} onChange={e => setCreateForm({...createForm, startDate: e.target.value})} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" style={{ flex: 2 }} onClick={handleSaveNewOS}>Continuar para Escopo</Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal className="modal-dialog--stage-detail" open={activeStageIdx !== null} onClose={() => setActiveStageIdx(null)} title={activeStageIdx !== null ? `Detalhes da etapa ${activeStageIdx + 1}` : 'Detalhes da etapa'}>
        {activeStageIdx !== null && (() => { const stage = selectedOrder.stages[activeStageIdx]; const idx = activeStageIdx; return <div className="stage-detail-modal">
          <div className="stage-detail-heading"><span className="stage-number-circle">{idx + 1}</span><div><strong>{stage.name}</strong><small>Configure os dados desta etapa da OS.</small></div></div>
          <div className="stage-detail-grid"><div className="form-group"><label className="form-label">Nome da etapa</label><input className="form-input" value={stage.name} onChange={e => handleStageChange(idx, 'name', e.target.value)} /></div><div className="form-group"><label className="form-label">Prazo previsto</label><input className="form-input" value={stage.deadlineDays || ''} onChange={e => handleStageChange(idx, 'deadlineDays', e.target.value)} /></div></div>
          <div className="form-group"><label className="form-label">Status</label><select className="form-input" value={stage.status} onChange={e => handleStageChange(idx, 'status', e.target.value)}><option>Em andamento</option><option>Pendente</option><option>Concluída</option><option>Não iniciada</option></select></div>
          <div className="form-group stage-description-field"><label className="form-label">Descrição</label><textarea className="form-textarea" value={stage.description || ''} onChange={e => handleStageChange(idx, 'description', e.target.value)} /></div>
          <div className="stage-communication-grid"><div className="form-group"><label className="form-label">Atualizações para o cliente</label><div className="timeline-composer"><textarea className="form-textarea" value={updateDraft} placeholder="Escreva uma atualização..." onChange={e => setUpdateDraft(e.target.value)} /><label className="timeline-date-label">Data e horário <input type="datetime-local" value={updateDate} onChange={e => setUpdateDate(e.target.value)} /></label><button type="button" onClick={() => { if (!updateDraft.trim()) return; handleStageChange(idx, 'clientUpdates', [...(stage.clientUpdates || []), { id: Date.now(), text: updateDraft.trim(), date: updateDate ? new Date(updateDate).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR') }]); setUpdateDraft(''); setUpdateDate(''); }}>Adicionar atualização</button></div><div className="timeline-list">{(stage.clientUpdates || []).map(item => <div className="timeline-item" key={item.id}><div className="timeline-item-content"><span>{item.text}</span><time>{item.date}</time></div><div className="timeline-item-actions"><button type="button" onClick={() => { const value = window.prompt('Editar lançamento', item.text); if (value?.trim()) handleStageChange(idx, 'clientUpdates', (stage.clientUpdates || []).map(entry => entry.id === item.id ? { ...entry, text: value.trim() } : entry)); }}>Editar</button><button type="button" onClick={() => { setConfirmState({ open: true, title: 'Confirmar ação', message: 'Excluir esta atualização?', action: () => { handleStageChange(idx, 'clientUpdates', (stage.clientUpdates || []).filter(entry => entry.id !== item.id)); setConfirmState(prev => ({...prev, open: false})); }}); }}>Excluir</button></div></div>)}</div></div>          <div className="form-group"><label className="form-label">Notas internas</label><div className="timeline-composer timeline-composer-internal"><textarea className="form-textarea" value={noteDraft} placeholder="Registre uma nota interna..." onChange={e => setNoteDraft(e.target.value)} /><label className="timeline-date-label">Data e horário <input type="datetime-local" value={noteDate} onChange={e => setNoteDate(e.target.value)} /></label><button type="button" onClick={() => { if (!noteDraft.trim()) return; handleStageChange(idx, 'internalNotes', [...(stage.internalNotes || []), { id: Date.now(), text: noteDraft.trim(), date: noteDate ? new Date(noteDate).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR') }]); setNoteDraft(''); setNoteDate(''); }}>Adicionar nota</button></div><div className="timeline-list">{(stage.internalNotes || []).map(item => <div className="timeline-item timeline-item-internal" key={item.id}><div className="timeline-item-content"><span>{item.text}</span><time>{item.date}</time></div><div className="timeline-item-actions"><button type="button" onClick={() => { const value = window.prompt('Editar nota interna', item.text); if (value?.trim()) handleStageChange(idx, 'internalNotes', (stage.internalNotes || []).map(entry => entry.id === item.id ? { ...entry, text: value.trim() } : entry)); }}>Editar</button><button type="button" onClick={() => { setConfirmState({ open: true, title: 'Confirmar ação', message: 'Excluir esta nota?', action: () => { handleStageChange(idx, 'internalNotes', (stage.internalNotes || []).filter(entry => entry.id !== item.id)); setConfirmState(prev => ({...prev, open: false})); }}); }}>Excluir</button></div></div>)}</div></div>
          </div>
          <div className="form-group"><label className="form-label">Documentos necessários</label><div className="document-board"><div className="document-board-column document-board-pending"><div className="document-board-title">Solicitar documento <span>Pendente</span></div><div className="document-request-list">{(stage.requestedDocuments || []).filter(doc => doc.status === 'pending').map(doc => <div className="document-request-item" key={doc.id}><span>{doc.name}{stage.requestedDocumentReason && <small className="document-rejection-reason">Motivo: {stage.requestedDocumentReason}</small>}</span><button type="button" className="document-delete-button" onClick={() => { setConfirmState({ open: true, title: 'Confirmar ação', message: 'Excluir esta solicitação?', action: () => { handleStageChange(idx, 'requestedDocuments', (stage.requestedDocuments || []).filter(item => item.id !== doc.id)); setConfirmState(prev => ({...prev, open: false})); }}); }}>Excluir</button></div>)}</div><button type="button" onClick={() => { setRequestDraft(''); setRequestModalOpen(true); }}>+ Solicitar outro documento</button></div><div className="document-board-column document-board-analysis"><div className="document-board-title">Em análise</div><p>{stage.requestedDocumentStatus === 'analysis' || stage.requestedDocumentStatus === 'approved' ? stage.requestedDocument : 'Aguardando envio do cliente.'}</p>{stage.requestedDocumentStatus === 'pending' && <button type="button" onClick={() => { handleStageChange(idx, 'requestedDocumentStatus', 'analysis'); handleStageChange(idx, 'requestedDocumentFile', 'Documento reenviado pelo cliente'); }}>Marcar recebido</button>}</div><div className="document-board-column document-board-approved"><div className="document-board-title">Aprovado</div><p>{stage.requestedDocumentStatus === 'approved' ? stage.requestedDocumentFile || stage.requestedDocument : 'Ainda não aprovado.'}</p>{stage.requestedDocumentStatus === 'analysis' && <div className="document-review-actions"><button type="button" onClick={() => handleStageChange(idx, 'requestedDocumentStatus', 'approved')}>Aprovar</button><button type="button" className="document-reject-button" onClick={() => { setPromptState({ open: true, title: 'Informe o motivo da reprovação', label: 'Informe o motivo da reprovação', value: '', action: (reason) => { if (reason?.trim()) {  handleStageChange(idx, 'requestedDocumentStatus', 'pending'); handleStageChange(idx, 'requestedDocumentReason', reason.trim()); } setPromptState(prev => ({...prev, open: false})); }}); }}>Reprovar</button></div>}</div></div></div>
          <div className="stage-detail-actions"><Button variant="secondary" onClick={() => setActiveStageIdx(null)}>Cancelar</Button><Button icon={<Check size={16} />} onClick={() => { setOrdersList(ordersList.map(o => o.id === selectedOrder.id ? selectedOrder : o)); setActiveStageIdx(null); setToastMessage('Etapa salva com sucesso.'); setTimeout(() => setToastMessage(null), 1800); }}>Salvar etapa</Button></div>
        </div>; })()}
      </Modal>

      <Modal open={requestModalOpen} onClose={() => setRequestModalOpen(false)} title="Solicitar documento"><div className="document-request-modal"><p className="document-request-modal-help">Informe o nome do documento que será solicitado ao cliente.</p><label className="form-label">Nome do documento</label><input autoFocus className="form-input" value={requestDraft} placeholder="Ex.: Contrato social assinado" onChange={e => setRequestDraft(e.target.value)} /><div className="stage-detail-actions"><Button variant="secondary" onClick={() => setRequestModalOpen(false)}>Cancelar</Button><Button disabled={!requestDraft.trim()} onClick={() => { if (activeStageIdx === null) return; handleStageChange(activeStageIdx, 'requestedDocuments', [...(selectedOrder.stages[activeStageIdx].requestedDocuments || []), { id: Date.now(), name: requestDraft.trim(), status: 'pending' }]); setRequestModalOpen(false); }}>Confirmar solicitação</Button></div></div></Modal>

      <Modal open={attachModalOpen} onClose={() => setAttachModalOpen(false)} title="Anexar arquivos à OS">
        <div className="os-attachment-modal">
          <div className="os-attachment-intro"><Paperclip size={18} /><span>Arquivos relacionados à execução desta ordem de serviço.</span></div>
          <label className="form-label">Selecione os arquivos</label>
          <input className="form-input" type="file" multiple onChange={(e) => setAttachedFiles(Array.from(e.target.files || []).map((file) => file.name))} />
          {attachedFiles.length > 0 && <div className="os-attachment-list">{attachedFiles.map((file) => <div key={file}><FileText size={15} />{file}</div>)}</div>}
          <div className="os-attachment-actions"><Button variant="secondary" onClick={() => setAttachModalOpen(false)}>Cancelar</Button><Button disabled={!attachedFiles.length} onClick={() => { setAttachModalOpen(false); setToastMessage('Arquivos anexados à OS.'); setTimeout(() => setToastMessage(null), 1800); }}>Salvar anexos</Button></div>
        </div>
      </Modal>
      <Modal open={confirmState.open} onClose={() => setConfirmState(prev => ({ ...prev, open: false }))} title={confirmState.title}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#fef2f2', padding: 16, borderRadius: 8, border: '1px solid #fecaca' }}>
          <p style={{ fontSize: 14, color: '#991b1b', margin: 0 }}>{confirmState.message}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setConfirmState(prev => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button variant="danger" style={{ flex: 2 }} onClick={confirmState.action}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={promptState.open} onClose={() => setPromptState(prev => ({ ...prev, open: false }))} title={promptState.title}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{promptState.label}</label>
            <input className="form-input" value={promptState.value} onChange={e => setPromptState(prev => ({ ...prev, value: e.target.value }))} autoFocus />
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setPromptState(prev => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button variant="primary" style={{ flex: 2 }} onClick={() => promptState.action(promptState.value)}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default AdminOrders;
