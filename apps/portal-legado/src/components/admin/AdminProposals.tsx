import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ChevronDown, Eye, FileText, FileCheck2, Plus, Search, TrendingUp, Ban, Trash2, Pencil, Upload, X } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import { api, date as formatDate, dateTime } from '../../api';

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const revisionOrdinalLabel = (index: number) => {
  const labels = ['Primeira revisão', 'Segunda revisão', 'Terceira revisão'];
  return labels[index] || `${index + 1}ª revisão`;
};

const parseCents = (value: any) => {
  if (typeof value === 'number') return value;
  const normalized = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!normalized) return 0;
  const amount = normalized.includes(',')
    ? Number(normalized.replaceAll('.', '').replace(',', '.'))
    : Number(normalized);
  return Number.isFinite(amount) ? amount * 100 : 0;
};

const revisionViews = (proposal: any) => {
  if (!proposal?.revised) return [];
  const history = Array.isArray(proposal.revisionHistory) && proposal.revisionHistory.length
    ? proposal.revisionHistory
    : [{ previous: proposal.previousVersion, revisedAt: proposal.revisedAt }];

  return history
    .filter((entry: any) => entry?.previous)
    .map((entry: any, index: number) => {
      const revisedVersion = history[index + 1]?.previous || proposal;
      const discountType = revisedVersion.discountType || 'fixed';
      const discountInput = Number(revisedVersion.discountInput || 0);
      const discountAmount = Number(revisedVersion.discount || 0);
      return {
        ordinalLabel: revisionOrdinalLabel(index),
        revisedAtLabel: entry.revisedAt ? dateTime(entry.revisedAt) : '',
        previousTotalLabel: fmt(parseCents(entry.previous.total) / 100),
        previousStatus: entry.previous.status || '—',
        previousDate: entry.previous.date ? formatDate(entry.previous.date) : '—',
        discountRateLabel: discountType === 'percent' ? `${discountInput}%` : 'Valor fixo',
        discountAmountLabel: fmt(discountAmount / 100),
        totalLabel: fmt(parseCents(revisedVersion.total) / 100),
        status: revisedVersion.status || '—',
        dateLabel: formatDate(revisedVersion.updated || revisedVersion.updatedAt || revisedVersion.date)
      };
    });
};

const toViewProposal = (proposal: any, clients: any[]) => {
  const client = clients.find((item) => String(item.id) === String(proposal.clientId));
  const serviceName = proposal.service?.name || proposal.serviceName || proposal.title || 'Serviço';
  const revision = proposal.previousVersion || proposal.revisionHistory?.[proposal.revisionHistory.length - 1]?.previous;
  const discountInput = Number(proposal.discountInput || 0);
  const discountAmount = Number(proposal.discount || 0);
  const originalAmount = Number(proposal.subtotal ?? (Number(proposal.total || 0) + discountAmount));
  const revisionDiscountLabel = proposal.discountType === 'percent'
    ? `${discountInput}% (${fmt(discountAmount / 100)})`
    : fmt(discountAmount / 100);
  return {
    ...proposal,
    client: proposal.clientName || client?.name || proposal.client || 'Cliente',
    service: proposal.title || serviceName,
    total: typeof proposal.total === 'number' ? fmt(proposal.total / 100) : proposal.total || fmt(0),
    date: formatDate(proposal.updatedAt || proposal.updated || proposal.createdAt || proposal.created),
    acceptedAtLabel: proposal.acceptedAt ? dateTime(proposal.acceptedAt) : '',
    revisedAtLabel: proposal.revisedAt
      ? dateTime(proposal.revisedAt)
      : proposal.revisionHistory?.length
        ? dateTime(proposal.revisionHistory[proposal.revisionHistory.length - 1].revisedAt)
        : '',
    hasDiscount: discountAmount > 0,
    originalTotalLabel: fmt(originalAmount / 100),
    discountLabel: revisionDiscountLabel,
    discountAmountLabel: fmt(discountAmount / 100),
    discountRateLabel: proposal.discountType === 'percent' ? `${discountInput}%` : 'Valor fixo',
    revised: Boolean(proposal.revised || revision),
    previousTotal: revision ? fmt(Number(revision.total || 0) / 100) : '—',
    previousStatus: revision?.status || '—',
    previousDate: revision?.date ? formatDate(revision.date) : '—',
    revisionDiscountLabel
  };
};

