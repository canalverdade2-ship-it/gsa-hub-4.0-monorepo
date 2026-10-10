import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { uploadFile, getPublicFileUrl, removeFile, getPrivateFileUrl } from '../../lib/storage';
import { Search, DollarSign, Clock, CheckCircle, XCircle, ArrowUpRight, FileText, Calendar, User, FileCheck, Upload, Paperclip, X, Info } from 'lucide-react';
import { formatCurrency, formatDate } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { notificationService } from '../../lib/notificationService';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';

export function ReembolsosModule({ 
  colaboradorId, 
  colaboradorNome 
}: { 
  colaboradorId?: string, 
  colaboradorNome?: string 
}) {
  const [activeTab, setActiveTab] = useState<'pendentes' | 'historico'>('pendentes');
  const [reembolsos, setReembolsos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Estados do Modal de Confirmação de Pagamento
  const [selectedRefund, setSelectedRefund] = useState<any | null>(null);
  const [paymentDateTime, setPaymentDateTime] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [isUploadingComprovante, setIsUploadingComprovante] = useState(false);
  const comprovanteInputRef = useRef<HTMLInputElement>(null);

  // Inicializar data/hora local atual quando seleciona o reembolso
  useEffect(() => {
    if (selectedRefund) {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16);
      setPaymentDateTime(localISOTime);
    } else {
      setPaymentDateTime('');
      setComprovanteFile(null);
      setComprovantePreview(null);
    }
  }, [selectedRefund]);

  // Estados do Modal de Cancelamento de Reembolso
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelNotes, setCancelNotes] = useState('');
  const [isCancelingRefund, setIsCancelingRefund] = useState(false);

  // Estado do Modal de Detalhes
  const [detailsModalRefund, setDetailsModalRefund] = useState<any | null>(null);

  // Detalhes extras de pagamento para o Modal
  const [refundPaymentDetails, setRefundPaymentDetails] = useState<any>(null);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);

  useEffect(() => {
    if (detailsModalRefund?.ordem_compra_id) {
      fetchPaymentDetails(detailsModalRefund.ordem_compra_id);
    } else {
      setRefundPaymentDetails(null);
    }
  }, [detailsModalRefund]);

  const fetchPaymentDetails = async (ordemCompraId: string) => {
    setLoadingPaymentDetails(true);
    try {
      const { data: faturas, error } = await supabase
        .from('faturas')
        .select(`
          id,
          valor_total,
          valor_pago,
          status,
          forma_pagamento_escolhida,
          data_pagamento,
          desconto_voucher_aplicado,
          abatimento_carteira_aplicado,
          desconto_pontos_aplicado,
          pagamentos(
            id,
            metodo,
            valor,
            data_pagamento
          )
        `)
        .eq('ordem_compra_id', ordemCompraId);

      if (error) throw error;

      let totalCupom = 0;
      let totalCarteira = 0;
      let totalPontos = 0;
      let totalManual = 0; // PIX, Cartão, Boleto, etc.
      const pagamentosManuais: Record<string, number> = {};

      faturas?.forEach(f => {
        let faturaCarteira = Number(f.abatimento_carteira_aplicado || 0);
        let faturaPontos = Number(f.desconto_pontos_aplicado || 0);
        let faturaCupom = Number(f.desconto_voucher_aplicado || 0);

        // Se houver pagamentos registrados na tabela
        if (f.pagamentos && f.pagamentos.length > 0) {
          f.pagamentos.forEach((p: any) => {
            const val = Number(p.valor);
            const met = p.metodo.toLowerCase();
            
            if (['carteira', 'saldo'].includes(met)) faturaCarteira += val;
            else if (met === 'pontos') faturaPontos += val;
            else if (['voucher', 'cupom', 'indicacao'].includes(met)) faturaCupom += val;
            else {
              totalManual += val;
              pagamentosManuais[met] = (pagamentosManuais[met] || 0) + val;
            }
          });
        } else if (f.valor_pago > 0 || f.status === 'pago') {
          const val = Number(f.valor_pago) || Number(f.valor_total);
          const met = (f.forma_pagamento_escolhida || 'Desconhecido').toLowerCase();
          
          if (['carteira', 'saldo'].includes(met)) faturaCarteira += val;
          else if (met === 'pontos') faturaPontos += val;
          else if (['voucher', 'cupom', 'indicacao'].includes(met)) faturaCupom += val;
          else {
            totalManual += val;
            pagamentosManuais[met] = (pagamentosManuais[met] || 0) + val;
          }
        }

        totalCupom += faturaCupom;
        totalCarteira += faturaCarteira;
        totalPontos += faturaPontos;
      });
      
      const totalPedido = totalCupom + totalCarteira + totalPontos + totalManual;

      setRefundPaymentDetails({
        totalPedido,
        totalCupom,
        totalCarteira,
        totalPontos,
        pagamentosManuais,
        totalReembolsoAutomatico: totalCarteira + totalPontos,
        valorPendenteReembolso: totalManual
      });
    } catch (err) {
      console.error('Erro ao buscar detalhes de pagamento:', err);
    } finally {
      setLoadingPaymentDetails(false);
    }
  };

  useEffect(() => {
    fetchReembolsos();

    const channel = supabase
      .channel('admin-reembolsos-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'loja_reembolsos'
      }, () => {
        fetchReembolsos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab, search]);

  const fetchReembolsos = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('loja_reembolsos')
        .select(`
          *,
          clientes(nome, email, telefone),
          ordens_compra(
            id,
            codigo_ordem,
            status,
            produtos(nome),
            orcamentos(codigo_orcamento)
          )
        `);

      if (activeTab === 'pendentes') {
        query = query.eq('status', 'pendente');
      } else {
        query = query.in('status', ['pago', 'cancelado']);
      }

      const { data, error } = await query.order('criado_em', { ascending: false });
      if (error) throw error;

      if (data) {
        // Filtragem manual simples para busca por cliente/código
        const filtered = data.filter((item: any) => {
          const clientName = item.clientes?.nome?.toLowerCase() || '';
          const refundCode = item.codigo_reembolso?.toLowerCase() || '';
          const orderCode = item.ordens_compra?.codigo_ordem?.toLowerCase() || '';
          const budgetCode = item.ordens_compra?.orcamentos?.codigo_orcamento?.toLowerCase() || '';
          const searchLower = search.toLowerCase();

          return (
            clientName.includes(searchLower) ||
            refundCode.includes(searchLower) ||
            orderCode.includes(searchLower) ||
            budgetCode.includes(searchLower)
          );
        });
        setReembolsos(filtered);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao buscar reembolsos.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedRefund) return;
    if (!paymentDateTime.trim()) {
      toast.error('Por favor, informe a data e hora do pagamento.');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const dataPagamentoISO = new Date(paymentDateTime).toISOString();
      let comprovanteUrl: string | null = null;

      // Upload comprovante se fornecido
      if (comprovanteFile) {
        setIsUploadingComprovante(true);
        const ext = comprovanteFile.name.split('.').pop();
        const fileName = `reembolso-${selectedRefund.codigo_reembolso}-${Date.now()}.${ext}`;
        const { url: publicUrl } = await uploadFile(comprovanteFile, 'documentos_cliente', `reembolsos/${fileName}`);
        setIsUploadingComprovante(false);

        // publicUrl is handled directly
        comprovanteUrl = publicUrl;
      }

      const { error } = await supabase
        .from('loja_reembolsos')
        .update({
          status: 'pago',
          data_pagamento: dataPagamentoISO,
          comprovante_url: comprovanteUrl,
          observacoes_pagamento: paymentNotes,
          colaborador_id: colaboradorId || null
        })
        .eq('id', selectedRefund.id);

      if (error) throw error;

      // Notificar o cliente
      await notificationService.notifyClient(
        selectedRefund.cliente_id,
        '💰 Reembolso Pago com Sucesso!',
        `O reembolso ${selectedRefund.codigo_reembolso} no valor de ${formatCurrency(selectedRefund.valor_reembolso)} foi pago em ${formatDate(dataPagamentoISO)}. As informações estão disponíveis no seu painel!`,
        'produtos',
        'reembolso_pago',
        { tab: 'cancelados', itemId: selectedRefund.ordem_compra_id }
      );

      toast.success('Pagamento de reembolso registrado com sucesso!');
      setSelectedRefund(null);
      setPaymentNotes('');
      setComprovanteFile(null);
      setComprovantePreview(null);
      fetchReembolsos();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao registrar pagamento.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleCancelRefund = async () => {
    if (!selectedRefund || !cancelNotes.trim()) {
      toast.error('Por favor, informe o motivo do cancelamento.');
      return;
    }

    setIsCancelingRefund(true);
    try {
      const { error } = await supabase
        .from('loja_reembolsos')
        .update({
          status: 'cancelado',
          observacoes_pagamento: `Cancelado pelo Admin: ${cancelNotes}`,
          colaborador_id: colaboradorId || null
        })
        .eq('id', selectedRefund.id);

      if (error) throw error;

      // Notificar cliente
      await notificationService.notifyClient(
        selectedRefund.cliente_id,
        '❌ Reembolso Cancelado',
        `A solicitação de reembolso ${selectedRefund.codigo_reembolso} foi cancelada. Motivo: ${cancelNotes}`,
        'produtos',
        'reembolso_cancelado',
        { tab: 'cancelados', itemId: selectedRefund.ordem_compra_id }
      );

      toast.success('Reembolso cancelado com sucesso!');
      setIsCancelModalOpen(false);
      setSelectedRefund(null);
      setCancelNotes('');
      fetchReembolsos();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao cancelar reembolso.');
    } finally {
      setIsCancelingRefund(false);
    }
  };

  const calculateDaysRemaining = (prazo: string) => {
    const deadline = new Date(prazo);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {/* Abas Superiores */}
      <div className="flex border-b border-neutral-200">
        <button
          onClick={() => setActiveTab('pendentes')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'pendentes'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pendentes de Pagamento
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'historico'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          Histórico de Reembolsos
        </button>
      </div>

      {/* Barra de Filtro de Busca */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-neutral-200/80 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, código do reembolso, pedido..."
            className="w-full bg-neutral-50 rounded-2xl border border-neutral-200/85 pl-11 pr-4 py-3 text-sm focus:border-indigo-500 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Grid de Reembolsos */}
      {loading ? (
        <div className="py-24 text-center">
          <Clock className="h-16 w-16 text-indigo-100 mx-auto animate-spin mb-4" />
          <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">Carregando reembolsos...</p>
        </div>
      ) : reembolsos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {reembolsos.map((refund) => {
            const daysRemaining = calculateDaysRemaining(refund.prazo_pagamento);
            const isOverdue = daysRemaining <= 0;

            return (
              <div 
                key={refund.id}
                className="group relative rounded-[2.2rem] bg-white p-6 shadow-sm border border-neutral-200 hover:shadow-xl transition-all flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Cabeçalho */}
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                        {refund.codigo_reembolso}
                      </span>
                      <h3 className="text-xl font-black text-neutral-900 tracking-tight mt-1">
                        {formatCurrency(refund.valor_reembolso)}
                      </h3>
                    </div>
                    {refund.status === 'pendente' ? (
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md shadow-sm border ${
                        isOverdue 
                          ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' 
                          : 'bg-amber-50 text-amber-600 border-amber-200'
                      }`}>
                        {isOverdue ? 'Prazo Excedido' : `Prazo: ${daysRemaining}d`}
                      </span>
                    ) : (
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md shadow-sm border ${
                        refund.status === 'pago' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                          : 'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {refund.status === 'pago' ? 'Pago' : 'Cancelado'}
                      </span>
                    )}
                  </div>

                  {/* Informações */}
                  <div className="space-y-2 text-xs font-semibold text-neutral-600 border-t border-neutral-100 pt-3">
                    <p className="flex items-center gap-1.5 text-neutral-800 font-bold">
                      <User className="w-3.5 h-3.5 text-neutral-400" />
                      {refund.clientes?.nome}
                    </p>
                    <p className="text-neutral-500 font-medium pl-5">{refund.clientes?.email}</p>
                    
                    <p className="flex items-center gap-1.5 text-neutral-600 font-bold mt-2">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      Abertura: {formatDate(refund.criado_em)}
                    </p>
                    <p className="flex items-center gap-1.5 text-neutral-600 font-bold">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      Prazo Limite: {formatDate(refund.prazo_pagamento)}
                    </p>
                    
                    <div className="mt-3 p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <span className="text-[8px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Motivo do Cancelamento</span>
                      <p className="text-[11px] text-neutral-700 leading-normal italic font-medium">"{refund.motivo_cancelamento}"</p>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="mt-6 pt-4 border-t border-neutral-100 flex flex-wrap gap-2">
                  <button
                    onClick={() => setDetailsModalRefund(refund)}
                    className="flex-1 min-w-[90px] rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                  >
                    <Info className="w-3.5 h-3.5" />
                    Detalhes
                  </button>
                  {refund.status === 'pendente' ? (
                    <>
                      <button
                        onClick={() => setSelectedRefund(refund)}
                        className="flex-1 min-w-[90px] rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/10 active:scale-95"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Pagar
                      </button>
                      <button
                        onClick={() => { setSelectedRefund(refund); setIsCancelModalOpen(true); }}
                        className="rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all"
                      >
                        Anular
                      </button>
                      {refund.clientes?.telefone && (
                        <div className="flex items-center justify-center scale-90 origin-center shrink-0">
                          <AdminWhatsAppButton
                            telefone={refund.clientes.telefone}
                            mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                              tipo: 'reembolso',
                              clienteNome: refund.clientes.nome,
                              codigo: refund.codigo_reembolso,
                              status: refund.status,
                              valorTotal: formatCurrency(refund.valor_reembolso)
                            })}
                          />
                        </div>
                      )}
                    </>
                  ) : refund.status === 'pago' ? (
                    refund.comprovante_url ? (
                      <a
                        href={refund.comprovante_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-[2] min-w-[140px] rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                      >
                        <FileCheck className="w-4 h-4" />
                        Ver Comprovante
                      </a>
                    ) : (
                      <div className="flex-[2] min-w-[140px] text-center py-2.5 text-emerald-600 font-extrabold text-[11px] uppercase tracking-wider bg-emerald-50/50 rounded-2xl border border-emerald-100">
                        Estorno Pago em {formatDate(refund.data_pagamento)}
                      </div>
                    )
                  ) : (
                    <div className="flex-[2] min-w-[140px] text-center py-2 text-red-500 font-bold text-[11px] uppercase tracking-wider">
                      Cancelado / Invalidado
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-24 text-center">
          <DollarSign className="h-16 w-16 text-neutral-200 mx-auto mb-4" />
          <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">
            Nenhum reembolso {activeTab === 'pendentes' ? 'pendente' : 'no histórico'} encontrado.
          </p>
        </div>
      )}

      {/* Modal para Informar Pagamento de Reembolso */}
      {selectedRefund && !isCancelModalOpen && (
        <Modal isOpen={!!selectedRefund} onClose={() => setSelectedRefund(null)} title="Confirmar Liquidação de Reembolso">
          <div className="space-y-6">
            <div className="rounded-2xl bg-indigo-50/50 p-5 border border-indigo-100">
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Reembolso Selecionado</span>
              <h4 className="text-xl font-black text-neutral-900 mt-1">{selectedRefund.codigo_reembolso}</h4>
              
              <div className="mt-4 space-y-2 text-xs font-semibold text-neutral-600 border-t border-indigo-100/50 pt-4">
                <p><strong>Cliente:</strong> {selectedRefund.clientes?.nome}</p>
                <p><strong>Valor Líquido:</strong> {formatCurrency(selectedRefund.valor_reembolso)}</p>
                <p><strong>Pedido Relacionado:</strong> {selectedRefund.ordens_compra?.codigo_ordem || 'N/A'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase">Data e Hora do Pagamento *</label>
                <input
                  type="datetime-local"
                  value={paymentDateTime}
                  onChange={(e) => setPaymentDateTime(e.target.value)}
                  className="w-full bg-white rounded-xl border border-neutral-200 px-4 py-3 text-xs focus:border-indigo-500 focus:outline-none"
                  required
                />
                <p className="text-[10px] text-neutral-400">Informe a data e o horário exatos em que a transferência Pix ou TED foi efetuada.</p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase">Observações Internas (Opcional)</label>
                <textarea
                  rows={3}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Notas adicionais sobre o pagamento do estorno..."
                  className="w-full bg-white rounded-xl border border-neutral-200 px-4 py-3 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase">Comprovante de Pagamento (Opcional)</label>
                <input
                  ref={comprovanteInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error('Arquivo muito grande. Máximo 10MB.');
                      return;
                    }
                    setComprovanteFile(file);
                    if (file.type.startsWith('image/')) {
                      setComprovantePreview(URL.createObjectURL(file));
                    } else {
                      setComprovantePreview('pdf');
                    }
                  }}
                />
                {!comprovanteFile ? (
                  <button
                    type="button"
                    onClick={() => comprovanteInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-neutral-200 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
                  >
                    <Upload className="w-5 h-5 text-neutral-300 group-hover:text-indigo-500 transition-colors" />
                    <span className="text-[11px] font-bold text-neutral-400 group-hover:text-indigo-500 transition-colors">Clique para anexar comprovante</span>
                    <span className="text-[10px] text-neutral-300">PNG, JPG ou PDF — máx. 10MB</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    {comprovantePreview === 'pdf' ? (
                      <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
                    ) : comprovantePreview ? (
                      <img src={comprovantePreview} alt="" className="w-12 h-12 object-cover rounded-lg border border-emerald-100 flex-shrink-0" />
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-neutral-800 truncate">{comprovanteFile.name}</p>
                      <p className="text-[10px] text-neutral-400">{(comprovanteFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setComprovanteFile(null); setComprovantePreview(null); }}
                      className="w-7 h-7 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:border-red-200 transition-all flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setSelectedRefund(null)}
                className="flex-1 rounded-xl bg-neutral-100 py-3 text-neutral-600 font-bold hover:bg-neutral-200 transition-all text-xs"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={isSubmittingPayment || isUploadingComprovante || !paymentDateTime.trim()}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-white font-bold hover:bg-emerald-700 transition-all text-xs shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUploadingComprovante ? 'Enviando comprovante...' : isSubmittingPayment ? 'Processando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal para Cancelamento / Invalidação de Reembolso */}
      {selectedRefund && isCancelModalOpen && (
        <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Cancelar Solicitação de Reembolso">
          <div className="space-y-6">
            <div className="rounded-2xl bg-red-50 p-5 border border-red-200 text-red-900">
              <h4 className="text-base font-bold mb-2">Atenção! Você está cancelando o Reembolso:</h4>
              <p className="text-xs font-bold leading-normal">
                Esta ação invalidará a Ordem de Reembolso **{selectedRefund.codigo_reembolso}** no valor de **{formatCurrency(selectedRefund.valor_reembolso)}**. O cliente será devidamente notificado da invalidação.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-700 uppercase">Justificativa do Cancelamento *</label>
              <textarea
                rows={4}
                value={cancelNotes}
                onChange={(e) => setCancelNotes(e.target.value)}
                placeholder="Descreva detalhadamente a justificativa técnica para o cancelamento deste reembolso..."
                className="w-full bg-white rounded-xl border border-neutral-200 px-4 py-3 text-xs focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="flex-1 rounded-xl bg-neutral-100 py-3 text-neutral-600 font-bold hover:bg-neutral-200 transition-all text-xs"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelRefund}
                disabled={isCancelingRefund || !cancelNotes.trim()}
                className="flex-1 rounded-xl bg-red-600 py-3 text-white font-bold hover:bg-red-700 transition-all text-xs shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {isCancelingRefund ? 'Processando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de Detalhes do Reembolso */}
      {detailsModalRefund && (
        <Modal isOpen={!!detailsModalRefund} onClose={() => setDetailsModalRefund(null)} title="Detalhes do Reembolso">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Código do Reembolso</span>
                <p className="text-sm font-bold text-neutral-800">{detailsModalRefund.codigo_reembolso}</p>
              </div>
              <div className="col-span-2 sm:col-span-1 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Status</span>
                <p className={`text-sm font-bold uppercase ${
                  detailsModalRefund.status === 'pendente' ? 'text-amber-600' :
                  detailsModalRefund.status === 'pago' ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {detailsModalRefund.status}
                </p>
              </div>
            </div>

            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 space-y-3">
              <h4 className="text-xs font-black text-indigo-800 uppercase tracking-widest border-b border-indigo-100 pb-2">Informações Financeiras</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-neutral-500 font-medium">Valor Solicitado (Reembolso):</div>
                <div className="text-neutral-900 font-bold text-right">{formatCurrency(detailsModalRefund.valor_reembolso)}</div>
                <div className="text-neutral-500 font-medium">Pedido Relacionado:</div>
                <div className="text-neutral-900 font-bold text-right">{detailsModalRefund.ordens_compra?.codigo_ordem || 'N/A'}</div>
                <div className="text-neutral-500 font-medium">Orçamento Ref.:</div>
                <div className="text-neutral-900 font-bold text-right">{detailsModalRefund.ordens_compra?.orcamentos?.codigo_orcamento || 'N/A'}</div>
              </div>
            </div>

            {/* Resumo de Pagamento / Reembolso Automático */}
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/50 space-y-3">
              <h4 className="text-xs font-black text-emerald-800 uppercase tracking-widest border-b border-emerald-100 pb-2 flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5" /> Composição do Pagamento
              </h4>
              {loadingPaymentDetails ? (
                <div className="text-center py-4">
                  <Clock className="w-5 h-5 text-emerald-300 animate-spin mx-auto" />
                  <p className="text-[10px] font-bold text-emerald-600 mt-2 uppercase">Buscando transações...</p>
                </div>
              ) : refundPaymentDetails ? (
                <div className="space-y-4">
                  
                  {/* Detalhamento do Pedido */}
                  <div className="space-y-2 text-sm border-b border-emerald-100 pb-3">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1">Detalhamento do Pedido</span>
                    
                    <div className="flex justify-between items-center text-neutral-600">
                      <span>Total do Pedido:</span>
                      <span className="font-bold text-neutral-900">{formatCurrency(refundPaymentDetails.totalPedido)}</span>
                    </div>

                    {refundPaymentDetails.totalCupom > 0 && (
                      <div className="flex justify-between items-center text-neutral-600">
                        <span>Valor Usado em Cupom/Voucher:</span>
                        <span className="font-bold text-neutral-900">{formatCurrency(refundPaymentDetails.totalCupom)}</span>
                      </div>
                    )}
                    
                    {refundPaymentDetails.totalCarteira > 0 && (
                      <div className="flex justify-between items-center text-neutral-600">
                        <span>Valor Carteira Virtual:</span>
                        <span className="font-bold text-neutral-900">{formatCurrency(refundPaymentDetails.totalCarteira)}</span>
                      </div>
                    )}
                    
                    {refundPaymentDetails.totalPontos > 0 && (
                      <div className="flex justify-between items-center text-neutral-600">
                        <span>Valor Carteira Pontos:</span>
                        <span className="font-bold text-neutral-900">{formatCurrency(refundPaymentDetails.totalPontos)}</span>
                      </div>
                    )}

                    {Object.entries(refundPaymentDetails.pagamentosManuais || {}).map(([metodo, valor]: any) => (
                      <div key={metodo} className="flex justify-between items-center text-neutral-600">
                        <span className="capitalize">Valor Pago {metodo}:</span>
                        <span className="font-bold text-neutral-900">{formatCurrency(valor)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-emerald-700 font-medium">Reembolsado Auto (Saldo/Pontos):</div>
                    <div className="text-emerald-900 font-bold text-right">{formatCurrency(refundPaymentDetails.totalReembolsoAutomatico)}</div>
                    
                    <div className="text-emerald-800 font-black pt-2 border-t border-emerald-100/50">Restante a ser Reembolsado:</div>
                    <div className="text-red-600 font-black text-right pt-2 border-t border-emerald-100/50">{formatCurrency(refundPaymentDetails.valorPendenteReembolso)}</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-500 text-center py-2">Não foi possível carregar as informações de pagamento.</p>
              )}
            </div>

            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-3">
              <h4 className="text-xs font-black text-neutral-600 uppercase tracking-widest border-b border-neutral-200 pb-2">Dados do Cliente</h4>
              <div className="space-y-1 text-sm">
                <p><span className="text-neutral-500 font-medium">Nome:</span> <span className="text-neutral-900 font-bold">{detailsModalRefund.clientes?.nome}</span></p>
                <p><span className="text-neutral-500 font-medium">E-mail:</span> <span className="text-neutral-900 font-bold">{detailsModalRefund.clientes?.email}</span></p>
                <p><span className="text-neutral-500 font-medium">Telefone:</span> <span className="text-neutral-900 font-bold">{detailsModalRefund.clientes?.telefone || 'Não informado'}</span></p>
              </div>
            </div>

            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-3">
              <h4 className="text-xs font-black text-neutral-600 uppercase tracking-widest border-b border-neutral-200 pb-2">Datas e Prazos</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-neutral-500 font-medium">Abertura:</div>
                <div className="text-neutral-900 font-bold text-right">{formatDate(detailsModalRefund.criado_em)}</div>
                <div className="text-neutral-500 font-medium">Prazo Limite:</div>
                <div className="text-neutral-900 font-bold text-right">{formatDate(detailsModalRefund.prazo_pagamento)}</div>
                {detailsModalRefund.data_pagamento && (
                  <>
                    <div className="text-neutral-500 font-medium">Data do Pagamento:</div>
                    <div className="text-neutral-900 font-bold text-right">{formatDate(detailsModalRefund.data_pagamento)}</div>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-3">
              <h4 className="text-xs font-black text-neutral-600 uppercase tracking-widest border-b border-neutral-200 pb-2">Motivo / Observações</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Motivo do Cancelamento / Reembolso</span>
                  <p className="text-neutral-800 font-medium">{detailsModalRefund.motivo_cancelamento || 'Não informado'}</p>
                </div>
                {detailsModalRefund.observacoes_pagamento && (
                  <div>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Observações do Processamento</span>
                    <p className="text-neutral-800 font-medium whitespace-pre-wrap">{detailsModalRefund.observacoes_pagamento}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setDetailsModalRefund(null)}
                className="w-full rounded-xl bg-neutral-200 py-3 text-neutral-700 font-bold hover:bg-neutral-300 transition-all text-sm shadow-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
