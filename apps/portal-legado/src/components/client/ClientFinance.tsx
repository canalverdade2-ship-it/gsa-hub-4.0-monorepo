import React, { useEffect, useRef, useState } from 'react';
import { Wallet, DollarSign, Download, Calendar, AlertCircle, FileText, CheckCircle2, ChevronDown } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api } from '../../api';

interface ClientFinanceProps {
  routeDetail?: string | null;
}

export function ClientFinance({ routeDetail }: ClientFinanceProps) {
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<any | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [paymentLinkStatus, setPaymentLinkStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [paymentLinkError, setPaymentLinkError] = useState('');
  const [expandedPaidInvoice, setExpandedPaidInvoice] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [financeError, setFinanceError] = useState('');
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [orderNsu, setOrderNsu] = useState('');
  const [paymentNotice, setPaymentNotice] = useState('');
  const checkoutBusy = useRef(false);
  const refreshInvoices = async () => {
    const result = await api('/infinitepay/invoices');
    setInvoices(result.invoices || []);
  };
  useEffect(() => {
    let active = true;
    void api('/infinitepay/invoices').then(result => { if (active) setInvoices(result.invoices || []); })
      .catch(error => { if (active) setFinanceError(error.message); })
      .finally(() => { if (active) setLoadingInvoices(false); });
    const params = new URLSearchParams(window.location.search);
    if (params.get('order_nsu') && params.get('transaction_nsu') && params.get('slug')) {
      void api('/infinitepay/payment-check', { orderNsu: params.get('order_nsu'), transactionNsu: params.get('transaction_nsu'), slug: params.get('slug') })
        .then(async result => {
          if (active) setPaymentNotice(result.paid ? 'Pagamento confirmado pela InfinitePay.' : 'Pagamento aguardando confirmação.');
          if (result.paid && active) await refreshInvoices();
        }).catch(error => { if (active) setFinanceError(error.message); })
        .finally(() => {
          ['order_nsu', 'transaction_nsu', 'slug', 'capture_method', 'receipt_url'].forEach(key => params.delete(key));
          window.history.replaceState(null, '', window.location.pathname + (params.size ? '?' + params.toString() : ''));
        });
    }
    const handleReload = () => { void refreshInvoices(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => { active = false; window.removeEventListener('gsa:reload', handleReload); };
  }, []);
  useEffect(() => {
    if (!routeDetail || !invoices.length) return;
    const invoice = invoices.find((item) => String(item.id) === String(routeDetail) || item.code === routeDetail);
    if (!invoice) return;
    if (invoice.status === 'Pago') setExpandedPaidInvoice(invoice.id);
    window.setTimeout(() => document.getElementById(`client-invoice-${invoice.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }, [routeDetail, invoices]);
  useEffect(() => {
    if (!orderNsu || !isPixModalOpen) return;
    let active = true;
    const checkStatus = async () => {
      try {
        const status = await api('/infinitepay/orders/' + encodeURIComponent(orderNsu));
        if (active && status.status === 'Pago') {
          await refreshInvoices();
          setIsPixModalOpen(false); setSelectedInstallment(null);
          setPaymentNotice('Pagamento confirmado pela InfinitePay.');
        }
      } catch { /* Preserve the last confirmed state until the next refresh. */ }
    };
    const timer = window.setInterval(checkStatus, 5000);
    window.addEventListener('focus', checkStatus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', checkStatus); };
  }, [orderNsu, isPixModalOpen]);
  const applyCoupon = async () => {
    if (!selectedInstallment || !couponCode.trim() || applyingCoupon) return;
    setApplyingCoupon(true); setCouponDiscount(0); setAppliedCoupon(''); setCouponMessage('');
    try {
      const result = await api('/infinitepay/quote', { invoiceCode: selectedInstallment.inv.code, installmentNumber: selectedInstallment.inst.number, couponCode: couponCode.trim() });
      setAppliedCoupon(result.couponCode); setCouponDiscount(result.discount);
      setCouponMessage('Desconto aplicado: ' + formatMoney(result.discount));
    } catch (error) { setCouponMessage(error instanceof Error ? error.message : 'Não foi possível validar o cupom.'); }
    finally { setApplyingCoupon(false); }
  };
  const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : value;

  const handleDownloadReceipt = () => {
    setPaymentNotice('Consulte o comprovante no checkout InfinitePay após a confirmação do pagamento.');
  };

  const openInfinitePayCheckout = async (withoutCoupon = false) => {
    if (!selectedInstallment || checkoutBusy.current) return;
    const discount = withoutCoupon ? 0 : couponDiscount;
    const amount = Math.max(0, Number(selectedInstallment.inst.amount || 0) - discount);
    if (!amount) {
      setCouponMessage('O valor líquido da parcela precisa ser maior que zero.');
      return;
    }

    checkoutBusy.current = true;
    if (withoutCoupon) {
      setCouponDiscount(0);
      setCouponMessage(''); setAppliedCoupon('');
    }
    setPaymentLinkStatus('loading');

    try {
      const result = await api('/infinitepay/links', {
        invoiceCode: selectedInstallment.inv.code,
        installmentNumber: selectedInstallment.inst.number,
        couponCode: withoutCoupon ? '' : appliedCoupon
      });
      if (result.url) {
        window.location.href = result.url;
      } else {
        setCouponMessage('A InfinitePay não retornou um link de pagamento.');
        setPaymentLinkStatus('error');
      }
    } catch (error) {
      setCouponMessage(error instanceof Error ? error.message : 'Não foi possível gerar o checkout InfinitePay.');
      setPaymentLinkStatus('error');
    } finally { 
      checkoutBusy.current = false;
      if (paymentLinkStatus !== 'error') setPaymentLinkStatus('idle');
    }
  };

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const unpaid = invoices.flatMap(inv => inv.installments.filter((inst: any) => inst.status !== 'Pago'));
  const pendingTotal = unpaid.reduce((sum, inst) => sum + inst.amount - Number(inst.paidAmount || 0), 0);
  const nextInstallment = [...unpaid].sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const orderedInvoices = [...invoices].sort((a, b) => {
    const paidRank = (invoice: any) => invoice.status === 'Pago' ? 1 : 0;
    const statusOrder = paidRank(a) - paidRank(b);
    if (statusOrder !== 0) return statusOrder;
    const dueOrder = String(a.due || '').localeCompare(String(b.due || ''));
    return dueOrder || String(a.code || '').localeCompare(String(b.code || ''));
  });
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Minhas Faturas & Pagamentos</h1>
        <p className="page-subtitle">Consulte suas faturas em aberto, parcelamentos e realize pagamentos via Pix ou Boleto.</p>
      </div>

      {loadingInvoices && <p role="status">Carregando faturas…</p>}
      {financeError && <p role="alert" style={{ color: '#b91c1c' }}>{financeError}</p>}
      {paymentNotice && <p role="status" style={{ color: '#166534' }}>{paymentNotice}</p>}
      {/* KPI Cards */}
      <div className="client-finance-summary" style={{ marginBottom: 24 }}>
        <Card className="client-finance-kpi client-finance-kpi--total">
          <div className="client-finance-kpi-top">
            <div className="client-finance-kpi-label">Total a Pagar</div>
            <span className="client-finance-kpi-icon"><Wallet size={18} /></span>
          </div>
          <div className="client-finance-kpi-value">
            {formatMoney(pendingTotal)}
          </div>
        </Card>

        <Card className="client-finance-kpi client-finance-kpi--installment">
          <div className="client-finance-kpi-top">
            <div className="client-finance-kpi-label">Próxima Parcela</div>
            <span className="client-finance-kpi-icon"><DollarSign size={18} /></span>
          </div>
          <div className="client-finance-kpi-value">
            {formatMoney(nextInstallment?.amount || 0)}
          </div>
          <div className="client-finance-kpi-alert">
            <AlertCircle size={13} />
            <span>{nextInstallment ? `Vencimento: ${displayDate(nextInstallment.due)}` : 'Tudo em dia'}</span>
          </div>
        </Card>

      </div>

      {/* Active Invoices List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {orderedInvoices.map((inv) => (
          <Card id={`client-invoice-${inv.id}`} key={inv.id} className={`client-invoice-card ${inv.status === 'Pago' ? 'client-invoice-card--paid' : ''} ${expandedPaidInvoice === inv.id ? 'client-invoice-card--expanded' : ''}`} style={{ padding: 0, overflow: 'hidden' }}>
            {/* Invoice Header */}
            <div className="client-invoice-header"
              onClick={inv.status === 'Pago' ? () => setExpandedPaidInvoice(expandedPaidInvoice === inv.id ? null : inv.id) : undefined}
              role={inv.status === 'Pago' ? 'button' : undefined}
              tabIndex={inv.status === 'Pago' ? 0 : undefined}
              aria-expanded={inv.status === 'Pago' ? expandedPaidInvoice === inv.id : undefined}
              onKeyDown={inv.status === 'Pago' ? (event) => { if (event.key === 'Enter' || event.key === ' ') setExpandedPaidInvoice(expandedPaidInvoice === inv.id ? null : inv.id); } : undefined}
              style={{
                padding: '20px 24px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12
              }}
            >
              <div className="client-invoice-heading">
                <div className="client-invoice-identifiers">
                  <span className="client-invoice-mark"><FileText size={17} /></span>
                  <span className="pill pill--blue" style={{ fontSize: 12, fontWeight: 800 }}>
                    {inv.code}
                  </span>
                  {inv.orderCode && (
                    <span className="pill pill--gray" style={{ fontSize: 11 }}>
                      {inv.orderCode}
                    </span>
                  )}
                </div>
                {inv.status === 'Pago' && expandedPaidInvoice !== inv.id ? (
                  <div className="client-paid-compact-line">
                    <span className="client-paid-compact-icon"><CheckCircle2 size={19} /></span>
                    <div className="client-paid-compact-copy">
                      <h2>{inv.title}</h2>
                      <span className="client-paid-compact-meta">Quitada · {displayDate(inv.due)}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2>{inv.title}</h2>
                    <div className="client-invoice-summary">
                      <div><span>Vencimento</span><strong>{displayDate(inv.due)}</strong></div>
                      <div><span>Valor Total</span><strong>{formatMoney(inv.total)}</strong></div>
                    </div>
                  </>
                )}
              </div>

              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Badge
                  status={inv.status}
                  variant={inv.status === 'Pago' ? 'green' : 'yellow'}
                />
                {inv.status === 'Pago' && <span className="client-paid-toggle" aria-hidden="true"><ChevronDown size={15} /></span>}
                {inv.status === 'Pago' && expandedPaidInvoice !== inv.id && <span className="client-paid-compact-amount">{formatMoney(inv.total)}</span>}
              </div>
            </div>

            {/* Installments Table */}
            {(inv.status !== 'Pago' || expandedPaidInvoice === inv.id) && <div className="client-invoice-installments">
              <div className="client-invoice-section-title">
                Parcelas Da Fatura
              </div>
              <div className="table-responsive client-invoice-table" role="region" aria-label="Tabela de registros — role para ver todas as colunas" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Parcela</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Vencimento</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Opções de Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.installments.map((inst: any) => (
                    <tr key={inst.number} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>
                        <span className="client-installment-number">{inst.number}</span>
                        Parcela {inst.number} de {inv.installments.length}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', height: '100%', alignItems: 'center' }}>
                          <Badge
                            status={inst.status}
                            variant={inst.status === 'Pago' ? 'green' : 'yellow'}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: '#334155' }}>
                        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginRight: 4 }}>Vencimento:</span>
                          {displayDate(inst.due)}
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', height: '100%', alignItems: 'center' }}>
                          {formatMoney(inst.amount)}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {inst.status === 'Pendente' ? (
                          <div className="client-invoice-actions">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="client-payment-action"
                              icon={<DollarSign size={14} />}
                              onClick={() => { setSelectedInstallment({ inv, inst }); setCouponCode(''); setAppliedCoupon(''); setCouponDiscount(0); setCouponMessage(''); setPaymentLink(''); setPaymentLinkError(''); setPaymentLinkStatus('idle'); setIsPixModalOpen(false); setIsCouponModalOpen(true); }}
                            >
                              Realizar pagamento
                            </Button>
                          <Button size="sm" variant="ghost" className="client-details-action" onClick={() => { setSelectedInstallment({ inv, inst }); setIsPixModalOpen(false); }}>Detalhes</Button>
                          </div>
                        ) : (
                          <Button
                            variant="success"
                            size="sm"
                            className="client-receipt-button"
                            icon={<Download size={14} />}
                            onClick={() => handleDownloadReceipt()}
                          >
                            Recibo PDF
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>}
          </Card>
        ))}
      </div>

      <Modal open={!!selectedInstallment && !isPixModalOpen && !isCouponModalOpen} onClose={() => setSelectedInstallment(null)} title="Detalhes da Parcela">
        {selectedInstallment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Header com gradiente leve */}
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '16px 18px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0' }}>
                    Fatura {selectedInstallment.inv.code}
                  </p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.35 }}>
                    {selectedInstallment.inv.title}
                  </h3>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <Badge
                    status={selectedInstallment.inst.status}
                    variant={selectedInstallment.inst.status === 'Pago' ? 'green' : selectedInstallment.inst.status === 'Vencido' ? 'red' : 'yellow'}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor da parcela</span>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {formatMoney(selectedInstallment.inst.amount)}
                </span>
              </div>
            </div>

            {/* Grid de metadados */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{
                background: '#fff',
                border: `1px solid ${selectedInstallment.inst.status === 'Vencido' ? '#fecaca' : '#e2e8f0'}`,
                borderRadius: 8,
                padding: '12px 14px'
              }}>
                <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Vencimento
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: selectedInstallment.inst.status === 'Vencido' ? '#dc2626' : '#0f172a' }}>
                  {displayDate(selectedInstallment.inst.due)}
                </span>
                {selectedInstallment.inst.status === 'Vencido' && (
                  <span style={{ display: 'block', fontSize: 11, color: '#dc2626', marginTop: 2, fontWeight: 600 }}>Em atraso</span>
                )}
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Parcela
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {selectedInstallment.inst.number}
                  <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 13 }}> / {selectedInstallment.inv.installments.length}</span>
                </span>
              </div>

              {selectedInstallment.inst.paidDate && (
                <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: 11, color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pagamento confirmado</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#14532d' }}>{displayDate(selectedInstallment.inst.paidDate)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setSelectedInstallment(null)}>
                Fechar
              </Button>
              {selectedInstallment.inst.status !== 'Pago' && (
                <Button
                  variant="primary"
                  style={{ flex: 2 }}
                  icon={<DollarSign size={16} />}
                  onClick={() => {
                    setCouponCode(''); setAppliedCoupon(''); setCouponDiscount(0); setCouponMessage(''); setPaymentLink(''); setPaymentLinkError(''); setPaymentLinkStatus('idle'); setIsPixModalOpen(false); setIsCouponModalOpen(true);
                  }}
                >
                  Realizar pagamento
                </Button>
              )}
              {selectedInstallment.inst.status === 'Pago' && (
                <Button
                  variant="outline-blue"
                  style={{ flex: 2 }}
                  icon={<FileText size={16} />}
                  onClick={() => {
                    handleDownloadReceipt();
                    setSelectedInstallment(null);
                  }}
                >
                  Baixar Recibo
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={isCouponModalOpen} onClose={() => { setIsCouponModalOpen(false); setSelectedInstallment(null); }} title="Cupom de desconto">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>Antes de seguir para o pagamento, informe seu cupom, se possuir.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="form-label" style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Possui cupom de desconto?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                className="form-input" 
                style={{ flex: 1 }}
                placeholder="Digite o código do cupom..." 
                value={couponCode} 
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setAppliedCoupon(''); setCouponDiscount(0); setCouponMessage(''); }} 
              />
              <Button 
                variant="outline-blue" 
                style={{ whiteSpace: 'nowrap', padding: '0 24px' }}
                disabled={applyingCoupon || !couponCode.trim()}
                onClick={() => { void applyCoupon(); }}
              >
                {applyingCoupon ? 'Validando…' : 'Aplicar'}
              </Button>
            </div>
            {couponMessage && (
              <div style={{ color: couponDiscount ? '#047857' : '#dc2626', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                {couponDiscount ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {couponMessage}
              </div>
            )}

            {couponDiscount > 0 && selectedInstallment && (
              <div className="client-finance-coupon-summary" style={{ width: '100%', padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'left', marginTop: 8 }}>
                <div><small style={{ color: '#64748b', fontSize: 11 }}>Subtotal</small><strong style={{ display: 'block', color: '#0f172a', fontSize: 14 }}>{formatMoney(selectedInstallment.inst.amount)}</strong></div>
                <div><small style={{ color: '#64748b', fontSize: 11 }}>Desconto</small><strong style={{ display: 'block', color: '#16a34a', fontSize: 14 }}>- {formatMoney(couponDiscount)}</strong></div>
                <div><small style={{ color: '#64748b', fontSize: 11 }}>Total</small><strong style={{ display: 'block', color: '#2563eb', fontSize: 14 }}>{formatMoney(selectedInstallment.inst.amount - couponDiscount)}</strong></div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0' }} />
          
          <div style={{ display: 'flex', gap: 12 }}>
            <Button 
              variant="secondary" 
              style={{ flex: 1 }} 
              disabled={applyingCoupon || paymentLinkStatus === 'loading'}
              onClick={() => { void openInfinitePayCheckout(true); }}
            >
              Continuar sem cupom
            </Button>
            <Button 
              variant="primary" 
              style={{ flex: 1 }} 
              disabled={applyingCoupon || paymentLinkStatus === 'loading'}
              onClick={() => {
                if (!appliedCoupon) {
                  setCouponDiscount(0);
                  setCouponMessage('Aplique o cupom para avançar ou clique no botão Continuar sem cupom para avançar.');
                  return;
                }
                void openInfinitePayCheckout(false);
              }}
            >
              {paymentLinkStatus === 'loading' ? 'Redirecionando...' : 'Ir para o pagamento'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pix Modal */}
      <Modal open={isPixModalOpen} onClose={() => { setIsPixModalOpen(false); setSelectedInstallment(null); }} title="Pagamento via InfinitePay">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              Valor da Parcela: {formatMoney((selectedInstallment?.inst.amount || 0) - couponDiscount)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Favorecido: GSA Soluções Administrativas Ltda (CNPJ 12.345.678/0001-90)
            </div>
          </div>
          {selectedInstallment && (
            <div className="client-finance-coupon-summary" style={{ width: '100%', padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'left' }}>
              <div><small style={{ color: '#64748b' }}>Subtotal</small><strong style={{ display: 'block', color: '#0f172a' }}>{formatMoney(selectedInstallment.inst.amount)}</strong></div>
              <div><small style={{ color: '#64748b' }}>Desconto aplicado</small><strong style={{ display: 'block', color: '#16a34a' }}>- {formatMoney(couponDiscount)}</strong></div>
              <div><small style={{ color: '#64748b' }}>Valor líquido</small><strong style={{ display: 'block', color: '#2563eb' }}>{formatMoney(selectedInstallment.inst.amount - couponDiscount)}</strong></div>
            </div>
          )}

          {paymentLinkStatus === 'loading' && (
            <div style={{ width: '100%', padding: 12, borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 600 }}>
              Gerando checkout seguro da InfinitePay…
            </div>
          )}
          {paymentLinkError && (
            <div style={{ width: '100%', padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
              {paymentLinkError}
            </div>
          )}
          {paymentLink && (
            <div style={{ width: '100%', padding: 12, borderRadius: 8, background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13, fontWeight: 600 }}>
              Checkout pronto. Abra a página segura para concluir o pagamento.
            </div>
          )}

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {paymentLink && <>
              <Button
                variant="primary"
                size="md"
                style={{ width: '100%', justifyContent: 'center' }}
                icon={<DollarSign size={16} />}
                onClick={() => window.open(paymentLink, '_blank', 'noopener,noreferrer')}
              >
                Realizar pagamento agora
              </Button>
            </>}

            {paymentLinkStatus === 'error' && <Button variant="secondary" onClick={() => { void openInfinitePayCheckout(!appliedCoupon); }}>Tentar Novamente</Button>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ClientFinance;