interface AdminProposalsProps {
  routeDetail?: string | null;
  onOpenProposal?: (code: string) => void;
  onCloseProposal?: () => void;
  onGenerateContract?: (proposalId: string | number) => void;
}

export default function AdminProposals({ routeDetail, onOpenProposal, onCloseProposal, onGenerateContract }: AdminProposalsProps) {
  const [proposalsList, setProposalsList] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [filter, setFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [proposalPreviewOpen, setProposalPreviewOpen] = useState(false);
  const [proposalPdfUrl, setProposalPdfUrl] = useState('');
  const [proposalPdfLoading, setProposalPdfLoading] = useState(false);
  const [proposalPdfError, setProposalPdfError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [converting, setConverting] = useState(false);
  const [openRevisionIndex, setOpenRevisionIndex] = useState<number | null>(null);

  // New proposal form state
  const [newClient, setNewClient] = useState('');
  const [newService, setNewService] = useState('');
  const [newPdfName, setNewPdfName] = useState('');
  const [newPdfFile, setNewPdfFile] = useState<File | null>(null);
  const [extraService, setExtraService] = useState('');
  const [extraAmount, setExtraAmount] = useState('0');
  const [discount, setDiscount] = useState('0');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedService = services.find((service) => String(service.id) === String(newService));
  const editingProposal = editingCode
    ? proposalsList.find((proposal) => proposal.code === editingCode)
    : null;
  const baseValue = Number(selectedService?.price || 0) / 100;
  const extraValue = Number(extraAmount) || 0;
  const discountValue = (Number(discount) || 0) / 100;
  const previousExtraValue = Number(editingProposal?.extra || 0) / 100;
  // `toViewProposal` formats `total` for display, so revision math must use
  // the raw cent value kept in `subtotal` (or the raw total as a fallback).
  // Parsing the formatted pt-BR currency string would produce NaN.
  const editingBaseValue = Number(editingProposal?.subtotal ?? editingProposal?.total ?? 0) / 100;
  const subtotal = editingProposal
    ? Math.max(0, editingBaseValue + extraValue - previousExtraValue)
    : baseValue + extraValue;
  const discountAmount = subtotal * discountValue;
  const totalValue = Math.max(0, subtotal - discountAmount);

  const reload = async () => {
    try {
      const state = await api('/state');
      const nextClients = Array.isArray(state.clients) ? state.clients : [];
      setClients(nextClients);
      setServices(Array.isArray(state.services) ? state.services : []);
      setProposalsList((Array.isArray(state.proposals) ? state.proposals : []).map((proposal: any) => toViewProposal(proposal, nextClients)));
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.message || 'Não foi possível carregar as propostas.');
    }
  };

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  useEffect(() => {
    if (!routeDetail) return;
    const proposal = proposalsList.find((item) => String(item.id) === String(routeDetail) || item.code === routeDetail);
    if (proposal) setSelected(proposal);
  }, [routeDetail, proposalsList]);

  useEffect(() => {
    setOpenRevisionIndex(null);
  }, [selected?.id, selected?.revisedAt, selected?.revisionHistory?.length]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!proposalPreviewOpen || !selected?.pdfFileId) {
      setProposalPdfUrl('');
      setProposalPdfLoading(false);
      setProposalPdfError('');
      return () => undefined;
    }

    setProposalPdfLoading(true);
    setProposalPdfError('');
    fetch(`/api/proposals/${selected.id}/pdf`, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error('Não foi possível carregar o PDF anexado.');
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setProposalPdfUrl(objectUrl);
      })
      .catch((error: any) => {
        if (active) setProposalPdfError(error?.message || 'Não foi possível carregar o PDF anexado.');
      })
      .finally(() => {
        if (active) setProposalPdfLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proposalPreviewOpen, selected?.id, selected?.pdfFileId]);

  const closeSelected = () => {
    setSelected(null);
    onCloseProposal?.();
  };

  const filtered = useMemo(
    () => proposalsList.filter(
      (p) => (filter === 'Todos' || p.status === filter) &&
        `${p.client} ${p.service}`.toLowerCase().includes(search.toLowerCase())
    ),
    [proposalsList, filter, search]
  );
  const selectedRevisions = selected ? revisionViews(selected) : [];
  const latestRevision = selectedRevisions[selectedRevisions.length - 1];
  const previousRevisions = selectedRevisions
    .map((revision: any, index: number) => ({ revision, index }))
    .slice(0, -1)
    .reverse();
  const renderRevisionBody = (revision: any) => (
    <div className="client-proposal-revision-body">
      <span className="client-proposal-revision-summary">Foi concedido um desconto de <b>{revision.discountRateLabel} ({revision.discountAmountLabel})</b>.</span>
      <div>
        <h3>Versão anterior</h3>
        <div className="proposal-detail-grid">
          <div><b>Valor total</b><strong>{revision.previousTotalLabel}</strong></div>
          <div><b>Status</b><span>{revision.previousStatus}</span></div>
          <div><b>Data</b><span>{revision.previousDate}</span></div>
        </div>
      </div>
      <div>
        <h3>Versão revisada</h3>
        <div className="proposal-pricing-summary">
          <div className="proposal-pricing-row proposal-pricing-row--original">
            <span>Valor original</span>
            <strong>{revision.previousTotalLabel}</strong>
          </div>
          <div className="proposal-pricing-row proposal-pricing-row--discount">
            <span>Desconto concedido ({revision.discountRateLabel})</span>
            <strong>− {revision.discountAmountLabel}</strong>
          </div>
          <div className="proposal-pricing-row proposal-pricing-row--final">
            <span>Valor final</span>
            <strong>{revision.totalLabel}</strong>
          </div>
        </div>
        <div className="proposal-detail-grid proposal-detail-grid--revised proposal-detail-grid--revision-meta">
          <div><b>Status</b><span>{revision.status}</span></div>
          <div><b>Atualizada em</b><span>{revision.dateLabel}</span></div>
        </div>
      </div>
    </div>
  );

  const resetForm = () => {
    setNewClient(''); setNewService(''); setExtraService('');
    setExtraAmount('0'); setDiscount('0'); setNewPdfName(''); setNewPdfFile(null);
    setEditingCode(null);
  };

  const createProposal = async () => {
    if (!newClient || !newService) return;
    setActionError('');
    const data = {
      clientId: Number(newClient),
      serviceId: Number(newService),
      title: extraService ? `${selectedService?.name || 'Serviço'} + ${extraService}` : selectedService?.name,
      description: selectedService?.description || '',
      extra: extraValue,
      extraName: extraService,
      discount: Number(discount) || 0,
      discountType: 'percent',
      term: 'fixed'
    };
    try {
      let proposalId: number | string | null = null;
      if (editingCode) {
        const current = proposalsList.find((item) => item.code === editingCode);
        if (!current?.id) throw new Error('Proposta não encontrada. Atualize a página e tente novamente.');
        proposalId = current.id;
        await api(`/proposals/${current.id}`, data, 'PATCH');
      } else {
        const created = await api('/proposals', data);
        proposalId = created?.id || null;
      }
      if (newPdfFile && proposalId) {
        const formData = new FormData();
        formData.append('file', newPdfFile, newPdfFile.name);
        await api(`/proposals/${proposalId}/pdf`, formData, 'POST');
      }
      await reload();
      resetForm();
      setNewOpen(false);
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível salvar a proposta.');
    }
  };

  const cancelProposal = async () => {
    if (!selected || !cancelReason.trim()) return;
    setActionError('');
    try {
      await api(`/proposals/${selected.id}/cancel`, { reason: cancelReason.trim() }, 'PATCH');
      await reload();
      closeSelected();
      setCancelReason('');
      setCancelOpen(false);
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível cancelar a proposta.');
    }
  };

  const deleteProposal = async () => {
    if (!selected) return;
    setActionError('');
    try {
      await api(`/proposals/${selected.id}`, undefined, 'DELETE');
      await reload();
      closeSelected();
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível excluir a proposta.');
    }
  };

  const convertProposal = async () => {
    if (!selected || selected.status !== 'Aceita' || converting) return;
    if (onGenerateContract) {
      onGenerateContract(selected.id);
      setSelected(null);
      return;
    }
    setActionError('');
    setConverting(true);
    try {
      await api(`/proposals/${selected.id}/convert`, {}, 'PATCH');
      await reload();
      const converted = proposalsList.find((proposal) => String(proposal.id) === String(selected.id));
      setSelected(converted ? { ...converted, status: 'Convertida' } : { ...selected, status: 'Convertida' });
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível gerar o contrato.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="admin-proposals-page">

      {/* ── Page Header ── */}
      <div className="admin-proposals-heading">
        <div>
          <div className="eyebrow">COMERCIAL</div>
          <h1 className="page-title">Propostas</h1>
          <p className="page-subtitle">Crie, acompanhe e converta suas propostas comerciais.</p>
        </div>
        <Button icon={<Plus size={17} />} onClick={() => { resetForm(); setNewOpen(true); }}>
          Nova Proposta
        </Button>
      </div>

      {/* ── Summary Bar ── */}
      <div className="admin-proposals-summary">
        <div><span>Em negociação</span><strong>{proposalsList.filter((proposal) => proposal.status === 'Aguardando aceite' || proposal.status === 'Em análise').length}</strong><small>aguardando aceite</small></div>
        <div><span>Valor em propostas</span><strong>{fmt(proposalsList.reduce((sum, proposal) => sum + (typeof proposal.total === 'string' ? Number(proposal.total.replace(/[^0-9,-]/g, '').replaceAll('.', '').replace(',', '.')) : Number(proposal.total || 0) / 100), 0))}</strong><small>propostas cadastradas</small></div>
        <div><span>Taxa de conversão</span><strong>{proposalsList.length ? Math.round((proposalsList.filter((proposal) => proposal.status === 'Convertida').length / proposalsList.length) * 100) : 0}%</strong><small><TrendingUp size={14} /> dados compartilhados</small></div>
      </div>

      {/* ── List ── */}
      <Card className="admin-proposals-panel">
        <div className="admin-proposals-tools">
          <div className="admin-proposals-search">
            <Search size={17} />
            <input aria-label="Buscar propostas" placeholder="Buscar por cliente ou serviço..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="admin-proposals-filters">
            {['Todos', 'Aguardando aceite', 'Aceita', 'Convertida'].map((item) => (
              <button type="button" className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>
        </div>
        {loadError && <p className="form-error" role="alert">{loadError}</p>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        <div className="admin-proposals-list">
          {filtered.length === 0 && !loadError && <p className="empty-state">Nenhuma proposta encontrada.</p>}
          {filtered.map((p) => (
            <article className="admin-proposal-card" key={p.code}>
              <div className="admin-proposal-main">
                <div className="admin-proposal-icon"><FileText size={19} /></div>
                <div>
                  <div className="admin-proposal-code">{p.code}</div>
                  <h2>{p.client}</h2>
                  <p>{p.service}</p>
                </div>
              </div>
              <div className="admin-proposal-value"><span>Valor total</span><strong>{p.total}</strong></div>
              <div className="admin-proposal-meta">
                <span><b>Status</b><Badge status={p.status} variant={p.status === 'Convertida' ? 'green' : p.status === 'Aceita' ? 'blue' : 'yellow'} /></span>
                <span><b>Atualizada em</b>{p.date}</span>
              </div>
              <Button variant="ghost" size="sm" icon={<Eye size={16} />} onClick={() => { setSelected(p); onOpenProposal?.(p.code); }}>Visualizar</Button>
            </article>
          ))}
        </div>
      </Card>

      {/* ══════════════════════════════════════════════════════════
          MODAL: NOVA PROPOSTA — Layout premium, bem organizado
      ══════════════════════════════════════════════════════════ */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title={editingCode ? 'Revisar proposta' : 'Nova proposta'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Instrução */}
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            Selecione o cliente e o serviço, ajuste os valores e envie a proposta.
          </p>

          {/* ── Seção 1: Cliente e Serviço ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cliente *</label>
              <select
                className="form-select"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
              >
                <option value="">Selecione um cliente...</option>
                {clients.filter((client) => client.active !== false).map((client) => (
                  <option key={client.id} value={client.id}>{client.name} — {client.code}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Serviço *</label>
                <select
                  className="form-select"
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                >
                  <option value="">Selecione um serviço...</option>
                {services.filter((service) => service.active !== false).map((service) => (
                  <option key={service.id} value={service.id}>{service.name} — {service.code}</option>
                ))}
                </select>
              </div>
              {baseValue > 0 && (
                <div style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  padding: '8px 14px',
                  textAlign: 'center',
                  minWidth: 110,
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Valor base</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4ed8' }}>{fmt(baseValue)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Divisor */}
          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }} />

          {/* ── Seção 2: Serviço extra e desconto ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Serviço adicional <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span></label>
                <input
                  className="form-input"
                  value={extraService}
                  onChange={(e) => setExtraService(e.target.value)}
                  placeholder="Ex: Consultoria fiscal"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Valor (R$)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Desconto <span style={{ fontWeight: 400, color: '#94a3b8' }}>(%)</span></label>
              <input
                className="form-input"
                type="number"
                min="0"
                max="100"
                style={{ maxWidth: 120 }}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>

          {/* ── Total ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 10,
            padding: '14px 18px',
            marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total da proposta</div>
              {discountAmount > 0 && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Desconto de {fmt(discountAmount)} aplicado
                </div>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d' }}>{fmt(totalValue)}</div>
          </div>

          {/* Divisor */}
          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }} />

          {/* ── Seção 3: PDF ── */}
          <div className="form-group" style={{ margin: '0 0 24px 0' }}>
            <label className="form-label">
              Anexar PDF da proposta <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setNewPdfFile(file);
                setNewPdfName(file?.name || '');
              }}
            />
            {!newPdfName ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '12px 16px',
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: 8,
                  background: '#f8fafc',
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'border-color 150ms ease',
                }}
              >
                <Upload size={16} color="#94a3b8" />
                Clique para selecionar o PDF
              </button>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                background: '#f0fdf4',
              }}>
                <FileText size={16} color="#16a34a" />
                <span style={{ fontSize: 13, color: '#15803d', fontWeight: 500, flex: 1 }}>{newPdfName}</span>
                <button
                  type="button"
                  onClick={() => { setNewPdfName(''); setNewPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                  aria-label="Remover arquivo"
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </div>

          {/* ── Ação ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              style={{ flex: 2 }}
              disabled={!newClient || !newService}
              onClick={createProposal}
            >
              {editingCode ? 'Atualizar proposta' : 'Criar proposta'}
            </Button>
          </div>

        </div>
      </Modal>

      {/* ── Modal: Detalhes da proposta ── */}
      {selected && (
        <Modal open={!!selected} onClose={closeSelected} title="Detalhes da proposta">
          <div className="proposal-detail">
            <div className="proposal-detail-hero">
              <div className="proposal-detail-icon"><FileText size={22} /></div>
              <div>
                <span className="admin-proposal-code">{selected.code}</span>
                <h2>{selected.client}</h2>
                <p>{selected.service}</p>
              </div>
            </div>
            {latestRevision ? (
              <>
                <section className="client-proposal-revision-item client-proposal-revision-current is-open" aria-label="Revisão atual da proposta">
                  <div className="client-proposal-revision-current-header">
                    <span className="client-proposal-revision-toggle-label">
                      <CheckCircle size={18} />
                      <span className="client-proposal-revision-title">
                        <strong>Proposta revisada</strong>
                        <small>{latestRevision.revisedAtLabel ? `${latestRevision.ordinalLabel} em ${latestRevision.revisedAtLabel}` : latestRevision.ordinalLabel}</small>
                      </span>
                    </span>
                    <span className="client-proposal-revision-current-badge">Atual</span>
                  </div>
                  {renderRevisionBody(latestRevision)}
                </section>
                {previousRevisions.length > 0 && (
                  <div className="client-proposal-revision-history" role="region" aria-label="Revisões anteriores da proposta">
                    {previousRevisions.map(({ revision, index }: { revision: any; index: number }) => {
                      const isOpen = openRevisionIndex === index;
                      return (
                        <section className={`client-proposal-revision-item${isOpen ? ' is-open' : ''}`} key={`${revision.revisedAtLabel}-${index}`}>
                          <button
                            type="button"
                            className="client-proposal-revision-toggle"
                            aria-expanded={isOpen}
                            onClick={() => setOpenRevisionIndex(isOpen ? null : index)}
                          >
                            <span className="client-proposal-revision-toggle-label">
                              <CheckCircle size={18} />
                              <span className="client-proposal-revision-title">
                                <strong>Proposta revisada</strong>
                                <small>{revision.revisedAtLabel ? `${revision.ordinalLabel} em ${revision.revisedAtLabel}` : revision.ordinalLabel}</small>
                              </span>
                            </span>
                            <ChevronDown size={17} aria-hidden="true" />
                          </button>
                          {isOpen && renderRevisionBody(revision)}
                        </section>
                      );
                    })}
                  </div>
                )}
              </>
            ) : selected.hasDiscount ? (
              <div className="proposal-pricing-summary">
                <div className="proposal-pricing-row proposal-pricing-row--original">
                  <span>Valor original</span>
                  <strong>{selected.originalTotalLabel}</strong>
                </div>
                <div className="proposal-pricing-row proposal-pricing-row--discount">
                  <span>Desconto concedido ({selected.discountRateLabel})</span>
                  <strong>− {selected.discountAmountLabel}</strong>
                </div>
                <div className="proposal-pricing-row proposal-pricing-row--final">
                  <span>Valor final</span>
                  <strong>{selected.total}</strong>
                </div>
                <div className="proposal-pricing-meta">
                  <span>Status</span>
                  <Badge status={selected.status} variant={selected.status === 'Convertida' ? 'green' : selected.status === 'Aceita' ? 'blue' : selected.status === 'Cancelada' ? 'red' : 'yellow'} />
                  <span>Atualizada em {selected.date}</span>
                </div>
              </div>
            ) : (
              <div className="proposal-detail-grid">
                <div><b>Valor total</b><strong>{selected.total}</strong></div>
                <div><b>Status</b><Badge status={selected.status} variant={selected.status === 'Convertida' ? 'green' : selected.status === 'Aceita' ? 'blue' : selected.status === 'Cancelada' ? 'red' : 'yellow'} /></div>
                <div><b>Atualizada em</b><span>{selected.date}</span></div>
              </div>
            )}
            {selected.acceptedAt && (
              <div className="proposal-accepted-notice" role="status">
                <CheckCircle size={18} />
                <span><strong>Proposta aceita pelo cliente</strong> em {selected.acceptedAtLabel}.</span>
              </div>
            )}
            {selected.cancellationReason && (
              <div className="proposal-cancellation-reason">
                <b>Motivo do cancelamento</b>
                <span>{selected.cancellationReason}</span>
              </div>
            )}
            {selected.rejectionReason && (
              <div className="proposal-rejection-reason">
                <b>Motivo da recusa</b>
                <span>{selected.rejectionReason}</span>
              </div>
            )}
            <div className="proposal-detail-actions">
              <Button variant="outline-blue" icon={<Eye size={15} />} onClick={() => setProposalPreviewOpen(true)}>Visualizar proposta</Button>
              {selected.status === 'Aceita' && (
                <Button variant="primary" icon={<FileCheck2 size={15} />} onClick={convertProposal} disabled={converting}>
                  {converting ? 'Gerando contrato...' : 'Gerar contrato'}
                </Button>
              )}
              <Button variant="secondary" icon={<Ban size={15} />} onClick={() => setCancelOpen(true)} disabled={selected.status === 'Cancelada'}>Cancelar</Button>
              <Button variant="danger" icon={<Trash2 size={15} />} onClick={deleteProposal}>Excluir</Button>
              <Button variant="outline-blue" icon={<Pencil size={15} />} onClick={() => {
                setNewClient(String(selected.clientId || ''));
                setNewService(String(selected.serviceId || ''));
                setExtraService(selected.extraName || '');
                setExtraAmount(String(Number(selected.extra || 0) / 100));
                setDiscount(String(selected.discountInput || 0));
                setEditingCode(selected.code);
                closeSelected();
                setNewOpen(true);
              }}>Revisar</Button>
            </div>
            <Button variant="primary" style={{ width: '100%', marginTop: 12 }} onClick={closeSelected}>Fechar</Button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Visualizar PDF ── */}
      <Modal open={proposalPreviewOpen} onClose={() => setProposalPreviewOpen(false)} title="Visualizar proposta">
        <div className="invoice-pdf-viewer">
          <div className="invoice-pdf-toolbar">
            <strong>{selected?.code || 'Proposta'}</strong>
            <Button size="sm" variant="secondary" onClick={() => setProposalPreviewOpen(false)}>Fechar</Button>
          </div>
          <div className="invoice-pdf-page">
            <div className="pdf-doc-header">
              <div><span className="pdf-brand-mark">G</span><div><strong>GSA HUB</strong><small>Proposta comercial</small></div></div>
              <span className="pdf-doc-type">PROPOSTA</span>
            </div>
            {selected?.pdfFileId ? (
              <div className="pdf-external-file pdf-external-file--embedded">
                <strong>{selected.pdfFileName || 'PDF anexado à proposta'}</strong>
                {proposalPdfLoading && <span>Carregando PDF anexado...</span>}
                {proposalPdfError && <span role="alert">{proposalPdfError}</span>}
                {proposalPdfUrl && <iframe title={`PDF anexado ${selected.code || ''}`} src={proposalPdfUrl} />}
                {proposalPdfUrl && <a className="pdf-external-file-link" href={`/api/proposals/${selected.id}/pdf`} target="_blank" rel="noreferrer">Abrir PDF em nova aba</a>}
              </div>
            ) : selected?.pdfFileName ? (
              <div className="pdf-external-file">
                <FileText size={34} />
                <strong>{selected.pdfFileName}</strong>
                <span>PDF anexado externamente à proposta.</span>
              </div>
            ) : (
              <>
                <div className="pdf-doc-section">
                  <small>CLIENTE</small>
                  <h3>{selected?.client}</h3>
                  <p>{selected?.service}</p>
                </div>
                <div className="pdf-doc-total">
                  <span>VALOR TOTAL</span>
                  <strong>{selected?.total}</strong>
                </div>
                <div className="pdf-doc-footer">Documento gerado automaticamente pelo GSA HUB</div>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Modal: Cancelar proposta ── */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar proposta">
        <div className="proposal-cancel-form">
          <p>Informe o motivo do cancelamento para registrar no histórico.</p>
          <label className="form-label">Motivo *</label>
          <textarea className="form-textarea" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Descreva o motivo do cancelamento" />
          <Button variant="danger" disabled={!cancelReason.trim()} style={{ width: '100%', marginTop: 14 }} onClick={cancelProposal}>
            Confirmar cancelamento
          </Button>
        </div>
      </Modal>

    </div>
  );
}
