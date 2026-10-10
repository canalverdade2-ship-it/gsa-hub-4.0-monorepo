import React, { useEffect, useState } from 'react';
import {
  Wallet,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  FileText,
  Plus,
  Search,
  Download,
  Calendar,
  DollarSign,
  CheckCircle2,
  Edit,
  Trash,
  Eye,
  ChevronRight
} from 'lucide-react';
import { Invoice, Installment } from '../../types';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import { api, isDemoMode, money, date } from '../../api';

interface AdminFinanceProps {
  routeDetail?: string | null;
  onCloseInvoice?: () => void;
}

export function AdminFinance({ routeDetail, onCloseInvoice }: AdminFinanceProps) {
  const [invoices, setInvoices] = useState<Invoice[]>(isDemoMode ? [
    {
      id: 200,
      code: 'FAT100',
      clientId: 108,
      orderId: 105,
      title: 'Abertura de empresa - Parcela 1/2',
      total: 76500,
      originalTotal: 76500,
      due: '2026-10-15',
      status: 'Pendente',
      installments: [
        { id: 1, number: 1, amount: 76500, due: '2026-10-15', status: 'Pendente' }
      ]
    },
    {
      id: 201,
      code: 'FAT101',
      clientId: 110,
      title: 'Regularização cadastral',
      total: 85000,
      originalTotal: 85000,
      due: '2026-09-28',
      status: 'Vencido',
      installments: [
        { id: 1, number: 1, amount: 85000, due: '2026-09-28', status: 'Vencido' }
      ]
    },
    {
      id: 202,
      code: 'FAT102',
      clientId: 108,
      orderId: 105,
      title: 'Honorários Iniciais - Assessoria',
      total: 153000,
      originalTotal: 153000,
      due: '2026-09-10',
      status: 'Pago',
      installments: [
        { id: 1, number: 1, amount: 153000, due: '2026-09-10', status: 'Pago' }
      ]
    }
  ] : []);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [renegotiateModalOpen, setRenegotiateModalOpen] = useState(false);
  const [newInvoiceModalOpen, setNewInvoiceModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Renegotiation inputs
  const [interest, setInterest] = useState('15.00');
  const [penalty, setPenalty] = useState('17.00');
  const [discount, setDiscount] = useState('10.00');
  const [newDue, setNewDue] = useState('2026-10-20');

  // New Invoice Form
  const [newClient, setNewClient] = useState(isDemoMode ? '108' : '');
  const [clientOptions, setClientOptions] = useState<any[]>([]);
  const [newProposal, setNewProposal] = useState('');
  const [newOrder, setNewOrder] = useState('');
  const [newContract, setNewContract] = useState('');
  const [maxInstallments] = useState(12);
  const [newTitle, setNewTitle] = useState('');
  const [newTotal, setNewTotal] = useState('1.500,00');
  const [newDueDate, setNewDueDate] = useState('2026-10-30');
  const [newInstallmentsCount, setNewInstallmentsCount] = useState('1');

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);

  // Installment Modal states & functions
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [selectedInstallmentIndex, setSelectedInstallmentIndex] = useState<number>(0);
  const [payModalState, setPayModalState] = useState<{ inv: Invoice, instIndex?: number, date: string, val: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [paymentInstallments, setPaymentInstallments] = useState('1');
  const [otherPaymentMethod, setOtherPaymentMethod] = useState('Pix');
  const [otherPaymentInstallments, setOtherPaymentInstallments] = useState('1');
  const [couponCode, setCouponCode] = useState('');
  const [couponMessage, setCouponMessage] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [clientCredits, setClientCredits] = useState<Record<number, number>>({});
  const [walletUse, setWalletUse] = useState('0');
  const [walletRemainder, setWalletRemainder] = useState<'pending' | 'debit' | 'other'>('pending');
  const [instDueDate, setInstDueDate] = useState<string>('');
  const [instAmount, setInstAmount] = useState<string>('');
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [surchargeOpen, setSurchargeOpen] = useState(false);
  const [surchargeType, setSurchargeType] = useState<'percent' | 'fixed'>('percent');
  const [surchargeValue, setSurchargeValue] = useState('');
  const [surchargeReason, setSurchargeReason] = useState('');

  const reloadFinance = async () => {
    try {
      const state = await api('/state');
      if (Array.isArray(state.invoices)) setInvoices(state.invoices as Invoice[]);
      const clients = Array.isArray(state.clients) ? state.clients : [];
      setClientOptions(clients);
      setNewClient((current) => {
        const currentExists = clients.some((client: any) => String(client.id) === String(current));
        return currentExists ? current : String(clients[0]?.id || '');
      });
      const walletResults = await Promise.all(clients.map(async (client: any) => {
        try { return [Number(client.id), Number((await api(`/wallet/${client.id}`)).balance || 0)] as const; } catch { return [Number(client.id), 0] as const; }
      }));
      setClientCredits(Object.fromEntries(walletResults));
    } catch {
      // The seeded local list remains usable if the server is temporarily unavailable.
    }
  };

  useEffect(() => {
    void reloadFinance();
    const handleReload = () => { void reloadFinance(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  useEffect(() => {
    if (!routeDetail || !invoices.length) return;
    const invoice = invoices.find((item) => String(item.id) === String(routeDetail) || item.code === routeDetail);
    if (invoice) {
      setSelectedInvoice(invoice);
      setDetailsModalOpen(true);
    }
  }, [routeDetail, invoices]);

  const openInstallmentModal = (inst: Installment, idx: number) => {
    setSelectedInstallment(inst);
    setSelectedInstallmentIndex(idx);
    setInstDueDate(inst.due);
    setInstAmount((inst.amount / 100).toFixed(2).replace('.', ','));
    setInstallmentModalOpen(true);
  };

  const handleSaveInstallment = async () => {
    if (!selectedInvoice || !selectedInstallment) return;
    const cleanVal = parseFloat(instAmount.replace(/\./g, '').replace(',', '.')) || 0;
    const newCents = Math.round(cleanVal * 100);

    const updatedInvoices = invoices.map((inv) => {
      if (inv.id === selectedInvoice.id) {
        const updatedInsts = (inv.installments || []).map((inst, idx) => {
          if (idx === selectedInstallmentIndex) {
            return {
              ...inst,
              due: instDueDate,
              amount: newCents
            };
          }
          return inst;
        });
        const newTotal = updatedInsts.reduce((sum, item) => sum + item.amount, 0);
        return {
          ...inv,
          total: newTotal,
          installments: updatedInsts
        };
      }
      return inv;
    });

    setInvoices(updatedInvoices);
    const updatedInv = updatedInvoices.find((x) => x.id === selectedInvoice.id);
    if (updatedInv) {
      setSelectedInvoice(updatedInv);
      const updatedInst = updatedInv.installments?.[selectedInstallmentIndex];
      if (updatedInst) setSelectedInstallment(updatedInst);
      try {
        await api(`/invoices/${updatedInv.id}`, { due: updatedInv.due, total: updatedInv.total, installments: updatedInv.installments }, 'PATCH');
        await reloadFinance();
      } catch (error: any) {
        setCouponMessage(error?.message || 'Não foi possível salvar a parcela no servidor.');
      }
    }
    setInstallmentModalOpen(false);
  };

  const applyDiscount = async () => {
    if (!selectedInvoice || !selectedInstallment) return;
    const value = Number(discountValue.replace(',', '.')) || 0;
    if (value <= 0) return;
    const base = selectedInstallment.amount;
    const amount = discountType === 'percent' ? Math.round(base * value / 100) : Math.round(value * 100);
    const applied = Math.min(amount, base);
    const nextAmount = base - applied;
    const percent = base ? (applied / base) * 100 : 0;
    const history = { date: new Date().toISOString(), amount: applied, percent, reason: discountReason.trim() || undefined };
    const updatedInvoices = invoices.map((inv) => inv.id !== selectedInvoice.id ? inv : {
      ...inv,
      total: Math.max(0, inv.total - applied),
      installments: (inv.installments || []).map((inst) => inst.id === selectedInstallment.id ? { ...inst, amount: nextAmount } : inst),
      discountHistory: [...(inv.discountHistory || []), history]
    });
    setInvoices(updatedInvoices);
    const updated = updatedInvoices.find((inv) => inv.id === selectedInvoice.id);
    if (updated) { setSelectedInvoice(updated); setSelectedInstallment(updated.installments.find((inst) => inst.id === selectedInstallment.id) || null); }
    if (!updated) return;
    try {
      await api(`/invoices/${updated.id}`, { total: updated.total, installments: updated.installments, discountHistory: updated.discountHistory }, 'PATCH');
      await reloadFinance();
    } catch (error: any) {
      setCouponMessage(error?.message || 'Não foi possível salvar o desconto.');
    }
    setDiscountValue('');
    setDiscountReason('');
    setDiscountOpen(false);
  };

  const applySurcharge = async () => {
    if (!selectedInvoice || !selectedInstallment) return;
    const value = Number(surchargeValue.replace(',', '.')) || 0;
    if (value <= 0) return;
    const base = selectedInstallment.amount;
    const applied = surchargeType === 'percent' ? Math.round(base * value / 100) : Math.round(value * 100);
    const percent = base ? (applied / base) * 100 : 0;
    const history = { date: new Date().toISOString(), amount: applied, percent, reason: surchargeReason.trim() || undefined };
    const updatedInvoices = invoices.map((inv) => inv.id !== selectedInvoice.id ? inv : {
      ...inv,
      total: inv.total + applied,
      installments: (inv.installments || []).map((inst) => inst.id === selectedInstallment.id ? { ...inst, amount: inst.amount + applied } : inst),
      surchargeHistory: [...(inv.surchargeHistory || []), history]
    });
    setInvoices(updatedInvoices);
    const updated = updatedInvoices.find((inv) => inv.id === selectedInvoice.id);
    if (updated) { setSelectedInvoice(updated); setSelectedInstallment(updated.installments.find((inst) => inst.id === selectedInstallment.id) || null); }
    if (!updated) return;
    try {
      await api(`/invoices/${updated.id}`, { total: updated.total, installments: updated.installments, surchargeHistory: updated.surchargeHistory }, 'PATCH');
      await reloadFinance();
    } catch (error: any) {
      setCouponMessage(error?.message || 'Não foi possível salvar o acréscimo.');
    }
    setSurchargeValue(''); setSurchargeReason(''); setSurchargeOpen(false);
  };

  const openRenegotiate = (inv: Invoice, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedInvoice(inv);
    setDetailsModalOpen(false);
    setRenegotiateModalOpen(true);
  };

  const openDetails = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setDetailsModalOpen(true);
  };

  const closeDetails = () => {
    setDetailsModalOpen(false);
    onCloseInvoice?.();
  };

  const openEditModal = (inv: Invoice) => {
    setIsEditMode(true);
    setEditingInvoiceId(inv.id);
    setNewClient(String(inv.clientId));
    setNewTitle(inv.title);
    setNewTotal((inv.total / 100).toFixed(2).replace('.', ','));
    setNewDueDate(inv.due);
    setNewInstallmentsCount(inv.installments ? inv.installments.length.toString() : '1');
    setNewInvoiceModalOpen(true);
    setDetailsModalOpen(false);
  };

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<number | null>(null);

  const promptDeleteInvoice = (id: number) => {
    setInvoiceToDelete(id);
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (invoiceToDelete) {
      try {
        await api(`/invoices/${invoiceToDelete}`, undefined, 'DELETE');
        await reloadFinance();
        setDetailsModalOpen(false);
        setInstallmentModalOpen(false);
        setConfirmDeleteOpen(false);
        setInvoiceToDelete(null);
        return;
      } catch (error: any) {
        setCouponMessage(error?.message || 'Não foi possível excluir a fatura.');
      }
      setInvoices(invoices.filter(i => i.id !== invoiceToDelete));
      setDetailsModalOpen(false);
      setInstallmentModalOpen(false);
      setConfirmDeleteOpen(false);
      setInvoiceToDelete(null);
    }
  };

  const handleApplyRenegotiate = async () => {
    if (!selectedInvoice) return;
    try {
      await api(`/invoices/${selectedInvoice.id}/renegotiate`, { interest, penalty, discount, due: newDue });
      await reloadFinance();
      setRenegotiateModalOpen(false);
      return;
    } catch (error: any) {
      setCouponMessage(error?.message || 'Não foi possível renegociar a fatura.');
    }
    const base = selectedInvoice.originalTotal || selectedInvoice.total;
    const nInt = Math.round(Number(interest) * 100) || 0;
    const nPen = Math.round(Number(penalty) * 100) || 0;
    const nDisc = Math.round(Number(discount) * 100) || 0;
    const finalTotal = base + nInt + nPen - nDisc;
    const renegotiation = { date: new Date().toISOString(), originalTotal: base, newTotal: finalTotal };

    setInvoices(
      invoices.map((inv) =>
        inv.id === selectedInvoice.id
          ? {
              ...inv,
              total: finalTotal,
              originalTotal: base,
              renegotiated: true,
              renegotiationHistory: [...(inv.renegotiationHistory || []), renegotiation],
              status: 'Pendente',
              due: newDue,
              installments: [{ id: 1, number: 1, amount: finalTotal, due: newDue, status: 'Pendente' }]
            }
          : inv
      )
    );
    setRenegotiateModalOpen(false);
  };

  const handleCreateInvoice = async () => {
    if (!newTitle.trim()) return;
    const cleanTotal = parseFloat(newTotal.replace(/\./g, '').replace(',', '.')) || 0;
    const totalCents = Math.round(cleanTotal * 100);
    const count = parseInt(newInstallmentsCount) || 1;
    const instAmount = Math.round(totalCents / count);

    try {
      const clientId = Number(String(newClient).match(/\d+/)?.[0] || 108);
      if (isEditMode && editingInvoiceId) {
        await api(`/invoices/${editingInvoiceId}`, {
          title: newTitle,
          total: totalCents,
          originalTotal: totalCents,
          due: newDueDate,
          installments: Array.from({ length: count }, (_, i) => ({ id: i + 1, number: i + 1, amount: Math.floor(totalCents / count) + (i < totalCents % count ? 1 : 0), due: newDueDate, status: 'Pendente' }))
        }, 'PATCH');
      } else {
        await api('/invoices', { clientId, title: newTitle, total: cleanTotal, installments: count, first: newDueDate });
      }
      await reloadFinance();
      setNewTitle('');
      setNewInvoiceModalOpen(false);
      setIsEditMode(false);
      setEditingInvoiceId(null);
      return;
    } catch (error: any) {
      setCouponMessage(error?.message || 'Não foi possível salvar a fatura no servidor.');
    }

    const instList: Installment[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      number: i + 1,
      amount: instAmount,
      due: newDueDate,
      status: 'Pendente' as const
    }));

    if (isEditMode && editingInvoiceId) {
      const updatedInvoice: Invoice = {
        ...(invoices.find(i => i.id === editingInvoiceId)!),
        title: newTitle,
        total: totalCents,
        originalTotal: totalCents,
        due: newDueDate,
        installments: instList
      };
      setInvoices(invoices.map(i => i.id === editingInvoiceId ? updatedInvoice : i));
    } else {
      const created: Invoice = {
        id: 200 + invoices.length + 1,
        code: `FAT${100 + invoices.length + 1}`,
        clientId: 108,
        title: newTitle,
        total: totalCents,
        originalTotal: totalCents,
        due: newDueDate,
        status: 'Pendente' as const,
        installments: instList
      };
      setInvoices([created, ...invoices]);
    }

    setNewTitle('');
    setNewInvoiceModalOpen(false);
    setIsEditMode(false);
    setEditingInvoiceId(null);
  };

  const promptMarkAsPaid = (inv: Invoice, instIndex?: number) => {
    const today = new Date().toISOString().split('T')[0];
    let val = inv.total;
    if (instIndex !== undefined && inv.installments) {
      const installment = inv.installments[instIndex];
      val = Math.max(0, installment.amount - Number(installment.paidAmount || 0));
    }
    setCouponCode(''); setCouponMessage(''); setCouponDiscount(0);
    setPayModalState({ inv, instIndex, date: today, val });
  };

  const applyCoupon = async () => {
    if (!payModalState) return;
    const installment = payModalState.instIndex === undefined
      ? undefined
      : payModalState.inv.installments?.[payModalState.instIndex];
    if (!installment) {
      setCouponMessage('Selecione uma parcela para aplicar o cupom.');
      return;
    }
    try {
      setCouponMessage('Validando cupom...');
      const res = await api('/infinitepay/quote', {
        invoiceCode: payModalState.inv.code,
        installmentNumber: installment.number,
        couponCode: couponCode
      });
      if (res.discount) {
        setCouponDiscount(res.discount);
        setPayModalState({ ...payModalState, val: res.amount });
        setCouponMessage(`Cupom aplicado: desconto de ${money(res.discount)}.`);
      } else {
        setCouponDiscount(0);
        setCouponMessage('Cupom não ofereceu desconto.');
      }
    } catch (e: any) {
      setCouponDiscount(0);
      setCouponMessage(e.message || 'Cupom inválido ou suspenso.');
    }
  };

  const handleMarkAsPaid = async () => {
    if (!payModalState) return;
    const { inv, instIndex, date: paymentDate } = payModalState;
    const installment = inv.installments?.[instIndex ?? 0];
    if (!installment) return;
    const walletAmount = Math.min(Math.round((Number(walletUse.replace(',', '.')) || 0) * 100), clientCredits[inv.clientId] || 0);
    const externalAmount = paymentMethod === 'Carteira' ? 0 : payModalState.val;
    try {
      await api(`/invoices/${inv.id}/pay/${installment.id}`, {
        amount: externalAmount,
        walletAmount,
        date: paymentDate,
        method: paymentMethod === 'Carteira' ? 'Saldo da Carteira' : paymentMethod,
        installments: paymentMethod === 'Carteira' ? 1 : Number(paymentInstallments) || 1,
        walletRemainder
      }, 'PATCH');
      await reloadFinance();
      setPayModalState(null);
      setWalletUse('0');
    } catch (error: any) {
      setCouponMessage(error?.message || 'Não foi possível registrar a baixa.');
    }
  };

  const handleDownloadPdf = (inv: Invoice, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const pdfContent = `GSA HUB - RECIBO DE FATURA ${inv.code}
==============================================
Cliente: Empresa Alfa Ltda (CL108)
Serviço / Título: ${inv.title}
Valor: ${money(inv.total)}
Vencimento: ${date(inv.due)}
Status: ${inv.status}
Emitido em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
Autenticação: GSA-AUTH-${Date.now()}`;

    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Recibo_${inv.code}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });
  const paymentTarget = payModalState
    ? Math.max(0, (payModalState.inv.installments?.[payModalState.instIndex ?? 0]?.amount || payModalState.inv.total) - Number(payModalState.inv.installments?.[payModalState.instIndex ?? 0]?.paidAmount || 0))
    : 0;

  const totalPendente = invoices
    .filter((i) => i.status === 'Pendente')
    .reduce((sum, i) => sum + i.total, 0);
  const totalVencido = invoices
    .filter((i) => i.status === 'Vencido')
    .reduce((sum, i) => sum + i.total, 0);
  const totalPago = invoices
    .filter((i) => i.status === 'Pago')
    .reduce((sum, i) => sum + i.total, 0);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="page-subtitle">Controle de faturas, parcelamentos, conciliação e renegociações.</p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={() => { setIsEditMode(false); setEditingInvoiceId(null); setNewTitle(''); setNewInvoiceModalOpen(true); }}
        >
          Nova Fatura
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid-3-cols" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Total Pendente</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
            {money(totalPendente)}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {invoices.filter((i) => i.status === 'Pendente').length} fatura(s) aguardando vencimento
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Total Vencido (Inadimplência)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>
            {money(totalVencido)}
          </div>
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
            {invoices.filter((i) => i.status === 'Vencido').length} fatura(s) - Exige renegociação formal
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Recebido este mês</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
            {money(totalPago)}
          </div>
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
            {invoices.filter((i) => i.status === 'Pago').length} fatura(s) liquidada(s)
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="responsive-row" style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: 'Todas as Faturas' },
            { id: 'Pendente', label: 'Pendentes' },
            { id: 'Vencido', label: 'Vencidas' },
            { id: 'Pago', label: 'Pagas' }
          ].map((chip) => (
            <Button
              key={chip.id}
              variant={filterStatus === chip.id ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilterStatus(chip.id)}
            >
              {chip.label}
            </Button>
          ))}
        </div>

        <div className="topbar-search-wrap" style={{ maxWidth: 360 }}>
          <input
            type="text"
            className="topbar-search-input"
            placeholder="Buscar fatura por código ou título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={16} className="topbar-search-icon" />
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 16px 20px' }}>
          <h3 className="card-title">Faturas emitidas</h3>
        </div>
        <div className="table-responsive">
          <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Lista de faturas" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 20px', textAlign: 'left' }}>Fatura</th>
              <th style={{ padding: '14px 20px', textAlign: 'left' }}>Serviço / Título</th>
              <th style={{ padding: '14px 20px', textAlign: 'left' }}>Vencimento</th>
              <th style={{ padding: '14px 20px', textAlign: 'left' }}>Valor Total</th>
              <th style={{ padding: '14px 20px', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '14px 20px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((inv) => (
              <tr
                key={inv.id}
                onClick={() => openDetails(inv)}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  transition: 'background 150ms ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td data-label="Fatura" style={{ padding: '16px 20px', fontWeight: 700, color: '#0f172a' }}>
                  <span className="pill pill--blue" style={{ fontSize: 12 }}>
                    {inv.code}
                  </span>
                </td>
                <td data-label="Serviço" style={{ padding: '16px 20px', color: '#334155' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{inv.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Cliente: {clientOptions.find((client: any) => String(client.id) === String(inv.clientId))?.code || `CL${inv.clientId}`} — {clientOptions.find((client: any) => String(client.id) === String(inv.clientId))?.name || 'Cliente'}</div>
                </td>
                <td data-label="Vencimento" style={{ padding: '16px 20px', color: '#64748b' }}>
                  {date(inv.due)}
                </td>
                <td data-label="Valor Total" style={{ padding: '16px 20px', fontWeight: 800, color: '#0f172a' }}>
                  {money(inv.total)}
                </td>
                <td data-label="Status" style={{ padding: '16px 20px' }}>
                  <Badge
                    status={inv.status}
                    variant={inv.status === 'Pago' ? 'green' : inv.status === 'Vencido' ? 'red' : 'yellow'}
                  />
                  {inv.renegotiated && <span className="pill pill--blue" style={{ marginLeft: 6, fontSize: 10 }}>Renegociada</span>}
                </td>
                <td data-label="Ações" style={{ padding: '16px 20px', textAlign: 'right' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Eye size={14} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetails(inv);
                    }}
                  >
                    Abrir Fatura
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        </div>
      </Card>

      {/* Renegotiation Modal */}
      <Modal
        open={renegotiateModalOpen}
        onClose={() => setRenegotiateModalOpen(false)}
        title={`Renegociação da Fatura ${selectedInvoice?.code}`}
      >
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Faturas vencidas não podem ser editadas diretamente. Defina encargos legais e conceda abatimentos autorizados.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Juros de mora (R$)</label>
              <input
                type="number"
                className="form-input"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Multa por atraso (R$)</label>
              <input
                type="number"
                className="form-input"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Desconto/Abatimento (R$)</label>
              <input
                type="number"
                className="form-input"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Novo Vencimento</label>
              <input
                type="date"
                className="form-input"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
            </div>
          </div>

          <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', color: '#166534', marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Total após renegociação</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Valores atualizados na próxima etapa</div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setRenegotiateModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" style={{ flex: 2 }} onClick={handleApplyRenegotiate}>
              Confirmar Renegociação
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Invoice Modal */}
      <Modal
        open={newInvoiceModalOpen}
        onClose={() => setNewInvoiceModalOpen(false)}
        title={isEditMode ? 'Editar Fatura' : 'Emitir Nova Fatura'}
      >
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          {isEditMode ? 'Atualize os dados da fatura antes do pagamento.' : 'Preencha os dados para gerar uma nova cobrança.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cliente *</label>
            <select className="form-select" value={newClient} onChange={(e) => setNewClient(e.target.value)}>
              {(clientOptions.length ? clientOptions : (isDemoMode ? [{ id: 108, code: 'CL108', name: 'Empresa Alfa Ltda' }] : [])).map((client) => (
                <option key={client.id} value={String(client.id)}>{client.code || `CL${client.id}`} — {client.name}</option>
              ))}
            </select>
          </div>

          <div className="responsive-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}><div className="form-group" style={{ margin:0 }}><label className="form-label">Proposta vinculada</label><select className="form-select" value={newProposal} onChange={e => setNewProposal(e.target.value)}><option value="">Nenhuma</option>{isDemoMode && <><option>PROP-2024-0015</option><option>PROP-2024-0014</option></>}</select></div><div className="form-group" style={{ margin:0 }}><label className="form-label">OS vinculada</label><select className="form-select" value={newOrder} onChange={e => setNewOrder(e.target.value)}><option value="">Nenhuma</option>{isDemoMode && <><option>OS105</option><option>OS108</option></>}</select></div><div className="form-group" style={{ margin:0 }}><label className="form-label">Contrato vinculado</label><select className="form-select" value={newContract} onChange={e => setNewContract(e.target.value)}><option value="">Nenhum</option>{isDemoMode && <option>CONT-2024-00157</option>}</select></div></div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Título da Fatura / Descrição dos Honorários *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Consultoria de Enquadramento Tributário"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>

          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Valor Total (R$) *</label>
              <input
                type="text"
                className="form-input"
                placeholder="1.500,00"
                value={newTotal}
                onChange={(e) => setNewTotal(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Vencimento *</label>
              <input
                type="date"
                className="form-input"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Quantidade de Parcelas</label>
            <select
              className="form-select"
              value={newInstallmentsCount}
              onChange={(e) => setNewInstallmentsCount(e.target.value)}
            >
              {Array.from({ length: maxInstallments }, (_, index) => index + 1).map(count => <option key={count} value={String(count)}>{count === 1 ? '1x (À vista)' : `${count}x mensais`}</option>)}
            </select>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setNewInvoiceModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" style={{ flex: 2 }} onClick={handleCreateInvoice}>
              {isEditMode ? 'Salvar Alterações' : 'Gerar Fatura'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <Modal
          open={detailsModalOpen}
          onClose={closeDetails}
          title={`Detalhes da Fatura ${selectedInvoice.code}`}
        >
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Verifique as parcelas e os dados da fatura.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, color: '#64748b' }}>Serviço Vinculado:</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {selectedInvoice.title}
              </div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Valor Total: </span>
                  <strong style={{ fontSize: 18, color: '#2563eb' }}>{money(selectedInvoice.total)}</strong>
                </div>
                <Badge
                  status={selectedInvoice.status}
                  variant={selectedInvoice.status === 'Pago' ? 'green' : selectedInvoice.status === 'Vencido' ? 'red' : 'yellow'}
                />
              </div>
            </div>

            {selectedInvoice.renegotiated && (
              <div style={{ padding: 14, borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#1d4ed8', fontSize: 13 }}>Histórico de renegociação</strong>
                  <span className="pill pill--blue" style={{ fontSize: 10 }}>Renegociada</span>
                </div>
                {selectedInvoice.renegotiationHistory?.map((item, index) => (
                  <div key={`${item.date}-${index}`} style={{ fontSize: 12, color: '#475569', paddingTop: 6, borderTop: index ? '1px solid #dbeafe' : undefined }}>
                    {new Date(item.date).toLocaleString('pt-BR')} · Original: <strong>{money(item.originalTotal)}</strong> · Renegociado: <strong>{money(item.newTotal)}</strong>
                  </div>
                ))}
              </div>
            )}
            {selectedInvoice.discountHistory?.length ? (
              <div style={{ padding: 14, borderRadius: 8, border: '1px solid #fde68a', background: '#fffbeb' }}>
                <strong style={{ color: '#92400e', fontSize: 13 }}>Histórico de descontos</strong>
                {selectedInvoice.discountHistory.map((item, index) => (
                  <div key={`${item.date}-${index}`} style={{ marginTop: 7, fontSize: 12, color: '#78350f' }}>
                    {new Date(item.date).toLocaleString('pt-BR')} · Desconto concedido de {money(item.amount)} ({item.percent.toFixed(2)}%){item.reason ? ` · Motivo: ${item.reason}` : ''}
                  </div>
                ))}
              </div>
            ) : null}
            {selectedInvoice.surchargeHistory?.length ? (
              <div style={{ padding: 14, borderRadius: 8, border: '1px solid #fed7aa', background: '#fff7ed' }}>
                <strong style={{ color: '#c2410c', fontSize: 13 }}>Histórico de acréscimos</strong>
                {selectedInvoice.surchargeHistory.map((item, index) => (
                  <div key={`${item.date}-${index}`} style={{ marginTop: 7, fontSize: 12, color: '#9a3412' }}>
                    {new Date(item.date).toLocaleString('pt-BR')} · Acréscimo aplicado de {money(item.amount)} ({item.percent.toFixed(2)}%){item.reason ? ` · Motivo: ${item.reason}` : ''}
                  </div>
                ))}
              </div>
            ) : null}

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                Parcelas e Cronograma de Liquidação:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedInvoice.installments?.map((inst, idx) => (
                  <div className="responsive-row"
                    key={inst.id || idx}
                    onClick={() => openInstallmentModal(inst, idx)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 16px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 150ms ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#2563eb';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                        Parcela {inst.number} de {selectedInvoice.installments?.length || 1}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        Vencimento: {date(inst.due)}
                      </div>
                    </div>

                    <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <strong style={{ fontSize: 14, color: '#0f172a' }}>{money(inst.amount)}</strong>
                      <Badge
                        status={inst.status}
                        variant={inst.status === 'Pago' ? 'green' : inst.status === 'Vencido' ? 'red' : 'yellow'}
                      />
                      <ChevronRight size={16} color="#94a3b8" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={closeDetails}>
                Fechar
              </Button>
              <Button
                variant="primary"
                style={{ flex: 2 }}
                icon={<Download size={14} />}
                onClick={(e) => handleDownloadPdf(selectedInvoice, e)}
              >
                {selectedInvoice.status === 'Pago' ? 'Baixar Comprovante PDF' : 'Baixar Fatura PDF'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Installment Modal (Modal da Parcela com Edição e Todos os Botões) */}
      {selectedInstallment && selectedInvoice && (
        <Modal
          open={installmentModalOpen}
          onClose={() => setInstallmentModalOpen(false)}
          title={`Gerenciar Parcela ${selectedInstallment.number} — ${selectedInvoice.code}`}
        >
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Gerencie os dados e o status desta parcela.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Serviço Vinculado:</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                {selectedInvoice.title}
              </div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Parcela {selectedInstallment.number} de {selectedInvoice.installments?.length || 1}
                </span>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selectedInstallment.paidAt && (
                    <span style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>Pago em {new Date(selectedInstallment.paidAt).toLocaleDateString('pt-BR')}</span>
                  )}
                  <Badge
                    status={selectedInstallment.status}
                    variant={selectedInstallment.status === 'Pago' ? 'green' : selectedInstallment.status === 'Vencido' ? 'red' : 'yellow'}
                  />
                </div>
              </div>
            </div>

            {selectedInvoice.paymentHistory?.length ? (
              <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <strong style={{ color: '#166534', fontSize: 13 }}>Histórico de pagamentos</strong>
                {selectedInvoice.paymentHistory.map((payment, index) => (
                  <div key={`${payment.at}-${index}`} style={{ marginTop: 7, fontSize: 12, color: '#166534' }}>
                    {new Date(payment.at).toLocaleString('pt-BR')} · {payment.method} · {payment.installments}x · {money(payment.amount)}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Campos de Edição da Parcela */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data de Vencimento</label>
                <input
                  type="date"
                  className="form-input"
                  value={instDueDate}
                  onChange={(e) => setInstDueDate(e.target.value)}
                  disabled={selectedInstallment.status === 'Pago'}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Valor da Parcela (R$)</label>
                <input
                  type="text"
                  className="form-input"
                  value={instAmount}
                  onChange={(e) => setInstAmount(e.target.value)}
                  disabled={selectedInstallment.status === 'Pago'}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}><div className="form-group" style={{ margin: 0, flex: 1 }}><label className="form-label">Cupom</label><input className="form-input" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Digite o código do cupom" /></div><Button variant="outline-blue" onClick={applyCoupon}>Resgatar</Button></div>
            {couponMessage && <div style={{ color: couponDiscount > 0 ? '#047857' : '#dc2626', fontSize: 12, fontWeight: 600 }}>{couponMessage}</div>}

            {/* Desconto faz parte da área de edição, antes da divisória dos comandos. */}
            {selectedInstallment.status === 'Pendente' && (
              <div style={{ marginTop: 2 }}>
                {!discountOpen && !surchargeOpen ? <div style={{ display: 'flex', gap: 8 }}><Button variant="outline-blue" size="sm" onClick={() => setDiscountOpen(true)}>Gerar Desconto</Button><Button variant="outline-blue" size="sm" onClick={() => setSurchargeOpen(true)}>Gerar Acréscimo</Button></div> : discountOpen ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}><label className="form-label">Tipo de desconto</label><select className="form-input" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')}><option value="percent">Porcentagem (%)</option><option value="fixed">Valor (R$)</option></select></div>
                    <div className="form-group" style={{ margin: 0 }}><label className="form-label">Desconto</label><input className="form-input" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0,00" /></div>
                    <div className="form-group" style={{ margin: 0, gridColumn: '1 / 3' }}><label className="form-label">Motivo</label><input className="form-input" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Informe o motivo do desconto (opcional)" /></div>
                    <Button variant="success" size="sm" onClick={applyDiscount}>Aplicar</Button>
                    {Number(discountValue.replace(',', '.')) > 0 && <div style={{ gridColumn: '1 / -1', padding: '9px 12px', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 600 }}>Prévia: desconto de {discountType === 'percent' ? `${Number(discountValue.replace(',', '.')).toFixed(2)}%` : `R$ ${Number(discountValue.replace(',', '.')).toFixed(2).replace('.', ',')}`} · novo valor aproximado: {money(Math.max(0, selectedInstallment.amount - (discountType === 'percent' ? Math.round(selectedInstallment.amount * Number(discountValue.replace(',', '.')) / 100) : Math.round(Number(discountValue.replace(',', '.')) * 100))))}</div>}
                  </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                      <div className="form-group" style={{ margin: 0 }}><label className="form-label">Tipo de acréscimo</label><select className="form-input" value={surchargeType} onChange={(e) => setSurchargeType(e.target.value as 'percent' | 'fixed')}><option value="percent">Porcentagem (%)</option><option value="fixed">Valor (R$)</option></select></div>
                      <div className="form-group" style={{ margin: 0 }}><label className="form-label">Acréscimo</label><input className="form-input" value={surchargeValue} onChange={(e) => setSurchargeValue(e.target.value)} placeholder="0,00" /></div>
                      <Button variant="success" size="sm" onClick={applySurcharge}>Aplicar</Button>
                      <div className="form-group" style={{ margin: 0, gridColumn: '1 / 3' }}><label className="form-label">Motivo</label><input className="form-input" value={surchargeReason} onChange={(e) => setSurchargeReason(e.target.value)} placeholder="Informe o motivo do acréscimo (opcional)" /></div>
                      {Number(surchargeValue.replace(',', '.')) > 0 && <div style={{ gridColumn: '1 / -1', padding: '9px 12px', borderRadius: 8, background: '#fff7ed', color: '#c2410c', fontSize: 12, fontWeight: 600 }}>Prévia: acréscimo de {surchargeType === 'percent' ? `${Number(surchargeValue.replace(',', '.')).toFixed(2)}%` : `R$ ${Number(surchargeValue.replace(',', '.')).toFixed(2).replace('.', ',')}`} · novo valor aproximado: {money(selectedInstallment.amount + (surchargeType === 'percent' ? Math.round(selectedInstallment.amount * Number(surchargeValue.replace(',', '.')) / 100) : Math.round(Number(surchargeValue.replace(',', '.')) * 100)))}</div>}
                    </div>
                  )}
              </div>
            )}

            {/* Todos os botões concentrados dentro do Modal da Parcela */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
              <div className="responsive-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {selectedInstallment.status !== 'Pago' && (
                  <Button
                    variant="success"
                    size="sm"
                    icon={<CheckCircle2 size={14} />}
                    onClick={() => {
                      promptMarkAsPaid(selectedInvoice, selectedInstallmentIndex);
                      setInstallmentModalOpen(false);
                    }}
                  >
                    Confirmar Pagamento
                  </Button>
                )}

                {selectedInstallment.status !== 'Pago' && (
                  <Button
                    variant="outline-blue"
                    size="sm"
                    icon={<Edit size={14} />}
                    onClick={handleSaveInstallment}
                  >
                    Salvar Alterações
                  </Button>
                )}

                {selectedInvoice.status === 'Vencido' && (
                  <Button
                    variant="outline-blue"
                    size="sm"
                    icon={<RefreshCw size={14} />}
                    onClick={() => {
                      setInstallmentModalOpen(false);
                      openRenegotiate(selectedInvoice);
                    }}
                  >
                    Renegociar Fatura
                  </Button>
                )}

                <Button variant="outline-blue" size="sm" icon={<Eye size={14} />} onClick={() => setPdfViewerOpen(true)}>Visualizar Fatura</Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download size={14} />}
                  onClick={(e) => handleDownloadPdf(selectedInvoice, e)}
                >
                  {selectedInstallment.status === 'Pago' ? 'Baixar Comprovante PDF' : 'Baixar Fatura PDF'}
                </Button>

                {(selectedInvoice.status === 'Pendente' || selectedInvoice.status === 'Vencido') && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash size={14} />}
                    onClick={() => {
                      promptDeleteInvoice(selectedInvoice.id);
                    }}
                  >
                    Excluir Fatura
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex' }}>
                <Button variant="secondary" style={{ flex: 1 }} onClick={() => setInstallmentModalOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Confirmar Exclusão"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', color: '#991b1b', marginBottom: 4 }}>
            <p style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
              Atenção: Tem certeza que deseja excluir esta fatura permanentemente?
            </p>
            <p style={{ fontSize: 13, margin: '8px 0 0 0' }}>Esta ação removerá todas as parcelas vinculadas e não poderá ser desfeita.</p>
          </div>
          
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setConfirmDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" style={{ flex: 2 }} icon={<Trash size={14} />} onClick={confirmDeleteInvoice}>
              Confirmar Exclusão
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Pagamento */}
      {payModalState && (
        <Modal
          open={true}
          onClose={() => setPayModalState(null)}
          title={`Baixa de Recebimento — ${payModalState.inv.code}`}
        >
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Confirme a data e o valor recebido para dar baixa na parcela.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data do Pagamento</label>
                <input
                  type="date"
                  className="form-input"
                  value={payModalState.date}
                  onChange={(e) => setPayModalState({ ...payModalState, date: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Valor Recebido (R$)</label>
                <input
                  type="number"
                  className="form-input"
                  value={(payModalState.val / 100).toFixed(2)}
                  onChange={(e) => setPayModalState({ ...payModalState, val: Math.round((Number(e.target.value) || 0) * 100) })}
                />
                <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>* Valor original faturado</span>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}><label className="form-label">Forma de Pagamento</label><select className="form-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>Pix</option><option>Cartão de Crédito</option><option>Boleto</option><option>Transferência</option><option>Dinheiro</option><option value="Carteira">Saldo da Carteira</option></select></div>
              {paymentMethod !== 'Carteira' && <div className="form-group" style={{ margin: 0 }}><label className="form-label">Parcelas do Pagamento</label><select className="form-input" value={paymentInstallments} onChange={(e) => setPaymentInstallments(e.target.value)}>{Array.from({ length: maxInstallments }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}x {i === 0 ? '(à vista)' : ''}</option>)}</select></div>}
            </div>
            {((clientCredits[payModalState.inv.clientId] || 0) > 0 || paymentMethod === 'Carteira') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12, background: '#eff6ff', borderRadius: 8 }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Usar saldo da carteira (R$)</label><input type="number" min="0" max={(clientCredits[payModalState.inv.clientId] || 0) / 100} className="form-input" value={walletUse} onChange={(e) => setWalletUse(e.target.value)} /><small>Disponível: R$ {((clientCredits[payModalState.inv.clientId] || 0) / 100).toFixed(2).replace('.', ',')}</small></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Saldo restante</label><select className="form-input" value={walletRemainder} onChange={(e) => setWalletRemainder(e.target.value as 'pending' | 'debit' | 'other')}><option value="pending">Manter pendente na fatura</option><option value="debit">Lançar débito na carteira</option><option value="other">Outras formas de pagamento</option></select></div>
                {walletRemainder === 'other' && <><div className="form-group" style={{ margin: 0 }}><label className="form-label">Forma restante</label><select className="form-input" value={otherPaymentMethod} onChange={(e) => setOtherPaymentMethod(e.target.value)}><option>Pix</option><option>Cartão de Crédito</option><option>Boleto</option><option>Transferência</option></select></div><div className="form-group" style={{ margin: 0 }}><label className="form-label">Parcelas restantes</label><select className="form-input" value={otherPaymentInstallments} onChange={(e) => setOtherPaymentInstallments(e.target.value)}>{Array.from({ length: maxInstallments }, (_, i) => <option key={i + 1}>{i + 1}x</option>)}</select></div></>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: 4 }}>
               <div><div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Valor Pendente</div><div style={{ fontSize: 17, fontWeight: 800, color: '#dc2626' }}>R$ {Math.max(0, (paymentTarget - payModalState.val) / 100).toFixed(2).replace('.', ',')}</div></div>
               <div><div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Total a ser baixado</div><div style={{ fontSize: 17, fontWeight: 800, color: '#166534' }}>R$ {(payModalState.val / 100).toFixed(2).replace('.', ',')}</div></div>
               <div><div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Valor Total</div><div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>R$ {(paymentTarget / 100).toFixed(2).replace('.', ',')}</div>{payModalState.val > paymentTarget && <div style={{ marginTop: 4, color: '#2563eb', fontSize: 11, fontWeight: 700 }}>+ R$ {((payModalState.val - paymentTarget) / 100).toFixed(2).replace('.', ',')} de crédito</div>}</div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setPayModalState(null)}>Cancelar</Button>
              <Button variant="success" style={{ flex: 2 }} icon={<CheckCircle2 size={16} />} onClick={handleMarkAsPaid}>Confirmar Recebimento</Button>
            </div>
          </div>
        </Modal>
      )}
      <Modal open={pdfViewerOpen} onClose={() => setPdfViewerOpen(false)} title="Visualizar fatura"><div className="invoice-pdf-viewer"><div className="invoice-pdf-toolbar"><strong>Visualização da fatura</strong><Button size="sm" variant="secondary" onClick={() => setPdfViewerOpen(false)}>Fechar</Button></div><div className="invoice-pdf-page"><div className="pdf-doc-header"><div><span className="pdf-brand-mark">G</span><div><strong>GSA HUB</strong><small>Gestão de serviços administrativos</small></div></div><span className="pdf-doc-type">FATURA</span></div><div className="pdf-doc-meta"><div><small>NÚMERO</small><strong>{selectedInvoice?.code || '---'}</strong></div><div><small>EMISSÃO</small><strong>{new Date().toLocaleDateString('pt-BR')}</strong></div><div><small>STATUS</small><strong>{selectedInvoice?.status || 'Pendente'}</strong></div></div><div className="pdf-doc-section"><small>CLIENTE</small><h3>'Cliente vinculado'</h3><p>{selectedInvoice?.title || 'Serviço financeiro'}</p></div><div className="pdf-doc-line"><span>Descrição do serviço</span><strong>{selectedInvoice?.title || 'Serviço contratado'}</strong></div><div className="pdf-doc-line"><span>Valor total</span><strong>{selectedInvoice ? `R$ ${(selectedInvoice.total / 100).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : 'R$ 0,00'}</strong></div><div className="pdf-doc-total"><span>TOTAL A PAGAR</span><strong>{selectedInvoice ? `R$ ${(selectedInvoice.total / 100).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : 'R$ 0,00'}</strong></div><div className="pdf-doc-footer">Documento gerado automaticamente pelo GSA HUB · suporte@gsa.local</div></div></div></Modal>
    </div>
  );
}

export default AdminFinance;


