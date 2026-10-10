import { useState, useEffect, useRef } from 'react';
import { Search, FileText, CheckCircle, XCircle, Wallet, Ticket, CreditCard, Filter, Printer, ArrowDownCircle, Check, X, Info, Landmark, Send, MessageSquare, ClipboardList, History, Building2, Plus, Calendar, Clock, User, ShoppingBag, ChevronLeft, Repeat2, Gavel, Receipt, BadgePercent, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Fatura, Cliente, Voucher, Saque } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, formatDateTime, generateCode, maskCurrency } from '../../lib/utils';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { generateFaturaPDF } from '../../lib/pdf';
import { pdfSharingService } from '../../lib/pdfSharingService';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { PainelRentabilidade } from './PainelRentabilidade';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { CobrancaModule } from './CobrancaModule';
import { FiscalModule } from './FiscalModule';
import { AffiliateAdminModule } from './AffiliateAdminModule';
import { sessionService } from '../../lib/sessionService';

export function FaturaDetails({ 
  fatura, 
  onManualPay, 
  onCancel,
  onGerarFiscal,
  onEnviarParaCobranca,
  colaboradorId,
  colaboradorNome
}: { 
  fatura: any, 
  onManualPay?: (method: string, dateTime: string, notes: string) => void,
  onCancel?: () => void,
  onGerarFiscal?: () => void,
  onEnviarParaCobranca?: () => void,
  colaboradorId?: string,
  colaboradorNome?: string
}) {
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDateTime, setPaymentDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [enviandoParaCobranca, setEnviandoParaCobranca] = useState(false);
  
  // Acordo / Negociação (mantido para compatibilidade)
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [acordoData, setAcordoData] = useState({
    novoValor: String(fatura.valor_total).replace('.', ','),
    novaDataVencimento: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    motivo: ''
  });
  const [processandoAcordo, setProcessandoAcordo] = useState(false);

  // Auto-envio para cobrança ao abrir modal de fatura vencida sem cobrança
  useEffect(() => {
    if (
      fatura.status === 'vencida' &&
      !fatura.tem_cobranca &&
      onEnviarParaCobranca
    ) {
      onEnviarParaCobranca();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contestação
  const [contestacao, setContestacao] = useState<any | null>(undefined); // undefined = carregando
  const [respostaAdmin, setRespostaAdmin] = useState('');
  const [processandoContestacao, setProcessandoContestacao] = useState(false);

  useEffect(() => {
    const fetchContestacao = async () => {
      const { data } = await supabase
        .from('fatura_contestacoes')
        .select('*')
        .eq('fatura_id', fatura.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setContestacao(data || null);
    };
    fetchContestacao();
  }, [fatura.id]);

  const handleResponderContestacao = async (novoStatus: 'resolvida' | 'recusada') => {
    if (!contestacao) return;
    if (!respostaAdmin.trim()) { return; }
    setProcessandoContestacao(true);
    try {
      const { error } = await supabase
        .from('fatura_contestacoes')
        .update({ status: novoStatus, resposta_admin: respostaAdmin.trim(), updated_at: new Date().toISOString() })
        .eq('id', contestacao.id);
      if (error) throw error;

      // Notifica o cliente
      const emoji = novoStatus === 'resolvida' ? '✅' : '❌';
      await createNotification(
        fatura.cliente_id,
        `Contestação ${novoStatus === 'resolvida' ? 'Resolvida' : 'Recusada'} ${emoji}`,
        `Sua contestação da fatura #${fatura.codigo_fatura} foi ${novoStatus === 'resolvida' ? 'resolvida' : 'recusada'}. Confira a resposta no portal.`,
        'financeiro',
        'faturas',
        fatura.id,
        'contestacao_respondida'
      );

      setContestacao((prev: any) => ({ ...prev, status: novoStatus, resposta_admin: respostaAdmin.trim() }));
      toast.success(`Contestação ${novoStatus === 'resolvida' ? 'marcada como resolvida' : 'recusada'} com sucesso!`);
    } catch (err) {
      console.error('Erro ao responder contestação:', err);
      toast.error('Erro ao processar a contestação.');
    } finally {
      setProcessandoContestacao(false);
    }
  };

  // Ajuste de valor
  const [ajusteDesconto, setAjusteDesconto] = useState(String(fatura.desconto_manual || ''));
  const [ajusteAcrescimo, setAjusteAcrescimo] = useState(String(fatura.acrescimo_manual || ''));
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [aplicandoAjuste, setAplicandoAjuste] = useState(false);

  const handleAplicarAjuste = async () => {
    const desconto = parseFloat(ajusteDesconto) || 0;
    const acrescimo = parseFloat(ajusteAcrescimo) || 0;
    if (!ajusteMotivo.trim()) return toast.error('Informe o motivo do ajuste.');
    if (desconto < 0 || acrescimo < 0) return toast.error('Os valores nao podem ser negativos.');
    setAplicandoAjuste(true);
    try {
      const session = sessionService.getCurrentSession();
      if (!session?.sessaoId || !session?.sessionToken) {
        throw new Error('Sessao administrativa expirada. Faca login novamente.');
      }

      const { data, error } = await supabase.rpc('gsa_admin_aplicar_ajuste_fatura', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: fatura.id,
        p_desconto: desconto,
        p_acrescimo: acrescimo,
        p_motivo: ajusteMotivo.trim()
      });

      if (error) throw error;

      const novoTotal = Number(data?.valor_total ?? 0);
      const baseOriginal = Number(data?.valor_base_original ?? fatura.valor_base_original ?? fatura.valor_total);
      const novoHistorico = data?.historico_ajustes || fatura.historico_ajustes || [];

      let detalheAjuste = '';
      if (acrescimo > 0 && desconto > 0) {
        detalheAjuste = `• *Acréscimo:* + ${formatCurrency(acrescimo)}\n• *Desconto:* - ${formatCurrency(desconto)}`;
      } else if (acrescimo > 0) {
        detalheAjuste = `• *Acréscimo Aplicado:* + ${formatCurrency(acrescimo)}`;
      } else if (desconto > 0) {
        detalheAjuste = `• *Desconto Aplicado:* - ${formatCurrency(desconto)}`;
      } else {
        detalheAjuste = `• *Ajuste de Valor:* Valor atualizado`;
      }

      const mensagemNotificacao = [
        `Informamos que houve um ajuste nos valores da sua fatura *#${fatura.codigo_fatura}*.`,
        ``,
        `📊 *DETALHES DO AJUSTE:*`,
        `• *Valor Anterior:* ${formatCurrency(baseOriginal)}`,
        detalheAjuste,
        `• *Novo Valor Total:* *${formatCurrency(novoTotal)}*`,
        `• *Motivo / Justificativa:* _${ajusteMotivo.trim()}_`,
        ``,
        `▶️ *PRÓXIMO PASSO:*`,
        `Acesse o Portal do Cliente GSA para conferir os detalhes e realizar o pagamento.`
      ].join('\n');

      await createNotification(
        fatura.cliente_id,
        'Fatura Atualizada',
        mensagemNotificacao,
        'financeiro',
        'faturas',
        fatura.id,
        'ajuste_fatura'
      );

      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: (window as any).colaborador_id,
        ator_nome: (window as any).colaborador_nome,
        acao: 'AJUSTE_FINANCEIRO_MANUAL',
        detalhes: `Ajuste manual na fatura ${fatura.codigo_fatura}: Novo valor ${formatCurrency(novoTotal)}. Desconto: ${formatCurrency(desconto)}, Acrescimo: ${formatCurrency(acrescimo)}. Motivo: ${ajusteMotivo.trim()}`
      });

      toast.success(`Ajuste aplicado! Novo valor: ${formatCurrency(novoTotal)}`);
      fatura.valor_total = novoTotal;
      fatura.valor_final_pendente = Math.max(0, novoTotal - Number(fatura.valor_pago || 0));
      fatura.desconto_manual = desconto;
      fatura.acrescimo_manual = acrescimo;
      fatura.valor_base_original = baseOriginal;
      fatura.historico_ajustes = novoHistorico;
      setAjusteMotivo('');
      setAjusteDesconto('');
      setAjusteAcrescimo('');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao aplicar ajuste.');
    } finally {
      setAplicandoAjuste(false);
    }
  };

  const handleSendFaturaWithPDF = async () => {
    try {
      setIsGeneratingPDF(true);
      toast.loading('Gerando PDF da fatura...', { id: 'pdf-toast' });
      
      const os = fatura.ordens_servico;
      const doc = await generateFaturaPDF(fatura, fatura.clientes, os, { returnDoc: true }) as any;
      if (!doc) throw new Error("Erro ao gerar PDF");

      const pdfBase64 = doc.output('datauristring');

      const mensagemBase = whatsappNotificationService.gerarMensagemWhatsApp({
        tipo: 'fatura',
        clienteNome: fatura.clientes?.nome,
        codigo: fatura.codigo_fatura,
        status: fatura.status === 'pago' ? 'Paga' : fatura.status === 'vencida' ? 'Vencida' : fatura.status === 'cancelado' ? 'Cancelada' : 'Pendente',
        dataVencimento: fatura.data_vencimento ? formatDate(fatura.data_vencimento) : undefined,
        valorTotal: formatCurrency(fatura.valor_total)
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        fatura.clientes?.telefone, 
        mensagemBase,
        {
          mediaBase64: pdfBase64,
          fileName: `fatura_${fatura.codigo_fatura}.pdf`
        }
      );

      if (sent) {
        toast.success('✅ PDF da fatura e notificação enviados no WhatsApp!', { id: 'pdf-toast' });
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao enviar notificação com PDF', { id: 'pdf-toast' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const details = getFaturaDetails(fatura);

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* Coluna Principal (Conteúdo) */}
      <div className="w-full xl:w-2/3 space-y-6">
        
        {/* Cabeçalho Premium da Fatura */}
        <div className="relative rounded-[2.5rem] bg-[#1a1a1a] p-8 text-white shadow-2xl">
          <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none"></div>
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-300 ring-1 ring-white/20">
                Fatura Gerada
              </span>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase mt-1">
                #{fatura.codigo_fatura}
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-bold text-neutral-400">
                <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl"><Calendar className="h-4 w-4" /> Emissão: {formatDate(fatura.data_emissao || fatura.created_at || fatura.data_vencimento)}</span>
                <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl"><Clock className="h-4 w-4" /> Vencimento: <span className="text-white">{formatDate(fatura.data_vencimento)}</span></span>
              </div>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-2">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 p-1 rounded-2xl backdrop-blur-sm">
                  <AdminWhatsAppButton 
                    telefone={fatura.clientes?.telefone}
                    isGeneratingPDF={isGeneratingPDF}
                    onSendWithPDF={handleSendFaturaWithPDF}
                    mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                      tipo: 'fatura',
                      clienteNome: fatura.clientes?.nome,
                      codigo: fatura.codigo_fatura,
                      status: fatura.status === 'pago' ? 'Paga' : fatura.status === 'vencida' ? 'Vencida' : fatura.status === 'cancelado' ? 'Cancelada' : 'Pendente',
                      dataVencimento: fatura.data_vencimento ? formatDate(fatura.data_vencimento) : undefined,
                      valorTotal: formatCurrency(fatura.valor_total)
                    })}
                  />
                </div>
                <span className={`inline-flex items-center justify-center px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg ${
                  fatura.status === 'pago' ? 'bg-emerald-500 text-white shadow-emerald-500/30' :
                  fatura.status === 'vencida' ? 'bg-rose-500 text-white shadow-rose-500/30' :
                  fatura.status === 'fatura_negociada' ? 'bg-indigo-500 text-white shadow-indigo-500/30' :
                  'bg-amber-500 text-white shadow-amber-500/30'
                }`}>
                  {fatura.status.replace('_', ' ')}
                </span>
              </div>
              {fatura.tem_cobranca && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 text-[10px] font-black uppercase tracking-widest ring-1 ring-rose-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  Em Cobrança
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Informações do Cliente */}
        <div className="rounded-3xl bg-white p-6 ring-1 ring-neutral-200 shadow-sm relative overflow-hidden group">
          <div className="absolute right-0 top-0 h-full w-2 bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-100"></div>
          <h4 className="mb-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
            <User className="h-4 w-4 text-indigo-500" />
            Dados do Cliente
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-1">Nome / Razão Social</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-neutral-900">{fatura.clientes?.nome || 'N/A'}</p>
                {fatura.clientes?.plano_vip && (
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight shadow-sm ${
                    fatura.clientes.plano_vip === 'black' ? 'bg-black text-white ring-1 ring-white/20' :
                    fatura.clientes.plano_vip === 'platinum' ? 'bg-neutral-800 text-neutral-100' :
                    fatura.clientes.plano_vip === 'gold' ? 'bg-amber-100 text-amber-700' :
                    fatura.clientes.plano_vip === 'silver' ? 'bg-neutral-200 text-neutral-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {fatura.clientes.plano_vip}
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-1">Documento (CPF/CNPJ)</p>
              <p className="text-sm font-bold text-neutral-900 font-mono">{fatura.clientes?.cnpj || fatura.clientes?.cpf || 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-1">Contato</p>
              <p className="text-sm font-bold text-neutral-900">{fatura.clientes?.telefone || 'N/A'}</p>
              <p className="text-xs font-medium text-neutral-500 truncate">{fatura.clientes?.email || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Detalhamento Financeiro (Tabela de Itens) */}
        <div className="rounded-3xl bg-white ring-1 ring-neutral-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-indigo-500" />
              Itens Faturados
            </h4>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b-2 border-neutral-100">
                    <th className="pb-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Descrição do Item</th>
                    <th className="pb-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Qtd</th>
                    <th className="pb-3 px-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-right whitespace-nowrap">V. Unitário</th>
                    <th className="pb-3 pl-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-right whitespace-nowrap">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {Array.isArray(fatura.itens_faturados) && fatura.itens_faturados.length > 0 ? (
                    fatura.itens_faturados.map((item: any, idx: number) => (
                      <tr key={idx} className="group hover:bg-neutral-50/50 transition-colors">
                        <td className="py-4 pr-4">
                          <p className="text-xs font-bold text-neutral-800">{item.descricao || item.nome || 'Produto/Serviço'}</p>
                          {item.codigo && <span className="text-[9px] font-mono text-neutral-400">{item.codigo}</span>}
                        </td>
                        <td className="py-4 text-center text-xs font-bold text-neutral-600">
                          {item.quantidade || 1}
                        </td>
                        <td className="py-4 px-4 text-right text-xs font-bold text-neutral-600 whitespace-nowrap">
                          {formatCurrency(item.valor_unitario || item.valor || 0)}
                        </td>
                        <td className="py-4 pl-4 text-right text-sm font-black text-neutral-900 whitespace-nowrap">
                          {formatCurrency(item.subtotal || ((item.quantidade || 1) * (item.valor_unitario || item.valor || 0)))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="group hover:bg-neutral-50/50 transition-colors">
                      <td className="py-4 pr-4">
                        <p className="text-xs font-bold text-neutral-800">{details.itemLabel}</p>
                      </td>
                      <td className="py-4 text-center text-xs font-bold text-neutral-600">
                        {details.quantidade || 1}
                      </td>
                      <td className="py-4 px-4 text-right text-xs font-bold text-neutral-600 whitespace-nowrap">
                        {formatCurrency(details.valorItem)}
                      </td>
                      <td className="py-4 pl-4 text-right text-sm font-black text-neutral-900 whitespace-nowrap">
                        {formatCurrency(details.valorItem * (details.quantidade || 1))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Resumo Financeiro */}
            <div className="flex justify-end pt-4 border-t border-neutral-100">
              <div className="w-full sm:w-1/2 lg:w-1/3 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-neutral-500">
                  <span>Subtotal Base</span>
                  <span>{formatCurrency(fatura.valor_base_original || fatura.valor_total)}</span>
                </div>
                
                {fatura.acrescimo_manual > 0 && (
                  <div className="flex justify-between items-center text-xs font-bold text-amber-600">
                    <span>Acréscimos</span>
                    <span>+ {formatCurrency(fatura.acrescimo_manual)}</span>
                  </div>
                )}
                
                {fatura.desconto_manual > 0 && (
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-600">
                    <span>Descontos</span>
                    <span>- {formatCurrency(fatura.desconto_manual)}</span>
                  </div>
                )}

                {/* Exibição adicional para assinaturas se baseada no pedido antigo */}
                {fatura.tipo === 'assinatura' && details.quantidade_meses && (
                   <div className="flex justify-between items-center text-[10px] text-indigo-500 font-bold uppercase">
                     <span>Duração</span>
                     <span>{details.quantidade_meses} Meses</span>
                   </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-neutral-200">
                  <span className="text-sm font-black text-neutral-900 uppercase tracking-widest">Total Final</span>
                  <span className="text-2xl font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl">
                    {formatCurrency(fatura.valor_total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Composição do Pagamento (Apenas se pago) */}
        {fatura.status === 'pago' && (() => {
          const voucherDesc = Number(fatura.desconto_voucher_aplicado) || 0;
          const pontosDesc  = Number(fatura.desconto_pontos_aplicado)  || 0;
          const carteiraDesc= Number(fatura.abatimento_carteira_aplicado) || 0;
          const pagamentosArr = Array.isArray(fatura.pagamentos) ? fatura.pagamentos : [];
          if (!voucherDesc && !pontosDesc && !carteiraDesc && !pagamentosArr.length) return null;
          const metodoLabel = (m) => ({
            pix: 'PIX', credit_card: 'Cartão de Crédito',
            cartao: 'Cartão de Crédito', boleto: 'Boleto',
            infinitepay: 'InfinitePay', manual: 'Manual', dinheiro: 'Dinheiro', debito: 'Débito'
          }[m?.toLowerCase()] || m || 'Pagamento');
          
          return (
            <div className="rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-100 shadow-sm space-y-4">
              <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Composição do Pagamento
              </h4>
              {fatura.observacoes && (
                 <div className="p-4 rounded-xl bg-white border border-indigo-100 text-xs font-medium text-indigo-900 whitespace-pre-wrap leading-relaxed">
                   <span className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">
                     Histórico / Observações
                   </span>
                   {fatura.observacoes}
                 </div>
              )}
              
              <div className="space-y-2 bg-white p-4 rounded-2xl">
                {voucherDesc > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-700 font-bold flex items-center gap-2"><Ticket className="h-4 w-4" /> Voucher (desconto)</span>
                    <span className="font-black text-emerald-700">- {formatCurrency(voucherDesc)}</span>
                  </div>
                )}
                {pontosDesc > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-700 font-bold flex items-center gap-2"><History className="h-4 w-4" /> Pontos</span>
                    <span className="font-black text-indigo-700">- {formatCurrency(pontosDesc)}</span>
                  </div>
                )}
                {carteiraDesc > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-violet-700 font-bold flex items-center gap-2"><Wallet className="h-4 w-4" /> Saldo da Carteira</span>
                    <span className="font-black text-violet-700">- {formatCurrency(carteiraDesc)}</span>
                  </div>
                )}
                {(() => {
                  const externalPagamentos = pagamentosArr.filter((p: any) => !['voucher', 'pontos', 'carteira'].includes(p.metodo?.toLowerCase()));
                  const hasNotes = !!fatura.observacoes;
                  if (externalPagamentos.length > 0) {
                    return externalPagamentos.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-neutral-700 font-bold flex items-center gap-2"><CreditCard className="h-4 w-4" /> {metodoLabel(p.metodo)}{hasNotes ? ' - Baixa realizada manualmente pelo financeiro' : ''}</span>
                        <span className="font-black text-neutral-900">{formatCurrency(p.valor)}</span>
                      </div>
                    ));
                  }
                  if (fatura.status === 'pago') {
                    const valorTotalFatura = Number(fatura.valor_pago || fatura.valor_total || 0);
                    if (valorTotalFatura > 0) {
                      const metodo = fatura.forma_pagamento_escolhida || 'PIX';
                      return (
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-700 font-bold flex items-center gap-2"><CreditCard className="h-4 w-4" /> {metodoLabel(metodo)}{hasNotes ? ' - Baixa realizada manualmente pelo financeiro' : ''}</span>
                          <span className="font-black text-neutral-900">{formatCurrency(valorTotalFatura)}</span>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
              </div>
              
              <div className="flex justify-between items-center pt-3 px-4 border-t border-emerald-200">
                <span className="text-sm font-black text-emerald-800 uppercase tracking-tight">Total Pago Real</span>
                <span className="text-xl font-black text-emerald-700">{formatCurrency(fatura.valor_pago || fatura.valor_total)}</span>
              </div>
            </div>
          );
        })()}

        {fatura.status === 'pago' && fatura.tipo === 'servico' && (
          <PainelRentabilidade tipo="realizado" faturaId={fatura.id} />
        )}

        {/* Contestação Panel */}
        {contestacao !== undefined && contestacao !== null && (
          <div className={`rounded-3xl p-6 ring-1 shadow-sm space-y-4 ${
            contestacao.status === 'resolvida' ? 'bg-emerald-50 ring-emerald-200' :
            contestacao.status === 'recusada' ? 'bg-red-50 ring-red-200' :
            'bg-orange-50 ring-orange-200'
          }`}>
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black text-neutral-700 uppercase tracking-widest flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-orange-500" />
                Contestação do Cliente
              </h4>
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                contestacao.status === 'resolvida' ? 'bg-emerald-100 text-emerald-700' :
                contestacao.status === 'recusada' ? 'bg-red-100 text-red-700' :
                contestacao.status === 'em_analise' ? 'bg-blue-100 text-blue-700' :
                'bg-orange-100 text-orange-700'
              }`}>
                {contestacao.status === 'aberta' ? 'Aguardando análise' :
                 contestacao.status === 'em_analise' ? 'Em análise' :
                 contestacao.status === 'resolvida' ? 'Resolvida' : 'Recusada'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/70 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Motivo</p>
                <p className="text-sm font-bold text-neutral-800">{contestacao.motivo}</p>
              </div>
              <div className="bg-white/70 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Enviada em</p>
                <p className="text-sm font-bold text-neutral-800">{formatDate(contestacao.created_at)}</p>
              </div>
            </div>
            <div className="bg-white/70 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Descrição do cliente</p>
              <p className="text-sm text-neutral-700 leading-relaxed">{contestacao.descricao}</p>
            </div>
            {contestacao.resposta_admin && (
              <div className="bg-white rounded-2xl p-4 ring-1 ring-emerald-200">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Resposta enviada</p>
                <p className="text-sm text-neutral-700">{contestacao.resposta_admin}</p>
              </div>
            )}
            {['aberta', 'em_analise'].includes(contestacao.status) && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-wider block mb-1.5">Resposta ao cliente (obrigatório)</label>
                  <textarea
                    value={respostaAdmin}
                    onChange={e => setRespostaAdmin(e.target.value)}
                    rows={3}
                    placeholder="Descreva a análise e decisão tomada..."
                    className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleResponderContestacao('resolvida')}
                    disabled={processandoContestacao || !respostaAdmin.trim()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" /> Resolver
                  </button>
                  <button
                    onClick={() => handleResponderContestacao('recusada')}
                    disabled={processandoContestacao || !respostaAdmin.trim()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-red-600 hover:bg-red-700 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md transition-all disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Recusar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coluna Lateral (Ações) */}
      <div className="w-full xl:w-1/3 flex flex-col gap-4">
        
        {/* Painel de Exportação e Ações Rápidas */}
        <div className="rounded-3xl bg-white p-6 ring-1 ring-neutral-200 shadow-sm flex flex-col gap-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Ações Rápidas</h4>
          <PDFExportMenu 
            onDownload={() => generateFaturaPDF(fatura, fatura.clientes, fatura.ordens_servico)}
            onWhatsApp={async () => {
              const doc = await generateFaturaPDF(fatura, fatura.clientes, fatura.ordens_servico, { returnDoc: true });
              if (doc) {
                const result = await pdfSharingService.uploadAndGetLink(doc, `fatura_${fatura.codigo_fatura}.pdf`);
                if (result) {
                  await pdfSharingService.shareViaWhatsApp(fatura.clientes?.telefone || '', result.url, 'Fatura', fatura.codigo_fatura);
                  setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                }
              }
            }}
            onEmail={async () => {
              const doc = await generateFaturaPDF(fatura, fatura.clientes, fatura.ordens_servico, { returnDoc: true });
              if (doc) {
                const result = await pdfSharingService.uploadAndGetLink(doc, `fatura_${fatura.codigo_fatura}.pdf`);
                if (result) {
                  await pdfSharingService.shareViaEmail(fatura.clientes?.email || '', 'Fatura', fatura.codigo_fatura, result.url);
                  setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                }
              }
            }}
          />
          
          {(!fatura.ordens_fiscais || fatura.ordens_fiscais.length === 0) && (
            <button 
              onClick={onGerarFiscal}
              className="w-full mt-2 rounded-2xl border border-indigo-200 bg-indigo-50/50 py-3 text-indigo-600 font-black uppercase tracking-widest text-[10px] hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <FileText className="h-4 w-4" />
              Enviar ao Módulo Fiscal
            </button>
          )}
        </div>

        {/* Baixa Administrativa (Manual) */}
        {fatura.status !== 'pago' && fatura.status !== 'cancelado' && (
          <div className="rounded-3xl bg-neutral-50/80 p-6 ring-1 ring-neutral-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <h4 className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Baixa Administrativa</h4>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-neutral-400 uppercase ml-1 block mb-1">Forma de Pgto.</label>
                <select 
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="debito">Cartão de Débito</option>
                  <option value="indicacao">Bonificação / Indicação</option>
                </select>
              </div>
              
              <div>
                <label className="text-[9px] font-black text-neutral-400 uppercase ml-1 block mb-1">Data / Hora</label>
                <input 
                  type="datetime-local"
                  value={paymentDateTime}
                  onChange={e => setPaymentDateTime(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-neutral-400 uppercase ml-1 block mb-1">Observações</label>
                <textarea 
                  placeholder="Motivo da baixa manual..."
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                />
              </div>
            </div>

            <button 
              onClick={() => onManualPay && onManualPay(paymentMethod, paymentDateTime, paymentNotes)}
              disabled={!paymentNotes}
              className="w-full rounded-xl bg-emerald-600 py-3 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Confirmar Pagamento
            </button>
          </div>
        )}

        {/* Ajuste de Valor */}
        {fatura.status !== 'pago' && fatura.status !== 'cancelado' && (
          <div className="rounded-3xl bg-indigo-50/60 ring-1 ring-indigo-200 p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-indigo-500" />
              <h4 className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Ajustes Manuais</h4>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-emerald-600 uppercase tracking-wider block mb-1">
                    Desconto (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400">R$</span>
                    <input 
                      type="text"
                      value={ajusteDesconto ? maskCurrency(ajusteDesconto) : ''}
                      inputMode="decimal"
onChange={e => {
                        const val = e.target.value.replace(/\D/g, "");
                        setAjusteDesconto((Number(val) / 100).toString());
                      }}
                      placeholder="0,00"
                      className="w-full pl-7 pr-2 py-2 rounded-xl border border-emerald-200 bg-white text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-400/30 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-amber-600 uppercase tracking-wider block mb-1">
                    Acréscimo (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400">R$</span>
                    <input 
                      type="text"
                      value={ajusteAcrescimo ? maskCurrency(ajusteAcrescimo) : ''}
                      inputMode="decimal"
onChange={e => {
                        const val = e.target.value.replace(/\D/g, "");
                        setAjusteAcrescimo((Number(val) / 100).toString());
                      }}
                      placeholder="0,00"
                      className="w-full pl-7 pr-2 py-2 rounded-xl border border-amber-200 bg-white text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-amber-400/30 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-neutral-500 uppercase tracking-wider block mb-1">
                  Motivo
                </label>
                <input
                  type="text"
                  value={ajusteMotivo}
                  onChange={e => setAjusteMotivo(e.target.value)}
                  placeholder="Justificativa..."
                  className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-400/30 transition-all"
                />
              </div>
            </div>

            <button
              onClick={handleAplicarAjuste}
              disabled={aplicandoAjuste || !ajusteMotivo.trim() || (parseFloat(ajusteDesconto || '0') === 0 && parseFloat(ajusteAcrescimo || '0') === 0)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {aplicandoAjuste ? 'Aplicando...' : 'Aplicar Ajuste'}
            </button>

            {Array.isArray(fatura.historico_ajustes) && fatura.historico_ajustes.length > 0 && (
              <details className="group pt-2">
                <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 transition-colors">
                  Ver Histórico ({fatura.historico_ajustes.length})
                </summary>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                  {[...fatura.historico_ajustes].reverse().map((h: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg p-2 ring-1 ring-neutral-100 text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="font-bold text-neutral-500">{formatDate(h.data)}</span>
                        <span className="font-black text-indigo-600">{formatCurrency(h.valor_novo)}</span>
                      </div>
                      <p className="text-neutral-600 leading-tight">{h.motivo}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Enviar para Cobrança (Se Vencida) */}
        {fatura.status === 'vencida' && !fatura.tem_cobranca && (
          <button 
            onClick={async () => {
              if (!onEnviarParaCobranca || enviandoParaCobranca) return;
              setEnviandoParaCobranca(true);
              try {
                await onEnviarParaCobranca();
              } finally {
                setEnviandoParaCobranca(false);
              }
            }}
            disabled={enviandoParaCobranca}
            className="w-full rounded-3xl bg-rose-600 py-4 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Landmark className="h-4 w-4" />
            {enviandoParaCobranca ? 'Enviando...' : 'Enviar para Cobrança'}
          </button>
        )}

        {fatura.tem_cobranca && (
          <div className="w-full rounded-3xl bg-rose-50 py-4 ring-1 ring-rose-200 text-rose-600 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            Em Cobrança
          </div>
        )}



        {/* Cancelar Fatura */}
        {fatura.status !== 'cancelado' && fatura.status !== 'pago' && (
          <button 
            onClick={() => onCancel && onCancel()}
            className="w-full mt-2 rounded-3xl border border-rose-200 bg-white py-4 text-rose-600 font-black uppercase tracking-widest text-[10px] hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
          >
            <XCircle className="h-4 w-4" />
            Cancelar Fatura
          </button>
        )}

      </div>
    </div>
  );
}


export function getFaturaDetails(fat: any) {
  const os = fat.ordens_servico;
  const oc = fat.ordens_compra;
  const oa = fat.ordens_assinatura;

  if (os) {
    const orc = Array.isArray(os.orcamentos) ? os.orcamentos[0] : os.orcamentos;
    return {
      orderType: 'Ordem de Serviço',
      orderCode: os.codigo_os,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: orc?.servicos?.nome || 'Serviço',
      itemLabel: 'Serviço',
      valorItem: Number(orc?.valor_servico) || 0,
      quantidade: 1,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0
    };
  }

  if (oc) {
    const orc = Array.isArray(oc.orcamentos) ? oc.orcamentos[0] : oc.orcamentos;
    return {
      orderType: 'Ordem de Compra',
      orderCode: oc.codigo_ordem,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: orc?.produtos?.nome || 'Produto',
      itemLabel: 'Produto',
      valorItem: Number(orc?.produtos?.valor) || 0,
      quantidade: oc.quantidade || 1,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0
    };
  }

  if (oa) {
    const orc = Array.isArray(oa.orcamentos) ? oa.orcamentos[0] : oa.orcamentos;
    return {
      orderType: 'Ordem de Assinatura',
      orderCode: oa.codigo_ordem,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: oa.assinaturas?.nome || 'Assinatura',
      itemLabel: 'Assinatura',
      valorItem: Number(oa.assinaturas?.valor) || 0,
      quantidade: oa.quantidade || 1,
      quantidade_meses: orc?.quantidade_meses,
      prazo_indeterminado: orc?.prazo_indeterminado,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0
    };
  }

  return {
    orderType: 'Fatura Avulsa',
    orderCode: '',
    itemName: fat.observacoes || 'Fatura de Serviços',
    itemLabel: {
      servico: 'Serviço',
      produto: 'Produto',
      assinatura: 'Assinatura',
      pacote_nivel: 'Pacote VIP'
    }[fat.tipo as string] || 'Cobrança',
    valorItem: fat.valor_total,
    quantidade: 1,
    valorAdicional: 0,
    acrescimo: 0,
    desconto: 0
  };
}

function PDFExportMenu({ onDownload, onWhatsApp, onEmail }: any) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative flex-1 min-w-[200px]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50 flex items-center justify-center gap-2 shadow-sm transition-all"
      >
        <Printer className="h-5 w-5" />
        Gerar PDF
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] ring-1 ring-black/5 p-2 z-50 flex flex-col gap-1 animate-in slide-in-from-bottom-2 fade-in">
          <button onClick={() => { setIsOpen(false); onDownload(); }} className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 rounded-lg text-sm font-bold text-neutral-700 flex items-center gap-3 transition-colors">
            <Printer className="h-4 w-4 text-neutral-400"/> Fazer Download
          </button>
          <button onClick={() => { setIsOpen(false); onWhatsApp(); }} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors">
            <Send className="h-4 w-4"/> Enviar por WhatsApp
          </button>
          <button onClick={() => { setIsOpen(false); onEmail(); }} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors">
            <MessageSquare className="h-4 w-4"/> Enviar por E-mail
          </button>
        </div>
      )}
    </div>
  );
}


