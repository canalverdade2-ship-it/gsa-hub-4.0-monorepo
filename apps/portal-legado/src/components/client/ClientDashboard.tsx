import React, { useEffect, useState } from 'react';
import {
  FileText,
  Briefcase,
  Wallet,
  ArrowRight,
  CheckCircle2,
  PenLine,
  Upload,
  CreditCard,
  ClipboardList,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, date as formatDate, dateTime, money } from '../../api';

export interface ClientDashboardProps {
  onNavigate?: (screen: string, detail?: string) => void;
}

export function ClientDashboard({ onNavigate }: ClientDashboardProps) {
  const [portalState, setPortalState] = useState<any>({ clients: [], orders: [], contracts: [], tickets: [] });
  const [invoices, setInvoices] = useState<any[]>([]);
  const [allPendingModalOpen, setAllPendingModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const reload = async () => {
      try {
        const [state, finance] = await Promise.all([api('/client-state'), api('/infinitepay/invoices')]);
        if (!active) return;
        setPortalState(state || {});
        setInvoices(Array.isArray(finance?.invoices) ? finance.invoices : []);
      } catch {
        // The dashboard keeps its last confirmed values while the API reconnects.
      }
    };
    void reload();
    window.addEventListener('gsa:reload', reload);
    return () => {
      active = false;
      window.removeEventListener('gsa:reload', reload);
    };
  }, []);

  const client = portalState.clients?.[0];
  const proposals = Array.isArray(portalState.proposals) ? portalState.proposals : [];
  const orders = Array.isArray(portalState.orders) ? portalState.orders : [];
  const contracts = Array.isArray(portalState.contracts) ? portalState.contracts : [];
  const unpaid = invoices.flatMap((invoice) => (invoice.installments || [])
    .filter((installment: any) => installment.status !== 'Pago')
    .map((installment: any) => ({ ...installment, invoiceCreatedAt: invoice.createdAt || invoice.created || '' })));
  const pendingTotal = unpaid.reduce((sum, installment) => sum + Number(installment.amount || 0) - Number(installment.paidAmount || 0), 0);
  const nextInstallment = [...unpaid].sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const activeOrders = orders.filter((order: any) => order.status !== 'Concluída');
  const activeOrder = activeOrders[0];
  const trackedOrder = activeOrder || orders[0];
  const pendingContract = contracts.find((contract: any) => contract.status === 'Aguardando envio');
  const serviceDocuments = Array.isArray(portalState.documents) ? portalState.documents : [];
  const personalDocuments = Array.isArray(portalState.personalDocuments) ? portalState.personalDocuments : [];
  const pendingDocuments = [...personalDocuments, ...serviceDocuments].filter((document: any) => document.status === 'Aguardando envio');
  const pendingProposals = proposals.filter((proposal: any) => proposal.status === 'Aguardando aceite');
  // Enrich pending items with icon and type metadata
  type PendingType = 'proposal' | 'contract' | 'document' | 'invoice';
  interface PendingItem {
    key: string;
    type: PendingType;
    title: string;
    description: string;
    screen: string;
    detail?: string;
    action: string;
    date: string;
    generatedAt: string;
  }
  const typeConfig: Record<PendingType, { icon: React.ReactNode; label: string; iconBg: string; iconColor: string }> = {
    proposal: { icon: <ClipboardList size={15} />, label: 'Proposta', iconBg: '#eff6ff', iconColor: '#2563eb' },
    contract: { icon: <PenLine size={15} />, label: 'Contrato', iconBg: '#f0fdf4', iconColor: '#16a34a' },
    document: { icon: <Upload size={15} />, label: 'Documento', iconBg: '#faf5ff', iconColor: '#7c3aed' },
    invoice:  { icon: <CreditCard size={15} />, label: 'Fatura', iconBg: '#fff7ed', iconColor: '#ea580c' },
  };
  const pendingAttentionItems: PendingItem[] = [
    ...(pendingContract ? [{ key: `contract-${pendingContract.id}`, type: 'contract' as PendingType, title: 'Contrato aguardando assinatura', description: 'Baixe, assine e envie o contrato para iniciar o serviço.', screen: 'contracts', action: 'Ver contrato', date: pendingContract.createdAt || pendingContract.start || '', generatedAt: pendingContract.createdAt || pendingContract.start || '' }] : []),
    ...pendingProposals.map((proposal: any) => ({
      key: `proposal-${proposal.id}`,
      type: 'proposal' as PendingType,
      title: proposal.title || proposal.code || 'Proposta aguardando sua resposta',
      description: 'Revise as condições e aceite ou recuse a proposta.',
      screen: 'proposals',
      action: 'Ver proposta',
      date: proposal.createdAt || proposal.created || '',
      generatedAt: proposal.createdAt || proposal.created || ''
    })),
    ...pendingDocuments.map((document: any) => ({
      key: `document-${document.id}`,
      type: 'document' as PendingType,
      title: document.title || 'Documento aguardando envio',
      description: document.category ? `Documento pessoal · Validação de pendências` : 'Envie o documento solicitado para a equipe GSA.',
      screen: 'documents',
      detail: 'solicitacoes',
      action: 'Ver solicitação',
      date: document.requestedAt || document.createdAt || '',
      generatedAt: document.requestedAt || document.createdAt || ''
    })),
    ...unpaid.map((installment: any) => ({
      key: `installment-${installment.id || installment.number || installment.due}`,
      type: 'invoice' as PendingType,
      title: `Parcela${installment.number ? ` ${installment.number}` : ''} em aberto`,
      description: `Vencimento em ${formatDate(installment.due)}.`,
      screen: 'finance',
      action: 'Ver fatura',
      date: installment.invoiceCreatedAt || installment.createdAt || installment.generatedAt || installment.due || '',
      generatedAt: installment.invoiceCreatedAt || installment.createdAt || installment.generatedAt || ''
    }))
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const PendingItemCard = ({ item, onAction }: { item: PendingItem; onAction: () => void }) => {
    const cfg = typeConfig[item.type];
    return (
      <button
        type="button"
        className="client-pending-item-v2"
        onClick={onAction}
        aria-label={`${item.title} — ${item.action}`}
      >
        <span className="cpi-icon" style={{ background: cfg.iconBg, color: cfg.iconColor }}>
          {cfg.icon}
        </span>
        <span className="cpi-body">
          <span className="cpi-type">{cfg.label}</span>
          <span className="cpi-title">{item.title}</span>
          <span className="cpi-desc">{item.description}</span>
          {item.generatedAt && <span className="cpi-generated-at">Gerada em {dateTime(item.generatedAt)}</span>}
        </span>
        <span className="cpi-arrow">
          <ChevronRight size={16} />
        </span>
      </button>
    );
  };

  return (
    <div className="client-dashboard-layout">
      {/* Greeting */}
      <div className="client-dashboard-greeting-v2">
        <div className="cdg-header">
          <h1 className="cdg-title">Olá, {client?.name?.split(' ')[0] || 'cliente'}</h1>
          <span className="cdg-greeting-icon" aria-hidden="true">👋</span>
        </div>
        <p className="cdg-subtitle">
          Bem-vindo à sua Área do Cliente.<span className="cdg-subtitle-extended"> Acompanhe serviços, contratos e faturas.</span>
        </p>
      </div>

      {pendingAttentionItems.length === 0 && contracts.length > 0 ? (
        <div className="client-action-notice client-action-notice--success">
          <div className="client-action-notice-icon"><CheckCircle2 size={20} /></div>
          <div className="client-action-notice-content">
            <span className="client-action-notice-label">Contrato aprovado</span>
            <h2>Seu contrato está assinado</h2>
            <p>O contrato foi recebido e aprovado pela equipe GSA.</p>
            <button type="button" className="client-action-notice-link" onClick={() => onNavigate?.('contracts')}>
              Ver contrato <ArrowRight size={15} />
            </button>
          </div>
        </div>
      ) : null}

      {/* 4 Summary Cards */}
      <div className="client-summary-grid client-dashboard-summary">
        <div
          className="card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate?.('proposals')}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Propostas</span>
            <FileText size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{proposals.length}</div>
          <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4 }}>{proposals.filter((p: any) => p.status === 'Aguardando aceite').length} aguardando aceite</div>
        </div>

        <div
          className="card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate?.('contracts')}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Contratos</span>
            <FileText size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{contracts.length}</div>
          <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>{contracts.filter((contract: any) => contract.status !== 'Assinado').length} pendente(s) de envio</div>
        </div>

        <div
          className="card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate?.('finance')}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Faturas Abertas</span>
            <Wallet size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {money(pendingTotal)}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{nextInstallment ? `Vence em ${formatDate(nextInstallment.due)}` : 'Nenhuma parcela pendente'}</div>
        </div>

        <div
          className="card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate?.('orders')}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Serviços Ativos</span>
            <Briefcase size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{activeOrders.length}</div>
          <div style={{ fontSize: 12, color: activeOrder ? '#2563eb' : '#64748b', marginTop: 4 }}>{activeOrder ? `${activeOrder.code} em andamento` : trackedOrder ? `${trackedOrder.code} concluída` : 'Nenhum serviço em andamento'}</div>
        </div>
      </div>

      <div className="client-pending-card">
        <div className="client-pending-card-header">
          <div className="client-pending-card-title-row">
            <span className="client-pending-card-title">
              <AlertTriangle size={15} aria-hidden="true" />
              Pendências
            </span>
            {pendingAttentionItems.length > 0 && (
              <span className="client-pending-card-badge">{pendingAttentionItems.length}</span>
            )}
          </div>
          <p className="client-pending-card-subtitle">
            {pendingAttentionItems.length ? 'Ações que precisam da sua atenção.' : 'Nenhuma pendência no momento.'}
          </p>
        </div>

        {pendingAttentionItems.length > 0 ? (
          <div className="client-pending-summary-view">
            <button
              type="button"
              className="client-pending-see-all-main"
              onClick={() => setAllPendingModalOpen(true)}
            >
              Ver todas as {pendingAttentionItems.length} pendências <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="client-pending-empty-v2">
            <CheckCircle2 size={32} aria-hidden="true" />
            <span>Tudo em dia! Nenhuma ação pendente.</span>
          </div>
        )}
      </div>

      <Modal open={allPendingModalOpen} onClose={() => setAllPendingModalOpen(false)} title="Todas as pendências">
        <div className="client-pending-modal-v2">
          {pendingAttentionItems.length > 0 ? pendingAttentionItems.map((item) => (
            <PendingItemCard
              key={item.key}
              item={item}
              onAction={() => { setAllPendingModalOpen(false); onNavigate?.(item.screen, item.detail); }}
            />
          )) : <div className="client-pending-empty">Nenhuma pendência no momento.</div>}
        </div>
      </Modal>
    </div>
  );
}

export default ClientDashboard;

