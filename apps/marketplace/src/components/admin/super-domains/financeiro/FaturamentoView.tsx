import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, CheckCircle2, XCircle, Clock, AlertTriangle, 
  Send, Plus, Filter, Download, Printer, ArrowDownCircle,
  ExternalLink, Eye, Layers, DollarSign, Calendar, CreditCard,
  User, Check, X, ShieldAlert, Sparkles, MessageSquare, Receipt,
  RefreshCw, FileSpreadsheet
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { sessionService } from '../../../../lib/sessionService';
import { formatCurrency, formatDate, formatDateTime, generateCode, maskCurrency } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { generateFaturaPDF } from '../../../../lib/pdf';
import { notificationService } from '../../../../lib/notificationService';
import { logService } from '../../../../lib/logService';
import { whatsappNotificationService } from '../../../../lib/whatsappNotificationService';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';
import { StatusBadge } from '../shared/StatusBadge';
import { AdminWhatsAppButton } from '../../ui/AdminWhatsAppButton';

export interface FaturamentoViewProps {
  initialItemId?: string;
  onNavigateTab?: (domainTab: string, subTab?: string, itemId?: string) => void;
  colaboradorNome?: string;
  colaboradorId?: string;
}

export function FaturamentoView({
  initialItemId,
  onNavigateTab,
  colaboradorNome,
  colaboradorId
}: FaturamentoViewProps) {
  // ── 1. Grid & Filter State ───────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'pendentes' | 'pagos' | 'cancelados' | 'todas'>('pendentes');
  const [faturas, setFaturas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterMes, setFilterMes] = useState<string>('');
  const [filterAno, setFilterAno] = useState<string>('');
  const [filterCategoria, setFilterCategoria] = useState<string>('todas');

  // ── 2. Drawers / Modals State ────────────────────────────────────────
  const [selectedFatura, setSelectedFatura] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Quick Settlement SlideOver
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [faturaToSettle, setFaturaToSettle] = useState<any | null>(null);
  const [settlementMethod, setSettlementMethod] = useState<string>('pix');
  const [settlementDateTime, setSettlementDateTime] = useState<string>(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [settlementNotes, setSettlementNotes] = useState<string>('Baixa administrativa confirmada.');
  const [settling, setSettling] = useState(false);

  // Manual Invoice Creation SlideOver
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [availableClients, setAvailableClients] = useState<any[]>([]);
  const [availableOrders, setAvailableOrders] = useState<{ os: any[]; oc: any[]; oa: any[] }>({ os: [], oc: [], oa: [] });
  const [creating, setCreating] = useState(false);
  const [newFatura, setNewFatura] = useState({
    cliente_id: '',
    os_id: '',
    ordem_compra_id: '',
    ordem_assinatura_id: '',
    valor_total: '',
    data_vencimento: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    data_emissao: new Date().toISOString().split('T')[0],
    descricao: '',
    categoria: 'servico' as 'servico' | 'produto' | 'assinatura'
  });

  // Cancel Invoice Modal
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [faturaToCancel, setFaturaToCancel] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);

  const hasAutoOpened = useRef<string | null>(null);

  // ── 3. Fetch Data ───────────────────────────────────────────────────
  const fetchFaturas = async () => {
    setLoading(true);
    try {
      try {
        await supabase.rpc('fn_marcar_faturas_vencidas');
      } catch (syncErr) {
        // Silently continue if sync function fails
      }

      let query = supabase
        .from('faturas')
        .select(`
          *,
          cobrancas(id, status),
          clientes(id, nome, cpf, cnpj, email, telefone, codigo_cliente),
          ordens_servico(id, codigo_os, orcamentos(codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto, servicos(nome))),
          ordens_compra(id, codigo_ordem, quantidade, produtos(nome, valor)),
          ordens_assinatura(id, codigo_ordem, quantidade, prazo_meses, assinaturas(nome, valor)),
          pagamentos(id, metodo, valor, data_pagamento),
          ordens_fiscais(id, codigo_fiscal, status_emissao)
        `)
        .order('created_at', { ascending: false });

      if (filterMes) {
        const year = filterAno || new Date().getFullYear();
        const startDate = `${year}-${filterMes.padStart(2, '0')}-01`;
        const endDate = new Date(Number(year), Number(filterMes), 0).toISOString().split('T')[0];
        query = query.gte('data_vencimento', startDate).lte('data_vencimento', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const list = data.map((f: any) => {
          let currentStatus = f.status;
          if (currentStatus === 'pendente' && f.data_vencimento) {
            const parts = f.data_vencimento.split('-');
            if (parts.length === 3) {
              const vencDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
              vencDate.setHours(0, 0, 0, 0);
              if (vencDate < hoje) {
                currentStatus = 'vencida';
              }
            }
          }
          return {
            ...f,
            status: currentStatus,
            tem_cobranca: f.cobrancas && f.cobrancas.length > 0,
            cobranca_status: f.cobrancas?.[0]?.status
          };
        });

        setFaturas(list);

        // Check if initial item is requested
        if (initialItemId && hasAutoOpened.current !== initialItemId) {
          const target = list.find((it: any) => it.id === initialItemId);
          if (target) {
            setSelectedFatura(target);
            setIsDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }
        }
      }
    } catch (err: any) {
      console.error('Erro ao buscar faturas:', err);
      toast.error('Erro ao carregar lista de faturas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaturas();
  }, [filterMes, filterAno]);

  useRealtimeSubscription([
    { table: 'faturas', onChange: fetchFaturas },
    { table: 'cobrancas', onChange: fetchFaturas },
    { table: 'ordens_fiscais', onChange: fetchFaturas }
  ], [filterMes, filterAno]);

  // Filtered by Active Tab & Category
  const displayedFaturas = useMemo(() => {
    return faturas.filter((f) => {
      // Tab filter
      if (activeTab === 'pendentes') {
        if (!['pendente', 'revisada', 'vencida', 'pendente_pagamento', 'aguardando_link'].includes(f.status)) {
          return false;
        }
      } else if (activeTab === 'pagos') {
        if (f.status !== 'pago') return false;
      } else if (activeTab === 'cancelados') {
        if (f.status !== 'cancelado') return false;
      }

      // Category filter
      if (filterCategoria !== 'todas') {
        const cat = f.tipo || (f.os_id ? 'servico' : f.ordem_compra_id ? 'produto' : f.ordem_assinatura_id ? 'assinatura' : 'avulso');
        if (cat !== filterCategoria) return false;
      }

      return true;
    });
  }, [faturas, activeTab, filterCategoria]);

  // ── 4. Quick Actions Handlers ───────────────────────────────────────

  // Open Quick Settlement Drawer
  const openSettlement = (fatura: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFaturaToSettle(fatura);
    setSettlementMethod('pix');
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    setSettlementDateTime(new Date(now.getTime() - tzOffset).toISOString().slice(0, 16));
    setSettlementNotes('Baixa administrativa realizada via painel.');
    setIsSettlementOpen(true);
  };

  // Perform Settlement via RPC gsa_admin_baixar_fatura
  const handleConfirmSettlement = async () => {
    if (!faturaToSettle) return;
    if (!settlementNotes.trim()) {
      toast.error('Informe as observações da baixa.');
      return;
    }

    setSettling(true);
    try {
      const isoDateTime = new Date(settlementDateTime).toISOString();
      const session = sessionService.getCurrentSession();
      if (!session?.sessaoId || !session?.sessionToken) {
        throw new Error('Sessão administrativa expirada. Faça login novamente.');
      }

      const baixaResult = await callAdminRpc<any>('gsa_admin_baixar_fatura', {
        p_fatura_id: faturaToSettle.id,
        p_metodo: settlementMethod,
        p_data_pagamento: isoDateTime,
        p_observacoes: settlementNotes
      });

      if (baixaResult && !baixaResult.success) {
        throw new Error(baixaResult.error || 'Erro ao processar baixa no banco.');
      }

      toast.success('Baixa administrativa realizada com sucesso!');
      setIsSettlementOpen(false);
      setIsDetailOpen(false);
      setFaturaToSettle(null);
      await fetchFaturas();

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'BAIXAR_FATURA_MANUAL',
        detalhes: `Baixa manual da fatura #${faturaToSettle.codigo_fatura} via ${settlementMethod}`
      });

      // Send automated WhatsApp receipt if phone is available
      const { data: updatedFatura } = await supabase
        .from('faturas')
        .select('*, clientes(nome, telefone)')
        .eq('id', faturaToSettle.id)
        .single();

      if (updatedFatura && updatedFatura.clientes?.telefone) {
        const msg = whatsappNotificationService.gerarMensagemWhatsApp({
          tipo: 'fatura',
          clienteNome: updatedFatura.clientes.nome,
          codigo: updatedFatura.codigo_fatura,
          status: updatedFatura.status,
          dataVencimento: updatedFatura.data_vencimento ? formatDate(updatedFatura.data_vencimento) : undefined,
          valorTotal: formatCurrency(updatedFatura.valor_total),
          formaPagamento: settlementMethod,
          valorLiquido: formatCurrency(updatedFatura.valor_pago || updatedFatura.valor_total),
          cupomAplicado: updatedFatura.voucher_codigo,
          valorCupom: updatedFatura.desconto_voucher_aplicado > 0 ? formatCurrency(updatedFatura.desconto_voucher_aplicado) : undefined,
          pontosUtilizados: updatedFatura.pontos_utilizados > 0 ? updatedFatura.pontos_utilizados : undefined,
          valorPontos: updatedFatura.desconto_pontos_aplicado > 0 ? formatCurrency(updatedFatura.desconto_pontos_aplicado) : undefined,
          saldoCarteiraUtilizado: updatedFatura.abatimento_carteira_aplicado > 0 ? formatCurrency(updatedFatura.abatimento_carteira_aplicado) : undefined,
        });
        whatsappNotificationService.enviarWhatsAppDireto(updatedFatura.clientes.telefone, msg)
          .catch(() => undefined);
      }
    } catch (err: any) {
      console.error('Erro na baixa manual:', err);
      toast.error(err?.message || 'Erro ao processar baixa.');
    } finally {
      setSettling(false);
    }
  };

  // Enviar para Cobrança via RPC gsa_admin_enviar_fatura_cobranca
  const handleEnviarParaCobranca = async (fatura: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await callAdminRpc<any>('gsa_admin_enviar_fatura_cobranca', {
        p_fatura_id: fatura.id
      });

      if (res?.already_exists) {
        toast('Esta fatura já está no módulo de Cobrança.', { icon: 'ℹ️' });
      } else {
        toast.success('Fatura enviada para a fila de cobrança com sucesso!');
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ENVIAR_PARA_COBRANCA',
        detalhes: `Fatura #${fatura.codigo_fatura} enviada ao módulo de Cobrança.`
      });

      fetchFaturas();
      if (onNavigateTab) {
        onNavigateTab('cobranca', 'fila', fatura.id);
      }
    } catch (err: any) {
      console.error('Erro ao enviar para cobrança:', err);
      toast.error(err?.message || 'Erro ao enviar fatura para cobrança.');
    }
  };

  // Gerar Ordem Fiscal
  const handleGerarOrdemFiscal = async (fatura: any) => {
    try {
      const codigo = generateCode('FISC');
      const { error } = await supabase.from('ordens_fiscais').insert([{
        codigo_fiscal: codigo,
        fatura_id: fatura.id,
        cliente_id: fatura.cliente_id || null,
        cliente_nome: fatura.clientes?.nome || null,
        cliente_documento: fatura.clientes?.cnpj || fatura.clientes?.cpf || null,
        cliente_telefone: fatura.clientes?.telefone || null,
        tipo_compra: fatura.tipo === 'servico' ? 'servico' : (fatura.tipo === 'produto' ? 'produto' : 'servico'),
        descricao_item: fatura.observacoes || `Fatura #${fatura.codigo_fatura}`,
        valor_bruto: fatura.valor_total,
        valor_desconto: 0,
        valor_acrescimo: 0,
        valor_total: fatura.valor_total,
        status_pagamento: fatura.status === 'pago' ? 'pago' : 'pendente',
        status_emissao: 'pendente_emissao'
      }]);

      if (error) throw error;
      toast.success('Ordem fiscal gerada e enviada ao Módulo Fiscal!');
      fetchFaturas();
    } catch (err: any) {
      console.error('Erro ao gerar ordem fiscal:', err);
      toast.error('Erro ao gerar ordem fiscal.');
    }
  };

  // Open Cancel Modal
  const openCancelModal = (fatura: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFaturaToCancel(fatura);
    setCancelReason('');
    setIsCancelOpen(true);
  };

  // Confirm Cancel via RPC gsa_admin_cancelar_fatura
  const handleConfirmCancel = async () => {
    if (!faturaToCancel) return;
    if (!cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }

    setCanceling(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_cancelar_fatura', {
        p_fatura_id: faturaToCancel.id,
        p_motivo: cancelReason.trim()
      });

      if (res && !res.success) {
        throw new Error(res.error || 'Erro ao cancelar fatura no banco.');
      }

      toast.success('Fatura cancelada com sucesso!');
      setIsCancelOpen(false);
      setIsDetailOpen(false);
      setFaturaToCancel(null);
      fetchFaturas();

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CANCELAR_FATURA',
        detalhes: `Cancelou a fatura #${faturaToCancel.codigo_fatura}. Motivo: ${cancelReason}`
      });

      await notificationService.notifyClient(
        faturaToCancel.cliente_id,
        'Fatura cancelada',
        `Sua fatura #${faturaToCancel.codigo_fatura} foi cancelada pelo sistema.`,
        'financeiro',
        'fatura_cancelada',
        { itemId: faturaToCancel.id, contexto: { fatura_id: faturaToCancel.id, codigo: faturaToCancel.codigo_fatura } }
      );
    } catch (err: any) {
      console.error('Erro ao cancelar fatura:', err);
      toast.error(err?.message || 'Erro ao cancelar fatura.');
    } finally {
      setCanceling(false);
    }
  };

  // Open Create Invoice Drawer
  const openCreateDrawer = async () => {
    setIsCreateOpen(true);
    try {
      const { data } = await supabase
        .from('clientes')
        .select('id, nome, cpf, cnpj, email, telefone')
        .eq('status', 'ativo')
        .order('nome');
      if (data) setAvailableClients(data);
    } catch (err) {
      toast.error('Erro ao carregar clientes.');
    }
  };

  // Load orders for selected client
  const handleClientSelected = async (clienteId: string) => {
    setNewFatura(prev => ({ ...prev, cliente_id: clienteId, os_id: '', ordem_compra_id: '', ordem_assinatura_id: '' }));
    if (!clienteId) return;

    try {
      const [osRes, ocRes, oaRes] = await Promise.all([
        supabase.from('ordens_servico').select('id, codigo_os, status, orcamentos(total)').eq('cliente_id', clienteId).in('status', ['andamento', 'concluido']),
        supabase.from('ordens_compra').select('id, codigo_ordem, quantidade, produtos(valor)').eq('cliente_id', clienteId).eq('status', 'em_analise'),
        supabase.from('ordens_assinatura').select('id, codigo_ordem, quantidade, assinaturas(valor)').eq('cliente_id', clienteId).eq('status', 'em_analise')
      ]);

      setAvailableOrders({
        os: (osRes.data || []).map(it => ({ ...it, valor: (it.orcamentos as any)?.total })),
        oc: (ocRes.data || []).map(it => ({ ...it, valor: ((it.produtos as any)?.valor || 0) * (it.quantidade || 1) })),
        oa: (oaRes.data || []).map(it => ({ ...it, valor: ((it.assinaturas as any)?.valor || 0) * (it.quantidade || 1) }))
      });
    } catch (err) {
      console.error('Erro ao carregar ordens do cliente:', err);
    }
  };

  // Confirm Create Invoice via RPC gsa_admin_criar_fatura_manual
  const handleConfirmCreate = async () => {
    const { cliente_id, valor_total, data_vencimento, data_emissao, descricao, os_id, ordem_compra_id, ordem_assinatura_id, categoria } = newFatura;

    if (!cliente_id || !valor_total || !data_vencimento || !data_emissao) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    setCreating(true);
    try {
      const cleanValue = valor_total.replace(/[^\d]/g, '');
      const numValor = Number(cleanValue) / 100;
      if (isNaN(numValor) || numValor <= 0) {
        toast.error('O valor da fatura deve ser maior que zero.');
        setCreating(false);
        return;
      }

      const desc = descricao || (
        os_id ? `Serviço Prestado (OS: ${availableOrders.os.find(o => o.id === os_id)?.codigo_os})` :
        ordem_compra_id ? `Produto Adquirido (OC: ${availableOrders.oc.find(o => o.id === ordem_compra_id)?.codigo_ordem})` :
        ordem_assinatura_id ? `Assinatura Ativa (OA: ${availableOrders.oa.find(o => o.id === ordem_assinatura_id)?.codigo_ordem})` :
        'Venda Avulsa / Lançamento Manual'
      );

      const res = await callAdminRpc<any>('gsa_admin_criar_fatura_manual', {
        p_cliente_id: cliente_id,
        p_valor_total: numValor,
        p_data_vencimento: data_vencimento,
        p_data_emissao: data_emissao,
        p_descricao: desc,
        p_os_id: os_id || null,
        p_ordem_compra_id: ordem_compra_id || null,
        p_ordem_assinatura_id: ordem_assinatura_id || null,
        p_categoria: categoria || 'servico'
      });

      toast.success('Fatura emitida com sucesso!');
      setIsCreateOpen(false);
      setNewFatura({
        cliente_id: '', os_id: '', ordem_compra_id: '', ordem_assinatura_id: '',
        valor_total: '', data_vencimento: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        data_emissao: new Date().toISOString().split('T')[0],
        descricao: '', categoria: 'servico'
      });
      fetchFaturas();

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CRIAR_FATURA',
        detalhes: `Criou fatura manual no valor de ${formatCurrency(numValor)} para o cliente ${cliente_id}`
      });
    } catch (err: any) {
      console.error('Erro ao criar fatura:', err);
      toast.error(err?.message || 'Erro ao gerar fatura.');
    } finally {
      setCreating(false);
    }
  };

  // ── 5. TacticalDataGrid Columns ─────────────────────────────────────
  const columns: GridColumn<any>[] = [
    {
      key: 'codigo_fatura',
      header: 'Código / Fatura',
      width: '150px',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
            <Receipt className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="font-mono font-bold text-slate-900 text-xs tracking-tight">
              #{row.codigo_fatura || row.id.slice(0, 8)}
            </span>
            <div className="text-[10px] text-slate-400 font-medium">
              {row.tipo ? row.tipo.toUpperCase() : row.os_id ? 'OS' : row.ordem_compra_id ? 'PRODUTO' : 'GERAL'}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'cliente',
      header: 'Cliente / Sacado',
      sortable: true,
      render: (row) => {
        const cliente = row.clientes;
        return (
          <div className="max-w-[200px] truncate">
            <p className="font-semibold text-slate-900 text-xs truncate">
              {cliente?.nome || 'Cliente não identificado'}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              {cliente?.cpf || cliente?.cnpj || cliente?.codigo_cliente || '—'}
            </p>
          </div>
        );
      }
    },
    {
      key: 'datas',
      header: 'Emissão / Vencimento',
      width: '160px',
      sortable: true,
      render: (row) => (
        <div className="text-xs">
          <div className="text-slate-700 font-medium flex items-center gap-1">
            <span className="text-[10px] text-slate-400">Venc:</span>
            <span className="font-mono font-bold">{row.data_vencimento ? formatDate(row.data_vencimento) : '—'}</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Emissão: {row.data_emissao ? formatDate(row.data_emissao) : formatDate(row.created_at)}
          </div>
        </div>
      )
    },
    {
      key: 'valor_total',
      header: 'Valor Total',
      align: 'right',
      width: '140px',
      sortable: true,
      render: (row) => {
        const valor = Number(row.valor_total || 0);
        const valorPago = Number(row.valor_pago || 0);
        const isPago = row.status === 'pago';

        return (
          <div>
            <div className="font-mono font-bold text-slate-900 text-xs">
              {formatCurrency(valor)}
            </div>
            {isPago && (
              <div className="text-[10px] font-mono text-emerald-600 font-semibold">
                Pago: {formatCurrency(valorPago || valor)}
              </div>
            )}
            {row.desconto_voucher_aplicado > 0 && (
              <div className="text-[9px] text-indigo-600 font-mono">
                Cupom: -{formatCurrency(row.desconto_voucher_aplicado)}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '130px',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col items-center gap-1">
          <StatusBadge status={row.status} size="xs" />
          {row.tem_cobranca && (
            <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 uppercase tracking-wider">
              Em Cobrança
            </span>
          )}
        </div>
      )
    },
    {
      key: 'acoes',
      header: 'Ações Rápidas',
      align: 'right',
      width: '160px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Quick Settle Button if pending */}
          {['pendente', 'vencida', 'revisada', 'pendente_pagamento', 'aguardando_link'].includes(row.status) && (
            <button
              onClick={(e) => openSettlement(row, e)}
              title="Baixa Administrativa Rápida"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Baixar</span>
            </button>
          )}

          {/* PDF Invoice Button */}
          <button
            onClick={() => generateFaturaPDF(row, (row as any).clientes ?? null, null)}
            title="Gerar PDF da Fatura"
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>

          {/* Inspect Details Drawer */}
          <button
            onClick={() => {
              setSelectedFatura(row);
              setIsDetailOpen(true);
            }}
            title="Inspecionar Fatura"
            className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      {/* ── Sub-Navigation Tabs ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab('pendentes')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'pendentes'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Pendentes / Abertas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
              {faturas.filter(f => ['pendente', 'vencida', 'revisada', 'pendente_pagamento'].includes(f.status)).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('pagos')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'pagos'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>Pagas / Liquidadas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
              {faturas.filter(f => f.status === 'pago').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('cancelados')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'cancelados'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
            <span>Canceladas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-200 text-slate-700">
              {faturas.filter(f => f.status === 'cancelado').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('todas')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'todas'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Todas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-200 text-slate-700">
              {faturas.length}
            </span>
          </button>
        </div>

        {/* Global Action: Nova Fatura Manual */}
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-2xs shadow-indigo-600/10"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Fatura Manual</span>
          </button>
        </div>
      </div>

      {/* ── Main Tactical Data Grid ── */}
      <TacticalDataGrid
        title="Controle Geral de Faturamento & Títulos"
        subtitle="Monitore recebíveis, liquidações administrativas, baixas com PIX e envio para régua de cobrança."
        data={displayedFaturas}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => {
          setSelectedFatura(row);
          setIsDetailOpen(true);
        }}
        enableSelection={true}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        filterComponent={
          <div className="flex items-center gap-2">
            <select
              value={filterCategoria}
              onChange={(e) => setFilterCategoria(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="todas">Todas Categorias</option>
              <option value="servico">Serviços / OS</option>
              <option value="produto">Produtos / Loja</option>
              <option value="assinatura">Assinaturas SaaS</option>
              <option value="avulso">Avulsos / Outros</option>
            </select>

            <select
              value={filterMes}
              onChange={(e) => setFilterMes(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="">Todos os Meses</option>
              <option value="1">Janeiro</option>
              <option value="2">Fevereiro</option>
              <option value="3">Março</option>
              <option value="4">Abril</option>
              <option value="5">Maio</option>
              <option value="6">Junho</option>
              <option value="7">Julho</option>
              <option value="8">Agosto</option>
              <option value="9">Setembro</option>
              <option value="10">Outubro</option>
              <option value="11">Novembro</option>
              <option value="12">Dezembro</option>
            </select>
          </div>
        }
        actions={
          <button
            onClick={fetchFaturas}
            title="Recarregar Faturas"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 1: QUICK INVOICE SETTLEMENT DRAWER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isSettlementOpen}
        onClose={() => setIsSettlementOpen(false)}
        title="Baixa Administrativa de Fatura"
        subtitle={faturaToSettle ? `Liquidando Fatura #${faturaToSettle.codigo_fatura} do cliente ${faturaToSettle.clientes?.nome}` : ''}
        badge={faturaToSettle ? <StatusBadge status={faturaToSettle.status} size="xs" /> : undefined}
        width="md"
        primaryAction={{
          label: 'Confirmar Baixa & Liquidação',
          onClick: handleConfirmSettlement,
          loading: settling,
          variant: 'success',
          icon: <CheckCircle2 className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsSettlementOpen(false)
        }}
      >
        {faturaToSettle && (
          <div className="space-y-5">
            {/* Financial Summary Card */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Valor a Liquidar
                </span>
                <span className="text-lg font-mono font-black text-emerald-950">
                  {formatCurrency(faturaToSettle.valor_total)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/80 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px]">Sacado / Cliente:</span>
                  <p className="font-semibold text-slate-900 truncate">
                    {faturaToSettle.clientes?.nome || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Vencimento Original:</span>
                  <p className="font-semibold text-slate-900 font-mono">
                    {faturaToSettle.data_vencimento ? formatDate(faturaToSettle.data_vencimento) : '—'}
                  </p>
                </div>
              </div>

              {/* Deductions breakdown if any */}
              {(faturaToSettle.desconto_voucher_aplicado > 0 || faturaToSettle.desconto_pontos_aplicado > 0 || faturaToSettle.abatimento_carteira_aplicado > 0) && (
                <div className="p-2.5 rounded-lg bg-white border border-emerald-200 space-y-1 text-xs font-mono">
                  {faturaToSettle.desconto_voucher_aplicado > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Cupom ({faturaToSettle.voucher_codigo}):</span>
                      <span className="text-rose-600">-{formatCurrency(faturaToSettle.desconto_voucher_aplicado)}</span>
                    </div>
                  )}
                  {faturaToSettle.desconto_pontos_aplicado > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Pontos Fidelidade:</span>
                      <span className="text-rose-600">-{formatCurrency(faturaToSettle.desconto_pontos_aplicado)}</span>
                    </div>
                  )}
                  {faturaToSettle.abatimento_carteira_aplicado > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Abatimento Carteira:</span>
                      <span className="text-rose-600">-{formatCurrency(faturaToSettle.abatimento_carteira_aplicado)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Forma de Pagamento Confirmada *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'pix', label: 'PIX Direto / QR Code', icon: Sparkles },
                  { id: 'cartao_credito', label: 'Cartão de Crédito', icon: CreditCard },
                  { id: 'cartao_debito', label: 'Cartão de Débito', icon: CreditCard },
                  { id: 'boleto', label: 'Boleto Bancário', icon: Receipt },
                  { id: 'dinheiro', label: 'Dinheiro em Espécie', icon: DollarSign },
                  { id: 'transferencia_bancaria', label: 'Transferência / TED', icon: ArrowDownCircle },
                  { id: 'saldo_carteira', label: 'Saldo de Carteira GSA', icon: Layers }
                ].map(m => {
                  const Icon = m.icon;
                  const selected = settlementMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSettlementMethod(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                        selected
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-bold ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span className="text-xs">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date & Time Picker */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Data e Horário do Pagamento *
              </label>
              <input
                type="datetime-local"
                value={settlementDateTime}
                onChange={(e) => setSettlementDateTime(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs"
              />
            </div>

            {/* Observations / Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Observações da Baixa / Comprovante *
              </label>
              <textarea
                rows={3}
                value={settlementNotes}
                onChange={(e) => setSettlementNotes(e.target.value)}
                placeholder="Descreva detalhes como NSU, código da transação, operador responsável..."
                className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs"
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                Esta ação dispara a RPC <code className="font-mono font-bold">gsa_admin_baixar_fatura</code>, atualizando o status para <strong>PAGO</strong>, creditando os pontos fidelidade e notificando o cliente via WhatsApp automaticamente.
              </p>
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 2: DEEP INVOICE INSPECTION DRAWER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedFatura ? `Fatura #${selectedFatura.codigo_fatura}` : 'Detalhes da Fatura'}
        subtitle={selectedFatura ? `Emitida em ${formatDate(selectedFatura.data_emissao || selectedFatura.created_at)}` : ''}
        badge={selectedFatura ? <StatusBadge status={selectedFatura.status} size="sm" /> : undefined}
        width="lg"
        headerActions={
          selectedFatura?.clientes?.telefone && (
            <AdminWhatsAppButton
              telefone={selectedFatura.clientes.telefone}
              mensagem={`Olá ${selectedFatura.clientes.nome}, sua fatura ${selectedFatura.codigo_fatura} no valor de R$ ${Number(selectedFatura.valor_total || 0).toFixed(2)} vence em ${selectedFatura.data_vencimento ? new Date(selectedFatura.data_vencimento).toLocaleDateString('pt-BR') : ''}.`}
            />
          )
        }
        footer={
          selectedFatura && (
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {['pendente', 'vencida', 'revisada'].includes(selectedFatura.status) && (
                  <button
                    type="button"
                    onClick={() => handleEnviarParaCobranca(selectedFatura)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors"
                  >
                    <ShieldAlert className="h-4 w-4 text-rose-600" />
                    <span>Enviar para Cobrança</span>
                  </button>
                )}

                {['pendente', 'vencida', 'revisada'].includes(selectedFatura.status) && (
                  <button
                    type="button"
                    onClick={() => openCancelModal(selectedFatura)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <XCircle className="h-4 w-4 text-rose-500" />
                    <span>Cancelar Fatura</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => generateFaturaPDF(selectedFatura, (selectedFatura as any)?.clientes ?? null, null)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <Printer className="h-4 w-4 text-slate-500" />
                  <span>Imprimir / PDF</span>
                </button>

                {['pendente', 'vencida', 'revisada', 'pendente_pagamento', 'aguardando_link'].includes(selectedFatura.status) && (
                  <button
                    type="button"
                    onClick={() => openSettlement(selectedFatura)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-2xs shadow-emerald-600/10"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Baixar Agora</span>
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {selectedFatura && (
          <div className="space-y-6">
            {/* Top Stat Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor Bruto</span>
                <p className="text-base font-mono font-bold text-slate-900 mt-0.5">
                  {formatCurrency(selectedFatura.valor_total)}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vencimento</span>
                <p className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                  {selectedFatura.data_vencimento ? formatDate(selectedFatura.data_vencimento) : '—'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status Atual</span>
                <div className="mt-1">
                  <StatusBadge status={selectedFatura.status} size="sm" />
                </div>
              </div>
            </div>

            {/* Client Profile Section */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-600" />
                Dados do Cliente / Sacado
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px]">Nome / Razão Social:</span>
                  <p className="font-bold text-slate-900">{selectedFatura.clientes?.nome || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Documento (CPF / CNPJ):</span>
                  <p className="font-mono font-semibold text-slate-900">{selectedFatura.clientes?.cpf || selectedFatura.clientes?.cnpj || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Telefone / WhatsApp:</span>
                  <p className="font-mono text-slate-900">{selectedFatura.clientes?.telefone || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">E-mail de Contato:</span>
                  <p className="text-slate-900">{selectedFatura.clientes?.email || '—'}</p>
                </div>
              </div>
            </div>

            {/* Linked Operational Details (OS / OC / OA) */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                Origem da Cobrança / Itens Faturados
              </h4>
              
              {selectedFatura.ordens_servico && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Ordem de Serviço (OS)</span>
                    <span className="font-mono font-bold text-indigo-600">#{selectedFatura.ordens_servico.codigo_os}</span>
                  </div>
                  <p className="text-slate-600">
                    {selectedFatura.ordens_servico.orcamentos?.servicos?.nome || 'Serviço prestado'}
                  </p>
                </div>
              )}

              {selectedFatura.ordens_compra && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Pedido de Compra Loja</span>
                    <span className="font-mono font-bold text-indigo-600">#{selectedFatura.ordens_compra.codigo_ordem}</span>
                  </div>
                  <p className="text-slate-600">
                    {selectedFatura.ordens_compra.produtos?.nome} (Qtd: {selectedFatura.ordens_compra.quantidade})
                  </p>
                </div>
              )}

              {selectedFatura.ordens_assinatura && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Assinatura Recorrente</span>
                    <span className="font-mono font-bold text-indigo-600">#{selectedFatura.ordens_assinatura.codigo_ordem}</span>
                  </div>
                  <p className="text-slate-600">
                    {selectedFatura.ordens_assinatura.assinaturas?.nome}
                  </p>
                </div>
              )}

              {!selectedFatura.ordens_servico && !selectedFatura.ordens_compra && !selectedFatura.ordens_assinatura && (
                <p className="text-xs text-slate-500 italic">
                  {selectedFatura.observacoes || selectedFatura.descricao || 'Fatura avulsa gerada manualmente.'}
                </p>
              )}
            </div>

            {/* Payments History List */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-600" />
                Histórico de Pagamentos & Liquidações
              </h4>

              {selectedFatura.pagamentos && selectedFatura.pagamentos.length > 0 ? (
                <div className="space-y-2">
                  {selectedFatura.pagamentos.map((p: any) => (
                    <div key={p.id} className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="font-bold text-emerald-950 uppercase">{p.metodo}</span>
                        <p className="text-[10px] text-slate-500">{p.data_pagamento ? formatDateTime(p.data_pagamento) : 'Data não informada'}</p>
                      </div>
                      <span className="font-bold text-emerald-900 text-sm">
                        {formatCurrency(p.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Nenhum registro de pagamento conciliado até o momento.</p>
              )}
            </div>

            {/* Fiscal Invoice Integration Status */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Módulo Fiscal & NF-e</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedFatura.ordens_fiscais && selectedFatura.ordens_fiscais.length > 0
                    ? `Ordem fiscal gerada (#${selectedFatura.ordens_fiscais[0].codigo_fiscal})`
                    : 'Nenhuma nota fiscal emitida vinculada a este título.'}
                </p>
              </div>
              {(!selectedFatura.ordens_fiscais || selectedFatura.ordens_fiscais.length === 0) && (
                <button
                  type="button"
                  onClick={() => handleGerarOrdemFiscal(selectedFatura)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
                >
                  Gerar Ordem Fiscal
                </button>
              )}
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 3: CREATE MANUAL INVOICE DRAWER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Nova Fatura Manual / Recebível"
        subtitle="Emita um novo título de cobrança avulso ou vinculado a ordens operacionais."
        width="md"
        primaryAction={{
          label: 'Emitir Fatura',
          onClick: handleConfirmCreate,
          loading: creating,
          icon: <Plus className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsCreateOpen(false)
        }}
      >
        <div className="space-y-4">
          {/* Client Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Cliente / Sacado *
            </label>
            <select
              value={newFatura.cliente_id}
              onChange={(e) => handleClientSelected(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="">Selecione um cliente ativo...</option>
              {availableClients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.cpf || c.cnpj || c.email || 'Sem doc'})
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Categoria do Faturamento *
            </label>
            <select
              value={newFatura.categoria}
              onChange={(e) => setNewFatura(prev => ({ ...prev, categoria: e.target.value as any }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="servico">Serviço Prestado (OS)</option>
              <option value="produto">Venda de Produto (Loja)</option>
              <option value="assinatura">Assinatura Recorrente</option>
            </select>
          </div>

          {/* Optional Order Links */}
          {newFatura.cliente_id && availableOrders.os.length > 0 && newFatura.categoria === 'servico' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Vincular a Ordem de Serviço (Opcional)
              </label>
              <select
                value={newFatura.os_id}
                onChange={(e) => {
                  const val = e.target.value;
                  const item = availableOrders.os.find(o => o.id === val);
                  setNewFatura(prev => ({
                    ...prev,
                    os_id: val,
                    valor_total: item?.valor ? maskCurrency(item.valor.toString()) : prev.valor_total
                  }));
                }}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
              >
                <option value="">Sem vínculo direto (Avulso)</option>
                {availableOrders.os.map(o => (
                  <option key={o.id} value={o.id}>
                    OS #{o.codigo_os} {o.valor ? `— ${formatCurrency(o.valor)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Valor Total (R$) *
            </label>
            <input
              type="text"
              placeholder="R$ 0,00"
              value={newFatura.valor_total}
              onChange={(e) => setNewFatura(prev => ({ ...prev, valor_total: maskCurrency(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Data de Emissão *
              </label>
              <input
                type="date"
                value={newFatura.data_emissao}
                onChange={(e) => setNewFatura(prev => ({ ...prev, data_emissao: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Data de Vencimento *
              </label>
              <input
                type="date"
                value={newFatura.data_vencimento}
                onChange={(e) => setNewFatura(prev => ({ ...prev, data_vencimento: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Descrição / Histórico do Título
            </label>
            <textarea
              rows={3}
              placeholder="Descreva o serviço, produto ou detalhes da cobrança..."
              value={newFatura.descricao}
              onChange={(e) => setNewFatura(prev => ({ ...prev, descricao: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
          </div>
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 4: CANCEL INVOICE MODAL
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isCancelOpen}
        onClose={() => setIsCancelOpen(false)}
        title="Cancelar Título / Fatura"
        subtitle={faturaToCancel ? `Fatura #${faturaToCancel.codigo_fatura} no valor de ${formatCurrency(faturaToCancel.valor_total)}` : ''}
        badge={<StatusBadge status="cancelado" size="xs" />}
        width="sm"
        primaryAction={{
          label: 'Confirmar Cancelamento',
          onClick: handleConfirmCancel,
          loading: canceling,
          variant: 'danger',
          icon: <XCircle className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Voltar',
          onClick: () => setIsCancelOpen(false)
        }}
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <p>
              O cancelamento de uma fatura é irreversível e estorna eventuais vínculos contratuais e cupons associados.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Motivo do Cancelamento *
            </label>
            <textarea
              rows={4}
              placeholder="Informe a justificativa operacional detalhada..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
          </div>
        </div>
      </CommandSlideOver>
    </div>
  );
}
