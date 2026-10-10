import React, { useEffect, useState } from 'react';
export default AdminContracts;

      )}

      {createModalOpen && (
        <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Novo contrato">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Selecione a proposta de origem. As informa��es ser�o preenchidas automaticamente.</p>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Proposta Origem *</label>
              <select className="form-input" value={newContractForm.proposalId} onChange={(e) => {
                 const p = availableProposals.find(x => String(x.id) === e.target.value || x.code === e.target.value);
                 setNewContractForm({...newContractForm, proposalId: e.target.value, total: p?.total || 0 });
              }}>
                <option value="">Selecione uma proposta...</option>
                {availableProposals.map(p => (
                  <option key={p.id} value={p.id}>{p.code} � {p.clientName} ({p.serviceTitle})</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Valor do Contrato (R$) *</label>
              <input className="form-input" type="number" value={newContractForm.total} onChange={(e) => setNewContractForm({...newContractForm, total: Number(e.target.value)})} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data de In�cio *</label>
                <input className="form-input" type="date" value={newContractForm.startDate} onChange={(e) => setNewContractForm({...newContractForm, startDate: e.target.value})} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Prazo *</label>
                <select className="form-input" value={newContractForm.termType} onChange={(e) => setNewContractForm({...newContractForm, termType: e.target.value})}>
                  <option value="fixed">Determinado</option>
                  <option value="indefinite">Indeterminado</option>
                </select>
              </div>
            </div>
            {newContractForm.termType === 'fixed' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data de T�rmino *</label>
                <input className="form-input" type="date" value={newContractForm.endDate} onChange={(e) => setNewContractForm({...newContractForm, endDate: e.target.value})} />
              </div>
            )}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Contrato em PDF (Opcional)</label>
              <input className="form-input" type="file" accept="application/pdf" onChange={(e) => { if (e.target.files && e.target.files[0]) { setNewContractForm({...newContractForm, file: e.target.files[0]}); } }} />
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 8, paddingTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" disabled={saving || !newContractForm.proposalId} onClick={handleCreateContract}>{saving ? 'Criando...' : 'Criar Contrato'}</Button>
            </div>
          </div>
        </Modal>
      )}

export default AdminContracts;
import React, { useEffect, useState } from 'react';
import {
  User,
  Package,
  FileText,
  Calendar,
  Plus,
  Search,
  ArrowLeft,
  ChevronRight,
  Download,
  Building2,
  CheckCircle2,
  FileCheck2
  ,Trash2, Ban
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import UploadZone from '../ui/UploadZone';
import Modal from '../ui/Modal';
import { api, isDemoMode, money, date } from '../../api';

export interface AdminContractsProps {
  onSave?: (contractData: any) => void;
  onCancel?: () => void;
  routeDetail?: string | null;
  onOpenContract?: (code: string) => void;
  onCloseContract?: () => void;
}

interface ContractItem {
  id: string;
  code: string;
  clientCode: string;
  clientName: string;
  serviceCode: string;
  serviceTitle: string;
  proposalCode: string;
  startDate: string;
  endDate: string;
  termType: 'fixed' | 'indefinite';
  total: number;
  status: 'Assinado' | 'Pendente' | 'Em análise' | 'Cancelado';
  fileName?: string;
  fileSize?: string;
  cancellationReason?: string;
  renewalFileName?: string;
  renewalReviewStatus?: 'pending' | 'analysis' | 'approved';
}

export function AdminContracts({ onSave, onCancel, routeDetail, onOpenContract, onCloseContract }: AdminContractsProps) {
  const [viewMode, setViewMode] = useState<'list' | 'create'>('list');
  const [availableProposals, setAvailableProposals] = useState<any[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newContractForm, setNewContractForm] = useState<any>({
    proposalId: '',
    startDate: '',
    termType: 'fixed',
    endDate: '',
    total: 0,
    file: null as any
  });
  const [toast, setToast] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Assinado' | 'Pendente' | 'Em análise'>('all');
  const [selectedContract, setSelectedContract] = useState<ContractItem | null>(null);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewalType, setRenewalType] = useState<'fixed' | 'indefinite'>('fixed');
  const [renewalEndDate, setRenewalEndDate] = useState('31/12/2027');
  const [renewalFileName, setRenewalFileName] = useState('');
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const closeContractDetails = () => { setSelectedContract(null); onCloseContract?.(); };
  const cancelPendingContract = async () => {
    if (!selectedContract || !cancelReason.trim()) return;
    try {
      if (!isDemoMode && selectedContract.id && !selectedContract.id.startsWith('c-')) {
        await api(`/contracts/${selectedContract.id}`, { status: 'Cancelado', cancellationReason: cancelReason.trim() }, 'PATCH');
      }
      const updated = { ...selectedContract, status: 'Cancelado' as const, cancellationReason: cancelReason.trim() };
      setContractsList((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelectedContract(updated);
      setCancelReason('');
      setCancelOpen(false);
      setToast('Contrato cancelado com sucesso!');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error(err);
      setToast('Erro ao cancelar contrato.');
      setTimeout(() => setToast(null), 3000);
    }
  };
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletePendingContract = async () => {
    if (!selectedContract || selectedContract.status !== 'Pendente') return;
    setDeleting(true);
    try {
      if (!isDemoMode && selectedContract.id && !selectedContract.id.startsWith('c-')) {
        await api(`/contracts/${selectedContract.id}`, {}, 'DELETE');
      }
      setContractsList((items) => items.filter((item) => item.id !== selectedContract.id));
      closeContractDetails();
      setDeleteConfirmOpen(false);
      setToast('Contrato excluído com sucesso!');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error(err);
      setToast('Erro ao excluir contrato.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDeleting(false);
    }
  };

  const renewContract = () => {
    if (!selectedContract) return;
    const updated = { ...selectedContract, termType: renewalType, endDate: renewalType === 'indefinite' ? 'Indeterminado' : renewalEndDate, renewalFileName: renewalFileName || selectedContract.renewalFileName, renewalReviewStatus: renewalFileName ? 'pending' as const : 'approved' as const };
    setContractsList((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelectedContract(updated);
    setRenewalFileName(''); setRenewalOpen(false);
  };

  const approveContract = async () => {
    if (!selectedContract || selectedContract.status !== 'Em análise' || approving) return;
    setApproving(true);
    try {
      const result = await api(`/contracts/${selectedContract.id}`, {
        status: 'Assinado',
        approvedAt: new Date().toISOString(),
        approvedBy: 'admin'
      }, 'PATCH');
      const updated = { ...selectedContract, ...(result?.contract || {}), status: 'Assinado' as const };
      setContractsList((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelectedContract(updated);
    } finally {
      setApproving(false);
    }
  };

  const downloadContract = async (target: ContractItem) => {
    try {
      const response = await fetch(`/api/contracts/${target.id}/pdf`, {
        credentials: 'same-origin',
        headers: { 'X-GSA-Demo-Role': 'admin' }
      });
      if (!response.ok) throw new Error('Contrato indisponível');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${target.code}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setToast('Não foi possível baixar o contrato agora.');
      window.setTimeout(() => setToast(null), 2400);
    }
  };

  const [contractsList, setContractsList] = useState<ContractItem[]>(isDemoMode ? [
    {
      id: 'c-1',
      code: 'CONT-2024-00157',
      clientCode: 'CL108',
      clientName: 'Empresa Alfa Ltda',
      serviceCode: 'SRV101',
      serviceTitle: 'Abertura de empresa',
      proposalCode: 'PROP-2024-0015',
      startDate: '01/10/2026',
      endDate: '31/10/2026',
      termType: 'fixed',
      total: 250000,
      status: 'Assinado',
      fileName: 'contrato-srv101.pdf',
      fileSize: '248 KB'
    },
    {
      id: 'c-2',
      code: 'CONT-2024-00142',
      clientCode: 'CL105',
      clientName: 'Beta Tecnologia Ltda',
      serviceCode: 'SRV104',
      serviceTitle: 'BPO Fiscal & Contábil Mensal',
      proposalCode: 'PROP-2024-0011',
      startDate: '01/08/2026',
      endDate: 'Indeterminado',
      termType: 'indefinite',
      total: 150000,
      status: 'Assinado',
      fileName: 'contrato-bpo-beta.pdf',
      fileSize: '310 KB'
    },
    {
      id: 'c-3',
      code: 'CONT-2024-00160',
      clientCode: 'CL102',
      clientName: 'Gama Varejo e Distribuição',
      serviceCode: 'SRV102',
      serviceTitle: 'Alteração Contratual de Sócios',
      proposalCode: 'PROP-2024-0018',
      startDate: '02/10/2026',
      endDate: '30/11/2026',
      termType: 'fixed',
      total: 180000,
      status: 'Pendente',
      fileName: 'minuta_alteracao_gama.pdf',
      fileSize: '190 KB'
    }
  ] : []);
  const reloadContracts = async () => {
    try {
      const state = await api('/state');
      const clients = Array.isArray(state.clients) ? state.clients : [];
      if (Array.isArray(state.proposals)) {
        setAvailableProposals(state.proposals.map((p: any) => {
          const c = clients.find((client: any) => String(client.id) === String(p.clientId));
          return { ...p, clientName: c?.name || `CL${p.clientId}` };
        }));
      }
      if (Array.isArray(state.contracts)) {
        const mapped = state.contracts.map((contract: any) => {
          const client = clients.find((item: any) => String(item.id) === String(contract.clientId));
          return {
            ...contract,
            id: String(contract.id),
            clientCode: client?.code || `CL${contract.clientId}`,
            clientName: client?.name || 'Cliente',
            serviceCode: contract.service?.code || `SRV${contract.serviceId}`,
            serviceTitle: contract.service?.name || contract.title || 'Serviço',
            proposalCode: contract.proposalCode || '',
            startDate: contract.start || '',
            endDate: contract.end || 'Indeterminado',
            termType: contract.term || 'fixed',
            fileName: contract.fileName || contract.signedFileName || '',
            status: contract.status || 'Pendente'
          };
        });
        setContractsList(mapped as ContractItem[]);
      }
    } catch {
      // Keep the local fixture visible if the server is temporarily unavailable.
    }
  };
  useEffect(() => {
    void reloadContracts();
    const handleReload = () => { void reloadContracts(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);
  React.useEffect(() => {
    setViewMode(routeDetail === 'novo' ? 'create' : 'list');
    setSelectedContract(routeDetail && routeDetail !== 'novo' ? contractsList.find((contract) => contract.code === routeDetail) || null : null);
  }, [routeDetail]);

  // Form State for "Novo contrato" (Image 2)
  const [startDate, setStartDate] = useState('2024-06-10');
  const [termType, setTermType] = useState<'fixed' | 'indefinite'>('fixed');
  const [endDate, setEndDate] = useState('2025-06-30');
  const [file, setFile] = useState<{ name: string; size: string } | null>({
    name: 'contrato-srv101.pdf',
    size: '248 KB'
  });

  const [saving, setSaving] = useState(false);
  const handleCreateContract = async () => {
    if (!newContractForm.proposalId) {
      setToast('Selecione uma proposta.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSaving(true);
    try {
      const p = availableProposals.find(x => x.id === newContractForm.proposalId || x.code === newContractForm.proposalId);
      const payload = {
        code: `CONT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        clientCode: p?.clientCode || 'CL',
        clientName: p?.clientName || 'Cliente',
        serviceCode: p?.serviceCode || p?.service?.code || 'SRV',
        serviceTitle: p?.serviceTitle || p?.service?.name || 'Serviço',
        proposalCode: p?.code || newContractForm.proposalId,
        termType: newContractForm.termType,
        status: 'Pendente' as const,
        total: Number(newContractForm.total),
        startDate: newContractForm.startDate,
        endDate: newContractForm.termType === 'indefinite' ? 'Indeterminado' : newContractForm.endDate,
        createdAt: new Date().toISOString()
      };
      
      if (!isDemoMode) {
        await api('/contracts', payload, 'POST');
      }
      
      const newContract: ContractItem = {
        id: `c-new-${Date.now()}`,
        ...payload,
        fileName: newContractForm.file?.name || ''
      };
      
      setContractsList((prev) => [newContract, ...prev]);
      setToast('Contrato criado com sucesso!');
      setTimeout(() => setToast(null), 3000);
      setCreateModalOpen(false);
    } catch (err) {
      console.error(err);
      setToast('Erro ao criar contrato.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const filteredContracts = contractsList.filter((c) => {
    const matchesSearch =
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.serviceTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });


  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {toast && (
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
          {toast}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: LISTAGEM DE CONTRATOS (Default View) */}
      {/* ========================================================================= */}
      {viewMode === 'list' ? (
        <div>
          {/* Header */}
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 className="page-title">Contratos</h1>
              <p className="page-subtitle">
                Gestão dos contratos gerados a partir de propostas aceitas, vigências e assinaturas.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={16} />}
              onClick={() => { setViewMode('create'); onOpenContract?.('novo'); }}
            >
              Novo Contrato
            </Button>
          </div>

          {/* Search and Filters Bar */}
          <div className="responsive-row" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div className="topbar-search-wrap" style={{ maxWidth: 380 }}>
              <input
                type="text"
                className="topbar-search-input"
                placeholder="Buscar por código (CONT), cliente ou serviço..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={16} className="topbar-search-icon" />
            </div>

            <div className="responsive-row" style={{ display: 'flex', gap: 6 }}>
              {(['all', 'Assinado', 'Pendente', 'Em análise'] as const).map((st) => (
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
          </div>

          {/* Contracts Table */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Lista de contratos" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Contrato</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Cliente</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Serviço Contratado</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Proposta Origem</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Vigência</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Valor Total</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => { setSelectedContract(c); onOpenContract?.(c.code); }}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      transition: 'background 150ms ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td data-label="Contrato" style={{ padding: '16px 20px' }}>
                      <span className="pill pill--blue" style={{ fontSize: 12, fontWeight: 800 }}>
                        {c.code}
                      </span>
                    </td>

                    <td data-label="Cliente" style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.clientName}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{c.clientCode}</div>
                    </td>

                    <td data-label="Serviço" style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.serviceTitle}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{c.serviceCode}</div>
                    </td>

                    <td data-label="Proposta" style={{ padding: '16px 20px', color: '#64748b', fontSize: 13 }}>
                      {c.proposalCode}
                    </td>

                    <td data-label="Vigência" style={{ padding: '16px 20px', color: '#334155', fontSize: 13 }}>
                      {c.startDate} {c.endDate !== 'Indeterminado' ? `até ${c.endDate}` : '• Indeterminado'}
                    </td>

                    <td data-label="Valor Total" style={{ padding: '16px 20px', fontWeight: 800, color: '#0f172a' }}>
                      {money(c.total)}
                    </td>

                    <td data-label="Status" style={{ padding: '16px 20px' }}>
                      <Badge
                        status={c.status}
                        variant={c.status === 'Assinado' ? 'green' : 'yellow'}
                      />
                    </td>

                    <td data-label="Ações" style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<ChevronRight size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedContract(c);
                          onOpenContract?.(c.code);
                        }}
                      >
                        Ver Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE 2: NOVO CONTRATO / REVISÃO (Image 2 Fidelity) */
        /* ========================================================================= */
        <div>
          {/* Back button */}
          <button
            type="button"
            className="back-btn"
            onClick={() => { setViewMode('list'); onCloseContract?.(); }}
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
            <ArrowLeft size={16} /> Voltar para listagem de contratos
          </button>

          {/* Page Header (Image 2) */}
          <div style={{ marginBottom: 24 }}>
            <h1 className="page-title">Novo contrato</h1>
            <p className="page-subtitle">
              O sistema preencheu os dados da proposta. Revise as informações, defina o prazo do contrato e anexe o PDF.
            </p>
          </div>

          {/* Top 3 Summary Cards (Image 2) */}
          <div className="grid-3-cols" style={{ marginBottom: 24 }}>
            {/* Card 1: Cliente */}
            <div className="summary-card">
              <div className="summary-card-icon-wrap">
                <User size={22} />
              </div>
              <div className="summary-card-content">
                <div className="summary-card-label">Cliente</div>
                <div className="summary-card-title">CL102 — Empresa Alfa Ltda</div>
                <div className="summary-card-sub">CNPJ 12.345.678/0001-90</div>
              </div>
            </div>

            {/* Card 2: Serviço */}
            <div className="summary-card">
              <div className="summary-card-icon-wrap">
                <Package size={22} />
              </div>
              <div className="summary-card-content">
                <div className="summary-card-label">Serviço</div>
                <div className="summary-card-title">SRV101 — Abertura de empresa</div>
                <div className="summary-card-sub">Constituição de empresa e registro nos órgãos competentes</div>
              </div>
            </div>

            {/* Card 3: Proposta de origem */}
            <div className="summary-card">
              <div className="summary-card-icon-wrap">
                <FileText size={22} />
              </div>
              <div className="summary-card-content">
                <div className="summary-card-label">Proposta de origem</div>
                <div className="summary-card-title">PROP-2024-0015</div>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Valor final</span>
                  <span className="summary-card-highlight">{money(153000)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2-Column Main Form Grid (Image 2) */}
          <div className="grid-2-cols" style={{ gap: 24 }}>
            {/* Left Column: Prazo do contrato + Arquivo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Card 1: Prazo do contrato */}
              <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>1</div>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Prazo do contrato</h2>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Data de início</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="date"
                      className="form-input"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Tipo de prazo</label>
                  <div className="responsive-row" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <label className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="termType"
                        checked={termType === 'fixed'}
                        onChange={() => setTermType('fixed')}
                      />
                      <span>Determinado</span>
                    </label>

                    <label className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="termType"
                        checked={termType === 'indefinite'}
                        onChange={() => setTermType('indefinite')}
                      />
                      <span>Indeterminado</span>
                    </label>
                  </div>
                </div>

                {termType === 'fixed' && (
                  <div className="form-group">
                    <label className="form-label">Data de término</label>
                    <input
                      type="date"
                      className="form-input"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Card 2: Arquivo do contrato */}
              <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>2</div>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Arquivo do contrato</h2>
                </div>

                <UploadZone
                  accept=".pdf"
                  hint="Apenas arquivos em PDF. Tamanho máximo de 10 MB."
                  selectedFile={file}
                  onFileSelect={(f) => setFile({ name: f.name, size: `${Math.round(f.size / 1024)} KB` })}
                  onRemove={() => setFile(null)}
                />
              </div>
            </div>

            {/* Right Column: Composição de valores herdados (Image 2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="card" style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>3</div>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Composição de valores herdados da proposta</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 14, color: '#64748b' }}>Valor base do serviço</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{money(150000)}</span>
                  </div>

                  <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 14, color: '#64748b' }}>Deslocamento técnico</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{money(20000)}</span>
                  </div>

                  <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 14, color: '#64748b' }}>Subtotal</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{money(170000)}</span>
                  </div>

                  <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 14, color: '#64748b' }}>Desconto (10%)</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>-{money(17000)}</span>
                  </div>

                  {/* Highlight banner blue for Total */}
                  <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', padding: 16, borderRadius: 8, margin: '16px 0' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>Total do contrato</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8' }}>{money(153000)}</span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, fontSize: 12, color: '#64748b', marginTop: 12, lineHeight: 1.5 }}>
                  Os valores acima foram definidos na proposta <strong>PROP-2024-0015</strong> e não podem ser
                  alterados aqui. Para alterar valores, revise a proposta antes de gerar o contrato.
                </div>

                <div style={{ flex: 1 }} />

                {/* Bottom Action Buttons (Image 2) */}
                <div className="responsive-row" style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <Button variant="secondary" size="md" onClick={() => { setViewMode('list'); onCloseContract?.(); }}>
                    Cancelar
                  </Button>
                  <Button variant="primary" size="md" onClick={handleSave}>
                    Salvar e prosseguir
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedContract && (
        <Modal
          open={!!selectedContract}
          onClose={closeContractDetails}
          title="Detalhes do Contrato"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Linha 1: Cliente e (Código/Status) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Cliente</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{selectedContract.clientCode} — {selectedContract.clientName}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Código</div>
                  <div style={{ fontSize: 14, color: '#0f172a' }}>{selectedContract.code}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status</div>
                  <div style={{ marginTop: 4 }}>
                    <Badge status={selectedContract.status} variant={selectedContract.status === 'Assinado' ? 'green' : 'yellow'} />
                  </div>
                </div>
              </div>
            </div>

            {/* Linha 2: Serviço */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Serviço</div>
              <div style={{ fontSize: 14, color: '#0f172a' }}>{selectedContract.serviceCode} — {selectedContract.serviceTitle}</div>
            </div>

            {selectedContract.status === 'Cancelado' && selectedContract.cancellationReason && (
              <div style={{ background: '#fef2f2', padding: 12, borderRadius: 6, border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>Motivo do cancelamento</div>
                <div style={{ fontSize: 14, color: '#991b1b', marginTop: 4 }}>{selectedContract.cancellationReason}</div>
              </div>
            )}

            {/* Box cinza */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, background: '#f8fafc', padding: 12, borderRadius: 6 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Proposta</div>
                <div style={{ fontSize: 14, color: '#0f172a' }}>{selectedContract.proposalCode}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Valor Total</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{money(selectedContract.total)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Vigência</div>
                <div style={{ fontSize: 14, color: '#0f172a' }}>{selectedContract.startDate} a {selectedContract.endDate}</div>
              </div>
            </div>

            {/* Arquivo PDF se houver */}
            {selectedContract.fileName && (
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FileText size={20} color="#64748b" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{selectedContract.fileName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{selectedContract.fileSize || '---'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline-blue" size="sm" icon={<FileText size={15} />} onClick={() => setContractPreviewOpen(true)}>Visualizar</Button>
                  <Button variant="ghost" size="sm" icon={<Download size={16} />} onClick={() => downloadContract(selectedContract)}>Baixar PDF</Button>
                </div>
              </div>
            )}
            
            {/* Renovação */}
            {selectedContract.renewalFileName && (
              <div className="contract-renewal-review">
                <strong>Renovação do contrato</strong>
                <span>Arquivo: {selectedContract.renewalFileName}</span>
                <Badge status={selectedContract.renewalReviewStatus === 'approved' ? 'Aprovado' : selectedContract.renewalReviewStatus === 'analysis' ? 'Em análise' : 'Pendente'} variant="blue" />
                <div className="contract-renewal-review-actions">
                  {selectedContract.renewalReviewStatus === 'pending' && <Button size="sm" onClick={() => setContractsList(items => items.map(item => item.id === selectedContract.id ? { ...item, renewalReviewStatus: 'analysis' } : item))}>Cliente enviou assinado</Button>}
                  {selectedContract.renewalReviewStatus === 'analysis' && <Button size="sm" onClick={() => { const updated = { ...selectedContract, renewalReviewStatus: 'approved' as const }; setContractsList(items => items.map(item => item.id === updated.id ? updated : item)); setSelectedContract(updated); }}>Aprovar renovação</Button>}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4, justifyContent: 'flex-end' }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={closeContractDetails}>Voltar</Button>
              <div style={{ display: 'flex', gap: 10, flex: 2, justifyContent: 'flex-end' }}>
                {(selectedContract.status === 'Pendente' || selectedContract.status === 'Assinado') && (
                  <Button variant="secondary" icon={<Ban size={15} />} onClick={() => setCancelOpen(true)}>Cancelar contrato</Button>
                )}
                {selectedContract.status === 'Em análise' && (
                  <Button variant="success" icon={<CheckCircle2 size={15} />} onClick={approveContract} disabled={approving}>
                    {approving ? 'Aprovando...' : 'Aprovar contrato'}
                  </Button>
                )}
                {selectedContract.status === 'Pendente' && (
                  <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteConfirmOpen(true)}>Excluir contrato</Button>
                )}
                {selectedContract.status === 'Assinado' && selectedContract.termType === 'fixed' && (
                  <Button variant="outline-blue" icon={<Calendar size={15} />} onClick={() => setRenewalOpen(true)}>Renovar contrato</Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      <Modal open={contractPreviewOpen} onClose={() => setContractPreviewOpen(false)} title="Visualizar contrato"><div className="invoice-pdf-viewer"><div className="invoice-pdf-toolbar"><strong>{selectedContract?.fileName || 'Contrato em PDF'}</strong><Button size="sm" variant="secondary" onClick={() => setContractPreviewOpen(false)}>Fechar</Button></div><div className="invoice-pdf-page"><div className="pdf-doc-header"><div><span className="pdf-brand-mark">G</span><div><strong>GSA HUB</strong><small>Documento contratual</small></div></div><span className="pdf-doc-type">CONTRATO</span></div><div className="pdf-doc-section"><small>CLIENTE</small><h3>{selectedContract?.clientName}</h3><p>{selectedContract?.serviceTitle}</p></div><div className="pdf-doc-total"><span>VALOR TOTAL</span><strong>{selectedContract ? money(selectedContract.total) : '—'}</strong></div><div className="pdf-doc-footer">Documento gerado automaticamente pelo GSA HUB</div></div></div></Modal>
      <Modal open={renewalOpen} onClose={() => setRenewalOpen(false)} title="Renovar contrato">
        <div className="contract-renewal-form">
          <p>Escolha como deseja estender a vigência deste contrato.</p>
          <div className="contract-renewal-options">
            <label className={renewalType === 'fixed' ? 'active' : ''}><input type="radio" checked={renewalType === 'fixed'} onChange={() => setRenewalType('fixed')} /> Novo período</label>
            <label className={renewalType === 'indefinite' ? 'active' : ''}><input type="radio" checked={renewalType === 'indefinite'} onChange={() => setRenewalType('indefinite')} /> Prazo indeterminado</label>
          </div>
          {renewalType === 'fixed' && <div className="form-group"><label className="form-label">Nova data de término</label><input className="form-input" type="text" placeholder="DD/MM/AAAA" value={renewalEndDate} onChange={(e) => setRenewalEndDate(e.target.value)} /></div>}
          <div className="form-group"><label className="form-label">Novo contrato em PDF <span>(opcional)</span></label><input className="form-input" type="file" accept="application/pdf" onChange={(e) => setRenewalFileName(e.target.files?.[0]?.name || '')} /><small className="contract-renewal-hint">Se anexado, o arquivo seguirá para assinatura e análise antes da confirmação.</small></div>
          <div className="responsive-row" style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}><Button variant="secondary" onClick={() => setRenewalOpen(false)}>Voltar</Button><Button onClick={renewContract}>Confirmar renovação</Button></div>
        </div>
      </Modal>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar contrato">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>Informe obrigatoriamente o motivo do cancelamento. Esta informação ficará registrada para a equipe.</p>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Motivo do cancelamento *</label>
            <textarea className="form-textarea" required value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Descreva o motivo do cancelamento" />
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="danger" style={{ flex: 2 }} disabled={!cancelReason.trim()} onClick={cancelPendingContract}>Confirmar cancelamento</Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Excluir Contrato">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#fef2f2', padding: 16, borderRadius: 8, border: '1px solid #fecaca' }}>
          <p style={{ fontSize: 14, color: '#991b1b', margin: 0 }}>
            Tem certeza que deseja excluir definitivamente este contrato pendente? Esta ação não pode ser desfeita.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button variant="danger" style={{ flex: 2 }} onClick={deletePendingContract}>Excluir Contrato</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default AdminContracts;
