import React, { useEffect, useState } from 'react';
import { FileText, ChevronLeft, ChevronRight, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, date, dateTime, money } from '../../api';
import { openPrivateFile } from '../../storage';

interface ClientProposalsProps {
  routeDetail?: string | null;
  onOpenProposal?: (code: string) => void;
  onCloseProposal?: () => void;
}

const viewProposal = (proposal: any) => ({
  ...proposal,
  service: proposal.title || proposal.service?.name || proposal.serviceName || 'Serviço',
  totalLabel: money(proposal.total),
  dateLabel: date(proposal.updatedAt || proposal.updated || proposal.createdAt || proposal.created),
  acceptedAtLabel: proposal.acceptedAt ? dateTime(proposal.acceptedAt) : '',
  revision: proposal.previousVersion || proposal.revisionHistory?.[proposal.revisionHistory.length - 1]?.previous,
  revisedAtLabel: proposal.revisedAt
    ? dateTime(proposal.revisedAt)
    : proposal.revisionHistory?.length
      ? dateTime(proposal.revisionHistory[proposal.revisionHistory.length - 1].revisedAt)
      : '',
  revised: Boolean(proposal.revised || proposal.previousVersion || proposal.revisionHistory?.length),
  hasDiscount: Number(proposal.discount || 0) > 0,
  originalTotalLabel: money(proposal.subtotal ?? (Number(proposal.total || 0) + Number(proposal.discount || 0))),
  discountLabel: proposal.discountType === 'percent'
    ? `${Number(proposal.discountInput || 0)}% (${money(proposal.discount)})`
    : money(proposal.discount),
  discountAmountLabel: money(proposal.discount),
  discountRateLabel: proposal.discountType === 'percent' ? `${Number(proposal.discountInput || 0)}%` : 'Valor fixo',
  previousTotalLabel: proposal.previousVersion ? money(proposal.previousVersion.total) : proposal.revisionHistory?.length
    ? money(proposal.revisionHistory[proposal.revisionHistory.length - 1].previous.total)
    : '—',
  revisionDiscountLabel: proposal.discountType === 'percent'
    ? `${Number(proposal.discountInput || 0)}% (${money(proposal.discount)})`
    : money(proposal.discount),
  previousDateLabel: proposal.previousVersion?.date
    ? date(proposal.previousVersion.date)
    : proposal.revisionHistory?.length
      ? date(proposal.revisionHistory[proposal.revisionHistory.length - 1].previous.date)
      : '—'
});

const statusVariant = (status: string) =>
  status === 'Aceita' ? 'green' : status === 'Recusada' || status === 'Cancelada' ? 'red' : status === 'Convertida' ? 'blue' : 'yellow';

const revisionOrdinalLabel = (index: number) => {
  const labels = ['Primeira revisão', 'Segunda revisão', 'Terceira revisão'];
  return labels[index] || `${index + 1}ª revisão`;
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
      return {
        ordinalLabel: revisionOrdinalLabel(index),
        revisedAtLabel: entry.revisedAt ? dateTime(entry.revisedAt) : '',
        previousTotalLabel: money(entry.previous.total),
        discountRateLabel: discountType === 'percent' ? `${Number(revisedVersion.discountInput || 0)}%` : 'Valor fixo',
        discountAmountLabel: money(revisedVersion.discount),
        totalLabel: money(revisedVersion.total)
      };
    });
};

export default function ClientProposals({ routeDetail, onOpenProposal, onCloseProposal }: ClientProposalsProps) {
  const [proposals, setProposals] = useState<any[]>([]);
  const [activeProposal, setActiveProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [acceptSuccessOpen, setAcceptSuccessOpen] = useState(false);
  const [openRevisionIndex, setOpenRevisionIndex] = useState<number | null>(null);

  const reload = async () => {
    try {
      const result = await api('/client-state');
      setProposals((Array.isArray(result.proposals) ? result.proposals : []).map(viewProposal));
      setError('');
    } catch (requestError: any) {
      setError(requestError?.message || 'Não foi possível carregar suas propostas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  useEffect(() => {
    if (!routeDetail) {
      setActiveProposal(null);
      return;
    }
    const proposal = proposals.find((item) => String(item.id) === String(routeDetail) || item.code === routeDetail);
    if (proposal) setActiveProposal(proposal);
  }, [routeDetail, proposals]);

  useEffect(() => {
    setOpenRevisionIndex(null);
  }, [activeProposal?.id, activeProposal?.revisedAt, activeProposal?.revisionHistory?.length]);

  const respond = async (action: 'accept' | 'reject', reason = '') => {
    if (!activeProposal?.id) return;
    setSaving(true);
    setError('');
    try {
      const response = await api(`/proposals/${activeProposal.id}/${action}`, action === 'reject' ? { reason: reason.trim() } : {}, 'PATCH');
      await reload();
      setActiveProposal((current: any) => current ? {
        ...current,
        status: action === 'accept' ? 'Aceita' : 'Recusada',
        acceptedAt: action === 'accept' ? response.acceptedAt || current.acceptedAt : current.acceptedAt,
        acceptedAtLabel: action === 'accept'
          ? dateTime(response.acceptedAt || current.acceptedAt)
          : current.acceptedAtLabel,
        rejectionReason: action === 'reject' ? reason.trim() : current.rejectionReason
      } : current);
      if (action === 'accept') setAcceptSuccessOpen(true);
      if (action === 'reject') {
        setRejectOpen(false);
        setRejectReason('');
      }
    } catch (requestError: any) {
      setError(requestError?.message || 'Não foi possível registrar sua resposta.');
    } finally {
      setSaving(false);
    }
  };

  if (activeProposal) {
    const revisions = revisionViews(activeProposal);
    const latestRevision = revisions[revisions.length - 1];
    const previousRevisions = revisions
      .map((revision: any, index: number) => ({ revision, index }))
      .slice(0, -1)
      .reverse();
    const renderRevisionBody = (revision: any) => (
      <div className="client-proposal-revision-body">
        <span className="client-proposal-revision-summary">Foi concedido um desconto de <b>{revision.discountRateLabel} ({revision.discountAmountLabel})</b>.</span>
        <div className="client-proposal-revision-values">
          <div>
            <span>Valor anterior</span>
            <strong>{revision.previousTotalLabel}</strong>
          </div>
          <div>
            <span>Desconto</span>
            <strong className="client-proposal-revision-discount-value">
              <span>{revision.discountRateLabel}</span>
              <small>({revision.discountAmountLabel})</small>
            </strong>
          </div>
          <div>
            <span>Valor com desconto</span>
            <strong>{revision.totalLabel}</strong>
          </div>
        </div>
      </div>
    );
    return (
      <div className="client-proposal-detail-wrapper">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => { setActiveProposal(null); onCloseProposal?.(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'flex', alignItems: 'center' }}
            aria-label="Voltar para propostas"
          >
            <ChevronLeft size={24} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Proposta {activeProposal.code}</h1>
            <div style={{ marginTop: 4 }}>
              <Badge status={activeProposal.status} variant={statusVariant(activeProposal.status)} />
            </div>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        {latestRevision && (
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
        )}

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

        {activeProposal.acceptedAt && (
          <div className="proposal-accepted-notice" role="status">
            <CheckCircle size={18} />
            <span><strong>Proposta aceita pelo cliente</strong> em {activeProposal.acceptedAtLabel}.</span>
          </div>
        )}

        <div className="client-proposal-detail-card">
          {/* Cabeçalho do Card */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2563eb' }}>
                Detalhamento Comercial
              </span>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '2px 0 0' }}>
                Resumo da Proposta
              </h2>
            </div>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {activeProposal.dateLabel}
            </span>
          </div>

          {/* Serviço */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Serviço
            </span>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>
              {activeProposal.service}
            </div>
          </div>

          {/* Descrição em bloco próprio, com quebra de linha natural e sem espremer */}
          {activeProposal.description && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Descrição
              </span>
              <div
                style={{
                  fontSize: 14,
                  color: '#334155',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px'
                }}
              >
                {activeProposal.description}
              </div>
            </div>
          )}

          {/* Resumo do preço */}
          {activeProposal.hasDiscount ? (
            <div className="client-proposal-price-summary" style={{ marginTop: 4 }}>
              <div className="client-proposal-price-row client-proposal-price-row--original">
                <span>Valor original</span>
                <strong>{activeProposal.originalTotalLabel}</strong>
              </div>
              <div className="client-proposal-price-row client-proposal-price-row--discount">
                <span>Desconto concedido ({activeProposal.discountRateLabel})</span>
                <strong>− {activeProposal.discountAmountLabel}</strong>
              </div>
              <div className="client-proposal-price-row client-proposal-price-row--final">
                <span>Valor final</span>
                <strong>{activeProposal.totalLabel}</strong>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(145deg, #eff6ff 0%, #ffffff 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                padding: '14px 16px',
                marginTop: 4
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Valor Total
                </span>
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Condições acordadas
                </span>
              </div>
              <strong style={{ fontSize: 20, fontWeight: 850, color: '#1d4ed8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {activeProposal.totalLabel}
              </strong>
            </div>
          )}
        </div>

        {activeProposal.pdfFileId && (
          <div className="client-proposal-attachment">
            <FileText size={20} />
            <div>
              <strong>PDF anexado à proposta</strong>
              <span>{activeProposal.pdfFileName || 'Documento PDF'}</span>
            </div>
            <button type="button" style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} onClick={() => void openPrivateFile(activeProposal.pdfFileId!)}>
              Visualizar PDF
            </button>
          </div>
        )}

        {activeProposal.status === 'Aguardando aceite' && (
          <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
            <Button variant="primary" icon={<CheckCircle size={16} />} style={{ flex: 1 }} disabled={saving} onClick={() => respond('accept')}>Aceitar Proposta</Button>
            <Button variant="danger" icon={<XCircle size={16} />} style={{ flex: 1 }} disabled={saving} onClick={() => setRejectOpen(true)}>Recusar</Button>
          </div>
        )}

        <Modal open={rejectOpen} onClose={() => { if (!saving) setRejectOpen(false); }} title="Recusar proposta">
          <div className="proposal-reject-modal">
            <p>Informe o motivo da recusa para registrar esta decisão.</p>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="proposal-reject-reason">Motivo da recusa</label>
              <textarea
                id="proposal-reject-reason"
                className="form-textarea"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Digite o motivo da recusa..."
                maxLength={1000}
                rows={5}
                autoFocus
              />
            </div>
            <div className="proposal-reject-actions">
              <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={saving}>Cancelar</Button>
              <Button variant="danger" onClick={() => respond('reject', rejectReason)} disabled={saving || !rejectReason.trim()}>Confirmar recusa</Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={acceptSuccessOpen}
          onClose={() => setAcceptSuccessOpen(false)}
          isSuccessModal
          successTitle="Sua proposta foi aceita com sucesso."
          successButtonText="OK"
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Minhas Propostas</h1>
        <p className="page-subtitle">Acompanhe e responda às propostas comerciais enviadas para você.</p>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="empty-state">Carregando propostas...</p>}
      {!loading && !error && proposals.length === 0 && <p className="empty-state">Você ainda não recebeu propostas.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {proposals.map((proposal) => (
          <button key={proposal.id || proposal.code} type="button" className="client-service-list-card" onClick={() => { setActiveProposal(proposal); onOpenProposal?.(proposal.code); }}>
            <span className="client-service-list-icon"><FileText size={23} /></span>
            <span className="client-service-list-content">
              <span className="client-service-list-topline">
                <strong>{proposal.code}</strong>
                <Badge status={proposal.status} variant={statusVariant(proposal.status)} />
              </span>
              <b>{proposal.service}</b>
              <span>Proposta comercial · {proposal.totalLabel}</span>
              <span className="client-service-list-progress">
                <i><em style={{ width: proposal.status === 'Aguardando aceite' ? '52%' : '100%' }} /></i>
                {proposal.status === 'Aguardando aceite' ? 'Aguardando sua resposta' : `Atualizada em ${proposal.dateLabel}`}
              </span>
            </span>
            <span className="client-service-list-arrow"><ChevronRight size={19} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
