import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { Fatura, Cliente } from '../../../types';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { getProductDisplayCode } from '../../../lib/productIdentification';
import { 
  AlertCircle, 
  CheckCircle, 
  Filter, 
  ShieldAlert, 
  MessageSquare, 
  Send, 
  ClipboardList,
  Ticket,
  History,
  Wallet,
  CreditCard,
  Info,
  Package,
  Receipt
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../../ui/Modal';
import { createNotification } from '../../../lib/notifications';
import { clientOperationalWrite } from '../../../lib/clientOperationalWrite';
import { PaymentModal } from './PaymentModal';
import { useWhatsAppDocument } from '../../../hooks/useWhatsAppDocument';
import { generateFaturaPDF } from '../../../lib/pdf';
import { whatsappNotificationService } from '../../../lib/whatsappNotificationService';

export const getFaturaDetails = (fat: any) => {
  const resolveItemName = (fallback: string) => {
    const nomeServico = fat.ordens_servico?.orcamentos?.servicos?.nome;
    const nomeAssinatura = fat.ordens_assinatura?.assinaturas?.nome;
    const nomeProduto = fat.ordens_compra?.produtos?.nome;
    if (nomeServico) return nomeServico;
    if (nomeAssinatura) return nomeAssinatura;
    if (nomeProduto) return nomeProduto;
    if (fat.tipo === 'produto' || fat.tipo === 'loja') return 'Pedido Marketplace';
    if (fat.tipo === 'assinatura') return 'Plano de Assinatura';
    if (fat.observacoes && fat.observacoes.trim() !== '') return fat.observacoes;
    return fallback;
  };

  const resolveItemLabel = (tipo: string) => {
    if (tipo === 'produto' || tipo === 'loja') return 'Marketplace';
    if (tipo === 'assinatura') return 'Assinatura';
    if (tipo === 'pacote_nivel') return 'Nível VIP';
    return 'Serviço';
  };

  // 1. Se houver itens_faturados já salvos (novo padrão para faturas manuais), priorizar
  if (Array.isArray(fat.itens_faturados) && fat.itens_faturados.length > 0) {
    const mainItem = fat.itens_faturados[0];
    let baseName = mainItem.descricao || 'Cobrança';
    if (baseName === 'Cobrança' || baseName === 'Produto' || baseName === 'Serviço') {
      baseName = resolveItemName(baseName);
    }
    
    return {
      orderType: fat.os_id ? 'OS' : (fat.ordem_compra_id ? 'OC' : (fat.ordem_assinatura_id ? 'OA' : 'FAT')),
      orderCode: fat.ordens_servico?.codigo_os || fat.ordens_compra?.codigo_ordem || fat.ordens_assinatura?.codigo_ordem || fat.codigo_fatura,
      orcamentoCode: fat.ordens_servico?.orcamentos?.codigo_orcamento || fat.ordens_compra?.orcamentos?.codigo_orcamento || fat.ordens_assinatura?.orcamentos?.codigo_orcamento,
      itemName: baseName,
      itemLabel: resolveItemLabel(fat.tipo),
      valorItem: Number(mainItem.valor_unitario) || Number(fat.valor_total) || 0,
      valorAdicional: Number(fat.ordens_compra?.orcamentos?.valor_adicional || fat.ordens_assinatura?.orcamentos?.valor_adicional || fat.ordens_servico?.orcamentos?.valor_adicional || 0),
      descricaoAdicional: fat.ordens_compra?.orcamentos?.descricao_adicional || fat.ordens_assinatura?.orcamentos?.descricao_adicional || fat.ordens_servico?.orcamentos?.descricao_adicional || null,
      acrescimo: Number(fat.ordens_compra?.orcamentos?.acrescimo || fat.ordens_assinatura?.orcamentos?.acrescimo || fat.ordens_servico?.orcamentos?.acrescimo || 0),
      desconto: Number(fat.desconto_voucher_aplicado || 0) + Number(fat.desconto_pontos_aplicado || 0) + Number(fat.desconto_manual || 0) || Number(fat.ordens_servico?.orcamentos?.desconto || fat.ordens_compra?.orcamentos?.desconto || fat.ordens_assinatura?.orcamentos?.desconto || 0),
      quantidade: Number(mainItem.quantidade) || 1,
      promocao: fat.ordens_servico?.orcamentos?.promocoes || fat.ordens_compra?.orcamentos?.promocoes || fat.ordens_assinatura?.orcamentos?.promocoes,
      acrescimo_manual: Number(fat.acrescimo_manual) || 0,
      desconto_manual: Number(fat.desconto_manual) || 0,
      valor_base: Number(fat.valor_base_original) || Number(fat.valor_total) || 0,
      quantidade_meses: fat.ordens_assinatura?.prazo_meses || fat.ordens_assinatura?.orcamentos?.quantidade_meses,
      prazo_indeterminado: fat.ordens_assinatura?.orcamentos?.prazo_indeterminado,
    };
  }

  // 2. Fallback para tipos específicos com joins legados
  if (fat.tipo === 'pacote_nivel') {
    return {
      orderType: 'NV',
      orderCode: fat.codigo_fatura,
      orcamentoCode: null,
      itemName: fat.itens_faturados?.[0]?.descricao || 'Nível VIP',
      itemLabel: resolveItemLabel(fat.tipo),
      valorItem: Number(fat.valor_total) || 0,
      valorAdicional: 0,
      descricaoAdicional: null,
      acrescimo: 0,
      desconto: 0,
      quantidade: 1,
      promocao: null,
    };
  } else if (fat.tipo === 'produto' || fat.tipo === 'loja') {
    const orc = fat.ordens_compra?.orcamentos || fat.orcamentos;
    return {
      orderType: 'OC',
      orderCode: fat.ordens_compra?.codigo_ordem || fat.ordens_compra?.codigo_oc || fat.codigo_fatura,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: resolveItemName('Pedido Marketplace'),
      itemLabel: resolveItemLabel(fat.tipo),
      valorItem: Number(fat.ordens_compra?.produtos?.valor || orc?.valor_servico) || Number(fat.valor_total) || 0,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0,
      quantidade: Number(fat.quantidade || fat.ordens_compra?.quantidade) || 1,
      promocao: orc?.promocoes,
    };
  } else if (fat.tipo === 'assinatura') {
    const orc = fat.ordens_assinatura?.orcamentos;
    return {
      orderType: 'OA',
      orderCode: fat.ordens_assinatura?.codigo_ordem || fat.ordens_assinatura?.codigo_oa,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: resolveItemName('Plano de Assinatura'),
      itemLabel: resolveItemLabel(fat.tipo),
      valorItem: Number(fat.ordens_assinatura?.assinaturas?.valor || orc?.valor_servico) || Number(fat.valor_total) || 0,
      quantidade_meses: fat.ordens_assinatura?.prazo_meses || orc?.quantidade_meses,
      prazo_indeterminado: orc?.prazo_indeterminado,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0,
      quantidade: Number(fat.quantidade || fat.ordens_assinatura?.quantidade) || 1,
      promocao: orc?.promocoes,
    };
  } else {
    // Caso padrão: Serviço ou Manual
    const orc = fat.ordens_servico?.orcamentos;
    return {
      orderType: 'OS',
      orderCode: fat.ordens_servico?.codigo_os || fat.codigo_fatura,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: resolveItemName('Serviço'),
      itemLabel: resolveItemLabel(fat.tipo),
      valorItem: Number(orc?.valor_servico) || Number(fat.valor_total) || 0,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0,
      quantidade: Number(fat.quantidade) || 1,
      promocao: orc?.promocoes,
    };
  }
};

export function FaturasList({ 
  clientId, 
  saldo, 
  cliente, 
  onRefresh, 
  initialItemId 
}: { 
  clientId: string, 
  saldo: number, 
  cliente: Cliente | null, 
  onRefresh: () => void, 
  initialItemId?: string 
}) {
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [selectedFatura, setSelectedFatura] = useState<Fatura | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [faturaToPay, setFaturaToPay] = useState<Fatura | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // Contestação states
  const [contestacao, setContestacao] = useState<any | null>(null);
  const [loadingContestacao, setLoadingContestacao] = useState(false);
  const [showContestacaoForm, setShowContestacaoForm] = useState(false);
  const [contestacaoMotivo, setContestacaoMotivo] = useState('');
  const [contestacaoDescricao, setContestacaoDescricao] = useState('');
  const [enviandoContestacao, setEnviandoContestacao] = useState(false);
  const [taxaEntregaPadrao, setTaxaEntregaPadrao] = useState(30);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'loja_taxa_entrega_padrao').maybeSingle();
      if (data) setTaxaEntregaPadrao(parseFloat(data.value) || 30);
    };
    fetchSettings();
  }, []);

  const [faturaPointsDiscount, setFaturaPointsDiscount] = useState<number | null>(null);
  const [faturaWalletDiscount, setFaturaWalletDiscount] = useState<number>(0);
  const [faturaCupomDesconto, setFaturaCupomDesconto] = useState<any>(null);
  const [faturaCupomEntrega, setFaturaCupomEntrega] = useState<any>(null);
  const [creditoOrcamento, setCreditoOrcamento] = useState<any | null>(null);
  const [creditoFaturasRelacionadas, setCreditoFaturasRelacionadas] = useState<any[]>([]);
  const [loadingCreditoDetalhes, setLoadingCreditoDetalhes] = useState(false);
  const [faturaOrdemFiscal, setFaturaOrdemFiscal] = useState<any | null>(null);
  const hasAutoOpened = useRef<string | null>(null);

  const { isSendingWhatsApp, sendToWhatsApp } = useWhatsAppDocument();

  useEffect(() => {
    if (initialItemId && faturas.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = faturas.find(f => f.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        setSelectedFatura(item);
        
        // Only scroll and highlight, don't auto-open modals to let the user see the 'card' in the list first
        // as requested ("deixar o cliente com a cara no card da fatura")
        
        // Scroll and highlight
        setTimeout(() => {
          const element = document.getElementById(`fatura-${item.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 300);
      }
    }
  }, [initialItemId, faturas.length]);

  useEffect(() => {
    fetchFaturas();

    const channel = supabase
      .channel('client-faturas-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'faturas',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchFaturas();
        onRefresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, statusFilter]);

  useEffect(() => {
    if (selectedFatura) {
      const updatedFatura = faturas.find(f => f.id === selectedFatura.id);
      if (updatedFatura) {
        setSelectedFatura(updatedFatura);
      }
    }
  }, [faturas]);

  useEffect(() => {
    if (selectedFatura) {
      setFaturaPointsDiscount(null);
      setFaturaWalletDiscount(0);
      setFaturaCupomDesconto(null);
      setFaturaCupomEntrega(null);
      setCreditoOrcamento(null);
      setCreditoFaturasRelacionadas([]);
      setFaturaOrdemFiscal(null);
      
      const loadFaturaDiscountDetails = async () => {
        let code = '';
        let cupomDescontoId = '';
        let cupomEntregaId = '';
        
        const fComp = selectedFatura as any;
        if (fComp.is_amortizacao_credito) {
          setLoadingCreditoDetalhes(true);
          let codigoOrcamento = '';
          if (fComp.itens_faturados && fComp.itens_faturados.length > 0) {
            const item = fComp.itens_faturados[0];
            if (item.codigo && item.codigo.startsWith('CRE-')) {
              codigoOrcamento = item.codigo.replace('CRE-', '');
            } else {
              const match = item.descricao?.match(/(#ODC-\d+)/);
              if (match) {
                codigoOrcamento = match[1];
              }
            }
          }

          if (codigoOrcamento) {
            code = codigoOrcamento;
            try {
              const { data: orcData } = await supabase
                .from('orcamentos')
                .select(`
                  *,
                  ordens_compra (
                    *,
                    produtos (*)
                  ),
                  ordens_assinatura (
                    *,
                    assinaturas (*)
                  )
                `)
                .eq('codigo_orcamento', codigoOrcamento)
                .maybeSingle();

              if (orcData) {
                setCreditoOrcamento(orcData);
                cupomDescontoId = orcData.cupom_desconto_id;
                cupomEntregaId = orcData.cupom_entrega_id;

                const { data: relatedFats } = await supabase
                  .from('faturas')
                  .select('*')
                  .eq('cliente_id', clientId)
                  .eq('is_amortizacao_credito', true)
                  .order('data_vencimento', { ascending: true });

                if (relatedFats) {
                  const filtered = relatedFats.filter((f: any) => {
                    const item = f.itens_faturados?.[0];
                    return item?.codigo === `CRE-${codigoOrcamento}` || item?.descricao?.includes(codigoOrcamento);
                  });
                  setCreditoFaturasRelacionadas(filtered);
                }
              }
            } catch (err) {
              console.error('Erro ao buscar orçamento de crédito:', err);
            } finally {
              setLoadingCreditoDetalhes(false);
            }
          } else {
            setLoadingCreditoDetalhes(false);
          }
        }
        let orcamentoId = '';
        if (fComp.ordens_compra?.orcamentos?.codigo_orcamento) {
          code = fComp.ordens_compra.orcamentos.codigo_orcamento;
          cupomDescontoId = fComp.ordens_compra.orcamentos.cupom_desconto_id;
          cupomEntregaId = fComp.ordens_compra.orcamentos.cupom_entrega_id;
          orcamentoId = fComp.ordens_compra.orcamentos.id;
        } else if (fComp.ordens_assinatura?.orcamentos?.codigo_orcamento) {
          code = fComp.ordens_assinatura.orcamentos.codigo_orcamento;
          cupomDescontoId = fComp.ordens_assinatura.orcamentos.cupom_desconto_id;
          cupomEntregaId = fComp.ordens_assinatura.orcamentos.cupom_entrega_id;
          orcamentoId = fComp.ordens_assinatura.orcamentos.id;
        } else if (fComp.ordens_servico?.orcamentos?.codigo_orcamento) {
          code = fComp.ordens_servico.orcamentos.codigo_orcamento;
          cupomDescontoId = fComp.ordens_servico.orcamentos.cupom_desconto_id;
          orcamentoId = fComp.ordens_servico.orcamentos.id;
        }
        
        // Fetch wallet discount
        const finalOrcId = selectedFatura.orcamento_id || orcamentoId;
        if (finalOrcId) {
          try {
            const { data, error } = await supabase
              .from('extrato_financeiro')
              .select('valor')
              .eq('cliente_id', clientId)
              .eq('tipo', 'saida')
              .eq('referencia_id', finalOrcId);
            
            if (data && !error && data.length > 0) {
              setFaturaWalletDiscount(data.reduce((acc, curr) => acc + Number(curr.valor), 0));
            } else {
              setFaturaWalletDiscount(Number(selectedFatura.abatimento_carteira_aplicado || 0));
            }
          } catch (err) {
            setFaturaWalletDiscount(Number(selectedFatura.abatimento_carteira_aplicado || 0));
          }
        } else {
          setFaturaWalletDiscount(Number(selectedFatura.abatimento_carteira_aplicado || 0));
        }
        
        // 1. Fetch points discount
        if (code) {
          try {
            const { data, error } = await supabase
              .from('points_transactions')
              .select('pontos')
              .eq('cliente_id', clientId)
              .like('descricao', `%#${code}%`)
              .limit(1)
              .maybeSingle();

            if (data && !error) {
              setFaturaPointsDiscount(Math.abs(data.pontos) * 0.01);
            } else {
              const { data: dataMov, error: errorMov } = await supabase
                .from('pontos_movimentacoes')
                .select('pontos')
                .eq('cliente_id', clientId)
                .like('descricao', `%#${code}%`)
                .limit(1)
                .maybeSingle();
                
              if (dataMov && !errorMov) {
                setFaturaPointsDiscount(Math.abs(dataMov.pontos) * 0.01);
              } else {
                setFaturaPointsDiscount(0);
              }
            }
          } catch (err) {
            console.error('Erro ao buscar desconto de pontos da fatura:', err);
            setFaturaPointsDiscount(0);
          }
        } else {
          if (selectedFatura.desconto_pontos_aplicado) {
            setFaturaPointsDiscount(Number(selectedFatura.desconto_pontos_aplicado));
          } else {
            setFaturaPointsDiscount(0);
          }
        }

        // 2. Fetch coupon details
        const targetCupomId = cupomDescontoId || selectedFatura.desconto_voucher_aplicado;
        if (targetCupomId) {
          try {
            const { data, error } = await supabase
              .from('cupons_loja')
              .select('*')
              .eq('id', targetCupomId)
              .single();
            if (data && !error) {
              setFaturaCupomDesconto(data);
            }
          } catch (err) {
            console.error('Erro ao carregar cupom de desconto da fatura:', err);
          }
        }

        // 3. Fetch delivery coupon details
        if (cupomEntregaId) {
          try {
            const { data, error } = await supabase
              .from('cupons_loja')
              .select('*')
              .eq('id', cupomEntregaId)
              .single();
            if (data && !error) {
              setFaturaCupomEntrega(data);
            }
          } catch (err) {
            console.error('Erro ao carregar cupom de entrega da fatura:', err);
          }
        }

        // 4. Fetch Ordem Fiscal if available
        let orderCodeToSearch = code || '';
        if (!orderCodeToSearch) {
          const details = getFaturaDetails(selectedFatura);
          orderCodeToSearch = details.orderCode || '';
        }
        
        try {
          const orFilter = orderCodeToSearch 
            ? `fatura_id.eq.${selectedFatura.id},codigo_orcamento.eq.${orderCodeToSearch},codigo_ordem.eq.${orderCodeToSearch}`
            : `fatura_id.eq.${selectedFatura.id}`;
            
          const { data: fiscalData, error: fiscalErr } = await supabase
            .from('ordens_fiscais')
            .select('id, codigo_fiscal, status_emissao, arquivo_nf_url, arquivo_nf_xml_url')
            .eq('cliente_id', clientId)
            .or(orFilter)
            .limit(1)
            .maybeSingle();

          if (fiscalData && !fiscalErr) {
            setFaturaOrdemFiscal(fiscalData);
          }
        } catch (err) {
          console.error('Erro ao buscar ordem fiscal da fatura:', err);
        }
      };
      
      loadFaturaDiscountDetails();
    } else {
      setFaturaPointsDiscount(null);
      setFaturaCupomDesconto(null);
      setFaturaCupomEntrega(null);
      setCreditoOrcamento(null);
      setCreditoFaturasRelacionadas([]);
      setFaturaOrdemFiscal(null);
    }
  }, [selectedFatura, clientId]);

  const fetchFaturas = async () => {
    let query = supabase
      .from('faturas')
      .select(`
        *,
        itens_faturados,
        historico_pagamentos,
        pagamentos(*),
        orcamentos (
          id,
          codigo_orcamento,
          total,
          desconto,
          taxa_entrega,
          cupom_desconto_id,
          cupom_entrega_id,
          desconto_cupom,
          desconto_promocional,
          cupom_desconto:cupons_loja!fk_orcamentos_cupom_desconto(codigo_cupom),
          cupom_entrega:cupons_loja!fk_orcamentos_cupom_entrega(codigo_cupom)
        ),
        ordens_servico (
          codigo_os,
          orcamentos (
            id,
            codigo_orcamento,
            total,
            valor_servico,
            valor_adicional,
            descricao_adicional,
            acrescimo,
            desconto,
            promocao_id,
            promocoes(titulo, codigo_promocao, descricao),
            servicos (
              nome
            )
          )
        ),
        ordens_compra (
          codigo_ordem,
          quantidade,
          produtos (
            nome,
            valor
          ),
          orcamentos (
            id,
            codigo_orcamento,
            total,
            desconto,
            taxa_entrega,
            cupom_desconto_id,
            cupom_entrega_id,
            desconto_cupom,
            desconto_promocional,
            cupom_desconto:cupons_loja!fk_orcamentos_cupom_desconto(codigo_cupom),
            cupom_entrega:cupons_loja!fk_orcamentos_cupom_entrega(codigo_cupom)
          )
        ),
        ordens_assinatura (
          codigo_ordem,
          quantidade,
          prazo_meses,
          assinaturas (
            nome,
            valor
          ),
          orcamentos (
            id,
            codigo_orcamento,
            total,
            desconto,
            taxa_entrega,
            cupom_desconto_id,
            cupom_entrega_id,
            desconto_cupom,
            desconto_promocional,
            cupom_desconto:cupons_loja!fk_orcamentos_cupom_desconto(codigo_cupom),
            cupom_entrega:cupons_loja!fk_orcamentos_cupom_entrega(codigo_cupom),
            quantidade_meses,
            prazo_indeterminado
          )
        )
      `)
      .eq('cliente_id', clientId)

    
    const { data, error } = await query.order('data_vencimento', { ascending: false });
    
    if (error) {
      console.error('Erro ao buscar faturas (detalhado):', error);
      toast.error(`Erro ao buscar faturas: ${error.message}`);
    }

    if (data) {
      let filteredData = data;
      if (statusFilter && statusFilter !== 'todos') {
        if (statusFilter === 'pendentes') {
          filteredData = filteredData.filter(f => ['pendente', 'revisada', 'vencida', 'pendente_pagamento', 'aguardando_link', 'protestado'].includes(f.status));
        } else {
          filteredData = filteredData.filter(f => f.status === statusFilter);
        }
      }
      
      const updatedData = filteredData.map((f: any) => {
        if ((f.status === 'pendente' || f.status === 'vencida') && f.data_vencimento) {
          // Extrai o YYYY-MM-DD e cria data local ignorando fuso
          const vencStr = typeof f.data_vencimento === 'string' ? f.data_vencimento.split('T')[0] : '';
          let vencDate = new Date();
          if (vencStr && /^\\d{4}-\\d{2}-\\d{2}$/.test(vencStr)) {
            const [y, m, d] = vencStr.split('-').map(Number);
            vencDate = new Date(y, m - 1, d);
          } else {
             vencDate = new Date(f.data_vencimento);
          }
          vencDate.setHours(0, 0, 0, 0);
          
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          
          if (vencDate < hoje) {
            return { ...f, status: 'vencida' };
          } else if (f.status === 'vencida') {
            return { ...f, status: 'pendente' };
          }
        }
        return f;
      });

      const statusOrder: Record<string, number> = {
        'protestado': -1,
        'vencida': 0,
        'pendente_pagamento': 1,
        'aguardando_link': 2,
        'pendente': 3,
        'pago': 4,
        'cancelado': 5
      };

      updatedData.sort((a, b) => {
        const dateA = new Date(a.data_vencimento).getTime();
        const dateB = new Date(b.data_vencimento).getTime();
        if (dateB !== dateA) return dateB - dateA;

        const orderA = statusOrder[a.status] ?? 99;
        const orderB = statusOrder[b.status] ?? 99;
        return orderA - orderB;
      });

      setFaturas(updatedData);
    }
  };

  const statusOptions = [
    { value: 'todos', label: 'Todas as Faturas' },
    { value: 'pendentes', label: 'PENDENTES' },
    { value: 'pago', label: 'PAGOS' },
    { value: 'cancelado', label: 'CANCELADOS' },
  ];

  const fetchContestacao = async (faturaId: string) => {
    setLoadingContestacao(true);
    const { data } = await supabase
      .from('fatura_contestacoes')
      .select('*')
      .eq('fatura_id', faturaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setContestacao(data || null);
    setLoadingContestacao(false);
  };

  const handleAbrirDetalhes = (fat: Fatura) => {
    setSelectedFatura(fat);
    setIsDetailOpen(true);
    setContestacao(null);
    setShowContestacaoForm(false);
    setContestacaoMotivo('');
    setContestacaoDescricao('');
    fetchContestacao(fat.id);
  };

  const handleEnviarContestacao = async () => {
    if (!selectedFatura) return;
    if (!contestacaoMotivo) { toast.error('Selecione o motivo da contestação.'); return; }
    if (contestacaoDescricao.trim().length < 20) { toast.error('A descrição precisa ter ao menos 20 caracteres.'); return; }

    setEnviandoContestacao(true);
    try {
      const data = await clientOperationalWrite<any>(selectedFatura.cliente_id, 'fatura_contestacoes', 'insert', {
        fatura_id: selectedFatura.id,
        motivo: contestacaoMotivo,
        descricao: contestacaoDescricao.trim(),
        status: 'aberta',
      });

      await createNotification(
        null,
        'Contestação de Fatura ⚠️',
        `Fatura #${selectedFatura.codigo_fatura} foi contestada. Motivo: ${contestacaoMotivo}.`,
        'financeiro',
        'faturas',
        selectedFatura.id,
        'nova_contestacao'
      );

      toast.success('Contestação enviada com sucesso! Em breve nossa equipe entrará em contato.');
      setContestacao(data);
      setShowContestacaoForm(false);
      setContestacaoMotivo('');
      setContestacaoDescricao('');
    } catch (err: any) {
      console.error('Erro ao enviar contestação:', err);
      toast.error('Erro ao enviar contestação. Tente novamente.');
    } finally {
      setEnviandoContestacao(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-2xl ring-1 ring-neutral-300 shadow-md">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#1a1a1a]/60" />
          <span className="text-[10px] sm:text-xs font-black text-[#1a1a1a]/40 uppercase tracking-[0.2em] italic">Status da Fatura</span>
        </div>
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)} 
          className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-2 text-sm font-bold text-neutral-800 focus:outline-none ring-1 ring-black/5 hover:ring-indigo-200 transition-all"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {faturas.map(fat => {
          const details = getFaturaDetails(fat);
          return (
            <div id={`fatura-${fat.id}`} key={fat.id} className={`rounded-[2rem] p-8 transition-all duration-500 relative ${highlightedItemId === fat.id ? 'bg-indigo-50 ring-4 ring-indigo-500 shadow-2xl scale-[1.02] z-10' : fat.status === 'protestado' ? 'bg-rose-50/30 ring-2 ring-rose-500 shadow-xl' : 'bg-white shadow-md ring-1 ring-neutral-300 hover:shadow-xl hover:ring-neutral-400'}`}>
              {highlightedItemId === fat.id && (
                <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 ring-4 ring-white animate-pulse z-20 flex items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-white" />
                </span>
              )}
              <div className="mb-6 flex items-center justify-between">
            <span className="font-mono text-xs font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">{fat.codigo_fatura}</span>
            <span className={`flex items-center gap-2 text-xs font-medium ${
              fat.status === 'protestado' ? 'text-rose-700 bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200' :
              fat.status === 'pago' ? 'text-emerald-600' : 
              fat.status === 'vencida' ? 'text-red-600' :
              fat.status === 'pendente_pagamento' ? 'text-blue-600' :
              'text-amber-600'
            }`}>
              {fat.status === 'protestado' ? (
                <><ShieldAlert className="h-4 w-4" /> GRAVE: Protestado em Cartório</>
              ) : fat.status === 'pago' ? (
                <><CheckCircle className="h-4 w-4" /> Pago{fat.data_pagamento ? ` em ${formatDate(fat.data_pagamento)}` : ''}</>
              ) : fat.status === 'vencida' ? (
                <><AlertCircle className="h-4 w-4" /> Vencida em {formatDate(fat.data_vencimento)}</>
              ) : fat.status === 'pendente_pagamento' ? (
                <><AlertCircle className="h-4 w-4" /> Aguardando Pagamento</>
              ) : (
                <><AlertCircle className="h-4 w-4" /> Vence {formatDate(fat.data_vencimento)}</>
              )}
            </span>
          </div>
          <h4 className="text-xl font-black text-[#1a1a1a] tracking-tight">
            #{details.orderCode} {details.quantidade > 1 ? `(x${details.quantidade})` : ''}
          </h4>
          <p className="mt-1 text-sm font-medium text-[#1a1a1a]/60">
            Referente a: <span className="text-[#1a1a1a]">{details.itemName}</span>
          </p>
          
          <div className="mt-4 space-y-2 rounded-2xl bg-neutral-100 p-4 ring-1 ring-neutral-300">
            <div className="flex justify-between text-[10px] font-bold text-[#1a1a1a]/40 uppercase tracking-widest">
              <span>{details.itemLabel}</span>
              <span>{formatCurrency(details.valorItem)}</span>
            </div>
            {fat.tipo === 'assinatura' && (
              <div className="flex justify-between text-[10px] -mt-1 pb-1">
                <span className="text-neutral-400 font-bold uppercase tracking-widest">Duração Contratada</span>
                <span className="font-black text-indigo-600 uppercase">
                  {details.quantidade_meses ? `${details.quantidade_meses} Meses` : (details.prazo_indeterminado ? 'Prazo Indeterminado' : '1 Mês')}
                </span>
              </div>
            )}
            {details.quantidade > 1 && (
              <div className="flex justify-between text-[10px] font-bold text-[#1a1a1a]/40 uppercase tracking-widest">
                <span>Subtotal ({details.quantidade}x)</span>
                <span>{formatCurrency(details.valorItem * details.quantidade)}</span>
              </div>
            )}
            {details.valorAdicional > 0 && (
              <div className="flex justify-between text-[10px] font-bold text-[#1a1a1a]/40 uppercase tracking-widest">
                <span>Adicional</span>
                <span>{formatCurrency(details.valorAdicional)}</span>
              </div>
            )}
            {details.acrescimo > 0 && (
              <div className="flex justify-between text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                <span>Acréscimo</span>
                <span>+ {formatCurrency(details.acrescimo)}</span>
              </div>
            )}
            {(() => {
              const totalDesconto = (!Array.isArray(fat.itens_faturados) || fat.itens_faturados.length === 0)
                ? (details.desconto || 0) + (Number((fat as any).desconto_manual) || 0)
                : (details.desconto || 0);

              if (totalDesconto <= 0) return null;

              return (
                <div className="flex justify-between text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                  <span>Desconto</span>
                  <span>- {formatCurrency(totalDesconto)}</span>
                </div>
              );
            })()}
            {Number((fat as any).acrescimo_manual) > 0 && (
              <div className="flex justify-between text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                <span>Acréscimo Ajuste</span>
                <span>+ {formatCurrency(Number((fat as any).acrescimo_manual))}</span>
              </div>
            )}
          </div>

          {(fat as any).pagamentos && (fat as any).pagamentos.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Pagamentos Realizados:</p>
              {(fat as any).pagamentos.map((p: any, i: number) => (
                <p key={i} className="text-xs font-medium text-emerald-600 capitalize">• {p.metodo === 'indicacao' ? 'Indicação' : p.metodo}: {formatCurrency(p.valor)}</p>
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between border-t border-black/5 pt-6 gap-4">
            <div>
              <p className="text-3xl tracking-tight text-[#1a1a1a]">{formatCurrency(fat.valor_total)}</p>
              {fat.valor_pago > 0 && fat.status !== 'pago' && (
                <p className="text-[10px] font-medium text-emerald-600 mt-1">Já pago: {formatCurrency(fat.valor_pago)}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => handleAbrirDetalhes(fat)}
                className="flex-1 sm:flex-none rounded-full bg-[#f8f7f5] px-5 py-2.5 text-xs font-medium text-[#1a1a1a] hover:bg-black/5 transition-colors text-center"
              >
                Detalhes
              </button>
              {['pendente', 'pendente_pagamento', 'vencida', 'fatura_negociada'].includes(fat.status) && (
                <button 
                  onClick={() => { setFaturaToPay(fat); setPaymentModalOpen(true); }}
                  className="flex-1 sm:flex-none rounded-full bg-[#1a1a1a] px-5 py-2.5 text-xs font-medium text-white hover:bg-black/80 transition-colors text-center"
                >
                  Pagar
                </button>
              )}
              {fat.status === 'pago' && (
                <span className="flex items-center justify-center gap-1 text-xs font-medium text-emerald-600 w-full sm:w-auto mt-2 sm:mt-0">
                  <CheckCircle className="h-4 w-4" />
                  Paga
                </span>
              )}
            </div>
          </div>
        </div>
          );
        })}
      </div>
      
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes da Fatura" size="full">
        {selectedFatura && (() => {
          const details = getFaturaDetails(selectedFatura);
          
          if (selectedFatura.is_amortizacao_credito && creditoOrcamento) {
            const total = Number(creditoOrcamento.total || 0);
            const desconto = Number(creditoOrcamento.desconto || 0);
            const taxaEnt = Number(creditoOrcamento.taxa_entrega || 0);
            const acrescimo = Number(creditoOrcamento.acrescimo || 0);
            const subtotalItens = total + desconto - taxaEnt - acrescimo;
            
            return (
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Código da Fatura</p>
                    <p className="font-mono text-sm font-medium text-[#1a1a1a] mt-1">{selectedFatura.codigo_fatura}</p>
                  </div>
                  <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Referência da Compra</p>
                    <p className="font-mono text-sm font-black text-indigo-600 mt-1">{creditoOrcamento.codigo_orcamento}</p>
                  </div>
                  <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Status da Fatura</p>
                    <span className={`inline-block rounded-full px-3 py-0.5 text-[10px] font-bold tracking-widest uppercase mt-2.5 ${
                      selectedFatura.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : 
                      selectedFatura.status === 'vencida' ? 'bg-red-100 text-red-700' :
                      selectedFatura.status === 'pendente_pagamento' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {selectedFatura.status === 'pendente_pagamento' ? 'Aguardando Pagamento' : selectedFatura.status}
                    </span>
                  </div>
                </div>

                {/* Datas de Emissão e Vencimento */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase mb-1">Data de Emissão</p>
                    <p className="text-sm font-bold text-neutral-700">
                      {selectedFatura.created_at ? formatDate(selectedFatura.created_at) : '—'}
                    </p>
                  </div>
                  <div className={`rounded-2xl p-4 ring-1 ${
                    selectedFatura.status === 'vencida' ? 'bg-red-50 ring-red-200' : 'bg-neutral-50 ring-neutral-200'
                  }`}>
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase mb-1">Data de Vencimento</p>
                    <p className={`text-sm font-bold ${
                      selectedFatura.status === 'vencida' ? 'text-red-600' : 'text-neutral-700'
                    }`}>
                      {selectedFatura.data_vencimento ? formatDate(selectedFatura.data_vencimento) : '—'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 font-medium text-[#1a1a1a]">
                    <ClipboardList className="h-5 w-5 text-[#1a1a1a]/60" />
                    Itens do Pedido Original
                  </h4>
                  <div className="rounded-2xl border border-black/5 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[#f8f7f5] text-[10px] font-semibold text-[#1a1a1a]/40 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Item / Detalhes</th>
                            <th className="px-6 py-4 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {(creditoOrcamento.ordens_compra?.length > 0 || creditoOrcamento.ordens_assinatura?.length > 0) ? (
                            [
                              ...(creditoOrcamento.ordens_compra || []).map((item: any) => ({
                                id: item.id,
                                nome: item.produtos?.nome || 'Produto',
                                codigo: item.produtos ? getProductDisplayCode(item.produtos as any) : 'PRODUTO',
                                quantidade: item.quantidade || 1,
                                imagem: item.produtos?.imagem_url,
                                valor: item.produtos?.valor || 0
                              })),
                              ...(creditoOrcamento.ordens_assinatura || []).map((item: any) => ({
                                id: item.id,
                                nome: item.assinaturas?.nome || 'Assinatura',
                                codigo: item.assinaturas?.codigo_assinatura || 'ASSINATURA',
                                quantidade: item.quantidade || 1,
                                imagem: item.assinaturas?.imagem_url,
                                valor: item.assinaturas?.valor || 0
                              }))
                            ].map((item: any, idx: number) => (
                              <tr key={item.id || idx}>
                                <td className="px-6 py-5 align-top">
                                  <div className="flex gap-4 items-center">
                                    <div className="h-16 w-16 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center overflow-hidden shrink-0">
                                      {item.imagem ? (
                                        <img src={item.imagem} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <Package className="w-8 h-8 text-neutral-300" />
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full w-fit uppercase tracking-widest">
                                        {item.codigo}
                                      </span>
                                      <p className="font-bold text-[#1a1a1a] text-base tracking-tight">
                                        {item.nome} {item.quantidade > 1 ? `(x${item.quantidade})` : ''}
                                      </p>
                                      {item.quantidade > 1 && (
                                        <p className="text-xs font-semibold text-neutral-400">
                                          Valor unitário: {formatCurrency(item.valor)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-5 text-right text-base font-black text-[#1a1a1a] align-top">
                                  {formatCurrency(item.valor * item.quantidade)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2} className="px-6 py-5 text-center text-neutral-400 italic">
                                Nenhum item encontrado no pedido.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-black/5">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em]">Resumo Financeiro da Compra</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-neutral-500">
                      <span>Subtotal dos Itens</span>
                      <span>{formatCurrency(subtotalItens)}</span>
                    </div>

                    {taxaEnt > 0 && (
                      <div className="flex justify-between text-sm font-medium text-neutral-500">
                        <span>Frete</span>
                        <span>{formatCurrency(taxaEnt)}</span>
                      </div>
                    )}

                    {desconto > 0 && (() => {
                      const pointsDiscount = faturaPointsDiscount !== null 
                        ? faturaPointsDiscount 
                        : 0;
                      const couponDiscount = Math.max(0, desconto - pointsDiscount);

                      return (
                        <div className="space-y-1.5 bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 my-2">
                          <div className="flex justify-between text-sm font-black text-emerald-800">
                            <span>Descontos Aplicados</span>
                            <span>-{formatCurrency(desconto)}</span>
                          </div>
                          
                          {pointsDiscount > 0 && (
                            <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                              <span>Carteira de Pontos ({Math.round(pointsDiscount * 105)} pts)</span>
                              <span>-{formatCurrency(pointsDiscount)}</span>
                            </div>
                          )}

                          {couponDiscount > 0 && (
                            <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                              <span>Cupom: {faturaCupomDesconto?.codigo_cupom || 'Desconto'}</span>
                              <span>-{formatCurrency(couponDiscount)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {acrescimo > 0 && (
                      <div className="flex justify-between text-sm font-bold text-amber-600">
                        <span>Juros do Crédito GSA</span>
                        <span>+ {formatCurrency(acrescimo)}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between border-t border-black/5 pt-4 gap-4">
                      <div>
                        <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Total Geral da Compra</p>
                        <p className="text-2xl font-black tracking-tight text-[#1a1a1a] mt-1">{formatCurrency(total)}</p>
                      </div>
                      <div className="text-center sm:text-right">
                        <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Esta Parcela ({String(selectedFatura.itens_faturados?.[0]?.descricao || '').match(/Parcela \d+\/\d+/)?.[0] || '1/1'})</p>
                        <p className="text-2xl font-black tracking-tight text-indigo-600 mt-1">{formatCurrency(selectedFatura.valor_total)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Saldo Devedor Total</p>
                        <p className="text-3xl font-black tracking-tight text-indigo-600 mt-1">
                          {formatCurrency(
                            creditoFaturasRelacionadas
                              .filter((f: any) => f.status !== 'pago' && f.status !== 'cancelado')
                              .reduce((acc: number, f: any) => acc + (f.valor_final_pendente || f.valor_total || 0), 0)
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {creditoFaturasRelacionadas.length > 0 && (
                  <div className="space-y-4 pt-6 border-t border-black/5">
                    <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      Plano de Parcelamento (Amortização de Crédito GSA)
                    </h4>
                    <div className="bg-emerald-50/40 rounded-2xl p-5 border border-emerald-100/50 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-sm font-bold text-emerald-950">
                        <span>Forma de Pagamento Usada</span>
                        <span>Crédito GSA</span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-bold text-emerald-800 border-b border-emerald-100 pb-2">
                        <span>Status Geral</span>
                        <span>{creditoFaturasRelacionadas.length} parcelas geradas {acrescimo > 0 ? 'com juros' : 'sem juros'}</span>
                      </div>
                      <div className="space-y-2.5">
                        {creditoFaturasRelacionadas.map((fat, idx) => {
                          const isCurrent = fat.id === selectedFatura.id;
                          return (
                            <div key={fat.id} className={`flex justify-between items-center text-xs p-2.5 rounded-xl border transition-all ${
                              isCurrent 
                                ? 'bg-indigo-50/70 border-indigo-200 shadow-sm' 
                                : 'bg-white/80 border-emerald-100/40 text-emerald-900'
                            }`}>
                              <span className="font-bold">
                                {idx + 1}ª Parcela ({fat.codigo_fatura || `Parcela ${idx+1}`})
                                {isCurrent && <span className="ml-2 text-[9px] bg-indigo-600 text-white font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">Fatura Atual</span>}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="font-extrabold">{formatCurrency(fat.valor_total)}</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                    fat.status === 'pago' ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' :
                                    fat.status === 'cancelado' ? 'bg-neutral-200 text-neutral-700 border border-neutral-300' : 
                                    'bg-orange-100 text-orange-800 border border-orange-200'
                                  }`}>
                                    {fat.status === 'pago' ? 'Pago' : fat.status === 'cancelado' ? 'Cancelado' : 'Pendente'}
                                  </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {faturaOrdemFiscal && (
                  <button
                    onClick={() => {
                      setIsDetailOpen(false);
                      window.dispatchEvent(new CustomEvent('change-financeiro-tab', { detail: { tab: 'nf', itemId: faturaOrdemFiscal.id } }));
                    }}
                    className="w-full rounded-xl bg-indigo-50 border-2 border-indigo-200 py-4 text-sm font-bold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-all flex items-center justify-center gap-2 mb-3"
                  >
                    <Receipt className="h-5 w-5" />
                    Ver Nota Fiscal / Recibo
                  </button>
                )}
                
                <button 
                  onClick={() => setIsDetailOpen(false)}
                  className="w-full rounded-xl bg-[#1a1a1a] py-4 text-base font-bold text-white hover:bg-black/80 transition-all"
                >
                  Fechar Detalhes
                </button>
              </div>
            );
          }

          return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Código da Fatura</p>
                <p className="font-mono text-sm font-medium text-[#1a1a1a] mt-1">{selectedFatura.codigo_fatura}</p>
              </div>
              <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Status</p>
                <span className={`inline-block rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase mt-2 ${
                  selectedFatura.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : 
                  selectedFatura.status === 'vencida' ? 'bg-red-100 text-red-700' :
                  selectedFatura.status === 'pendente_pagamento' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {selectedFatura.status === 'pendente_pagamento' ? 'Aguardando Pagamento' : selectedFatura.status}
                </span>
              </div>
            </div>

            {/* Datas de Emissão e Vencimento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase mb-1">Data de Emissão</p>
                <p className="text-sm font-bold text-neutral-700">
                  {selectedFatura.created_at ? formatDate(selectedFatura.created_at) : '—'}
                </p>
              </div>
              <div className={`rounded-2xl p-4 ring-1 ${
                selectedFatura.status === 'vencida' ? 'bg-red-50 ring-red-200' : 'bg-neutral-50 ring-neutral-200'
              }`}>
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase mb-1">Data de Vencimento</p>
                <p className={`text-sm font-bold ${
                  selectedFatura.status === 'vencida' ? 'text-red-600' : 'text-neutral-700'
                }`}>
                  {selectedFatura.data_vencimento ? formatDate(selectedFatura.data_vencimento) : '—'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="flex items-center gap-2 font-medium text-[#1a1a1a]">
                <ClipboardList className="h-5 w-5 text-[#1a1a1a]/60" />
                Itens Faturados
              </h4>
              <div className="rounded-2xl border border-black/5 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f8f7f5] text-[10px] font-semibold text-[#1a1a1a]/40 uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-4">Item / Detalhes</th>
                        <th className="px-6 py-4 text-right">Valor</th>
                      </tr>
                    </thead>
                  <tbody className="divide-y divide-black/5">
                    {(selectedFatura.itens_faturados && selectedFatura.itens_faturados.length > 0) ? (
                      selectedFatura.itens_faturados.map((item: any, index: number) => (
                        <tr key={index}>
                          <td className="px-6 py-5 align-top">
                            <div className="flex flex-col gap-1">
                              {item.codigo && (
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full w-fit uppercase tracking-widest">
                                  {item.codigo}
                                </span>
                              )}
                              <p className="font-bold text-[#1a1a1a] text-lg tracking-tight mt-1">
                                {item.descricao} {item.quantidade > 1 ? `(x${item.quantidade})` : ''}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl mt-2">
                                <div className="rounded-xl bg-[#f8f7f5] border border-black/5 px-3 py-2">
                                  <p className="text-[9px] font-black text-[#1a1a1a]/40 uppercase tracking-widest">Quantidade</p>
                                  <p className="text-sm font-black text-[#1a1a1a] mt-0.5">{Number(item.quantidade || 1)}</p>
                                </div>
                                <div className="rounded-xl bg-[#f8f7f5] border border-black/5 px-3 py-2">
                                  <p className="text-[9px] font-black text-[#1a1a1a]/40 uppercase tracking-widest">Valor unitario</p>
                                  <p className="text-sm font-black text-[#1a1a1a] mt-0.5">{formatCurrency(Number(item.valor_unitario || item.valor || 0))}</p>
                                </div>
                                <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2">
                                  <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Subtotal</p>
                                  <p className="text-sm font-black text-indigo-700 mt-0.5">{formatCurrency(Number(item.subtotal || item.valor || 0))}</p>
                                </div>
                              </div>
                              {false && item.quantidade > 1 && (
                                <p className="text-xs font-medium text-[#1a1a1a]/60">
                                  Valor unitário: <span className="font-bold">{formatCurrency(item.valor_unitario || item.valor)}</span>
                                </p>
                              )}
                              {selectedFatura.tipo === 'assinatura' && details.quantidade_meses && (
                                <div className="flex justify-between text-[10px] mt-2 py-1.5 px-3 bg-neutral-50 rounded-lg border border-black/5 w-fit gap-4">
                                  <span className="text-neutral-400 font-bold uppercase tracking-widest">Duração Contratada</span>
                                  <span className="font-black text-indigo-600 uppercase">
                                    {details.quantidade_meses} Meses
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right text-lg font-bold text-[#1a1a1a] align-top">
                            {formatCurrency(item.subtotal || item.valor)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-6 py-5 align-top">
                            <p className="font-black text-[#1a1a1a] text-lg tracking-tight">
                              #{details.orderCode} {details.quantidade > 1 ? `(x${details.quantidade})` : ''}
                            </p>
                            <p className="text-xs font-medium text-[#1a1a1a]/60 mt-1">
                              Referente a: <span className="text-[#1a1a1a] font-bold">{details.itemName}</span>
                            </p>
                          
                          {selectedFatura.tipo === 'assinatura' && (
                            <div className="flex justify-between text-[10px] mt-2 py-1.5 px-3 bg-neutral-50 rounded-lg border border-black/5">
                              <span className="text-neutral-400 font-bold uppercase tracking-widest">Duração Contratada</span>
                              <span className="font-black text-indigo-600 uppercase">
                                {details.quantidade_meses ? `${details.quantidade_meses} Meses` : (details.prazo_indeterminado ? 'Prazo Indeterminado' : '1 Mês')}
                              </span>
                            </div>
                          )}
                          
                          {details.promocao && (
                            <div className="mt-4 space-y-1.5 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/50">
                              <p className="text-sm font-bold text-indigo-900 mb-3">Detalhes da Promoção</p>
                              <div className="grid grid-cols-1 gap-1.5 text-xs">
                                <p className="flex justify-between"><span className="text-indigo-700/70">Total:</span> <span className="font-medium text-indigo-900">{formatCurrency((details.valorItem * details.quantidade) + details.valorAdicional + details.acrescimo)}</span></p>
                                <p className="flex justify-between"><span className="text-indigo-700/70">Promoção Aplicada:</span> <span className="font-medium text-indigo-900">{details.promocao.titulo}</span></p>
                                <p className="flex justify-between"><span className="text-indigo-700/70">Código da Promoção:</span> <span className="font-medium text-indigo-900">{details.promocao.codigo_promocao}</span></p>
                                <p className="flex justify-between"><span className="text-indigo-700/70">Desconto da Promoção:</span> <span className="font-bold text-emerald-600">-{formatCurrency(details.desconto)}</span></p>
                                {details.promocao.descricao && (
                                  <div className="pt-1">
                                    <span className="text-indigo-700/70 block mb-0.5">Descrição da Promoção:</span>
                                    <span className="font-medium text-indigo-900 block bg-white/50 p-2 rounded border border-indigo-100/50">{details.promocao.descricao}</span>
                                  </div>
                                )}
                                <div className="pt-2 mt-2 border-t border-indigo-200/50">
                                  <p className="flex justify-between text-sm"><span className="font-bold text-indigo-900">Valor com Desconto da Promoção:</span> <span className="font-black text-indigo-700">{formatCurrency((details.valorItem * details.quantidade) + details.valorAdicional + details.acrescimo - details.desconto)}</span></p>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right text-lg text-[#1a1a1a] align-top">
                          {formatCurrency(details.valorItem * details.quantidade)}
                        </td>
                      </tr>
                    )}
                    
                    {details.valorAdicional > 0 && selectedFatura.tipo !== 'pacote_nivel' && (
                      <tr>
                        <td className="px-6 py-4">
                          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Valor Adicional</p>
                          {details.descricaoAdicional && (
                            <p className="text-[10px] text-neutral-400 italic mt-1 bg-neutral-50 p-2 rounded-lg">
                              {details.descricaoAdicional}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-neutral-900">
                          {formatCurrency(details.valorAdicional)}
                        </td>
                      </tr>
                    )}

                    {details.acrescimo > 0 && (
                      <tr>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Acréscimo</p>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-amber-600">
                          + {formatCurrency(details.acrescimo)}
                        </td>
                      </tr>
                    )}

                    {(details.desconto - faturaWalletDiscount) > 0 && !details.promocao && (
                      <tr>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Desconto (Orçamento)</p>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-600">
                          - {formatCurrency(details.desconto - faturaWalletDiscount)}
                        </td>
                      </tr>
                    )}

                    {Number(selectedFatura.acrescimo_manual) > 0 && (
                      <tr>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Acréscimo (Ajuste do Sistema)</p>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-amber-600">
                          + {formatCurrency(Number(selectedFatura.acrescimo_manual))}
                        </td>
                      </tr>
                    )}

                    {Number(selectedFatura.desconto_manual) > 0 && (
                      <tr>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Desconto (Ajuste do Sistema)</p>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-600">
                          - {formatCurrency(Number(selectedFatura.desconto_manual))}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  </table>
                </div>
              </div>
            </div>


            {/* Resumo Financeiro da Fatura com Detalhamento de Descontos */}
            {(() => {
              const fComp = selectedFatura as any;
              const orcamento = fComp.orcamentos || fComp.ordens_compra?.orcamentos || fComp.ordens_assinatura?.orcamentos || fComp.ordens_servico?.orcamentos;
              
              const orcamentoDesconto = orcamento?.desconto || 0;
              const taxaEntrega = orcamento?.taxa_entrega !== undefined && orcamento?.taxa_entrega !== null ? Number(orcamento.taxa_entrega) : null;

              const rawTotalDesconto = Number(orcamentoDesconto) 
                || (Number(selectedFatura.desconto_voucher_aplicado || 0) + Number(selectedFatura.desconto_pontos_aplicado || 0)) 
                || Number(selectedFatura.desconto_manual || 0);

              const walletDiscountValue = faturaWalletDiscount;
              const totalDesconto = Math.max(0, rawTotalDesconto - walletDiscountValue);

              const subtotalItens = (selectedFatura.itens_faturados && selectedFatura.itens_faturados.length > 0)
                ? selectedFatura.itens_faturados.reduce((acc: number, item: any) => acc + Number(item.subtotal || item.valor || 0), 0)
                : (details.valorItem * details.quantidade);

              const cupomEntregaId = orcamento?.cupom_entrega_id;
              const cupomEntregaCode = orcamento?.cupom_entrega?.codigo_cupom;
              const cupomDescontoId = orcamento?.cupom_desconto_id;
              const cupomDescontoCode = orcamento?.cupom_desconto?.codigo_cupom;
              const descontoCupom = Number(orcamento?.desconto_cupom || 0);
              const descontoPromocional = Number(orcamento?.desconto_promocional || 0);

              const cupomEntrega = orcamento?.cupom_entrega;
              const cupomDesconto = orcamento?.cupom_desconto;

              const pointsDiscount = faturaPointsDiscount !== null 
                ? faturaPointsDiscount 
                : (selectedFatura.desconto_pontos_aplicado ? Number(selectedFatura.desconto_pontos_aplicado) : 0);
              const couponDiscount = Math.max(0, totalDesconto - pointsDiscount);

              return (
                <div className="space-y-4 pt-6 border-t border-black/5">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em]">Resumo Financeiro da Fatura</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-neutral-500">
                      <span>Subtotal dos Itens</span>
                      <span>{formatCurrency(subtotalItens)}</span>
                    </div>
                    
                    {/* Adicional se houver */}
                    {(Number(selectedFatura.valor_final_pendente !== undefined ? (selectedFatura as any).valor_adicional : details.valorAdicional) > 0) && (
                      <div className="flex justify-between text-sm font-medium text-neutral-500">
                        <span>Adicional</span>
                        <span>{formatCurrency((selectedFatura as any).valor_adicional || details.valorAdicional)}</span>
                      </div>
                    )}
                    
                    {/* Acréscimo se houver */}
                    {(Number(selectedFatura.acrescimo_manual || details.acrescimo || 0) > 0) && (
                      <div className="flex justify-between text-sm font-medium text-neutral-500">
                        <span>Acréscimo</span>
                        <span>+{formatCurrency(selectedFatura.acrescimo_manual || details.acrescimo)}</span>
                      </div>
                    )}

                    {/* Frete se houver */}
                    {(taxaEntrega !== null && taxaEntrega !== undefined && (taxaEntrega > 0 || cupomEntregaId || faturaCupomEntrega || selectedFatura.itens_faturados?.some((i: any) => i.tipo === 'produto') || selectedFatura.ordens_compra)) && (
                      <>
                        <div className="flex justify-between text-sm font-medium text-neutral-500">
                          <span>Frete / Entrega</span>
                          {taxaEntrega > 0 ? (
                            <span>{formatCurrency(taxaEntrega)}</span>
                          ) : (cupomEntregaId || faturaCupomEntrega) ? (
                            <span>{formatCurrency(taxaEntregaPadrao)}</span>
                          ) : (
                            <span className="text-emerald-600 font-bold">Grátis</span>
                          )}
                        </div>
                        
                        {taxaEntrega === 0 && (cupomEntregaId || faturaCupomEntrega) && (
                          <div className="flex justify-between text-sm font-bold text-emerald-700">
                            <span>Cupom de Frete {cupomEntrega?.codigo_cupom || faturaCupomEntrega?.codigo_cupom ? `(${cupomEntrega?.codigo_cupom || faturaCupomEntrega?.codigo_cupom})` : ''}</span>
                            <span>- {formatCurrency(taxaEntregaPadrao)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Outros descontos (Cupom, Promocional) */}
                    {(descontoCupom > 0 || couponDiscount > 0) && (
                      <div className="flex justify-between text-sm font-bold text-emerald-700">
                        <span>Cupom de Desconto {cupomDesconto?.codigo_cupom || faturaCupomDesconto?.codigo_cupom ? `(${cupomDesconto?.codigo_cupom || faturaCupomDesconto?.codigo_cupom})` : ''}</span>
                        <span>- {formatCurrency(descontoCupom > 0 ? descontoCupom : couponDiscount)}</span>
                      </div>
                    )}

                    {descontoPromocional > 0 && (
                      <div className="flex justify-between text-sm font-bold text-emerald-700">
                        <span>Desconto Promocional</span>
                        <span>- {formatCurrency(descontoPromocional)}</span>
                      </div>
                    )}

                    {/* Desconto de Pontos / Carteira GSA */}
                    {pointsDiscount > 0 && (
                      <div className="flex justify-between text-sm font-bold text-emerald-700">
                        <span>Carteira de Pontos ({Math.round(pointsDiscount * 100)} pts)</span>
                        <span>- {formatCurrency(pointsDiscount)}</span>
                      </div>
                    )}

                    {walletDiscountValue > 0 && (
                      <div className="flex justify-between text-sm font-bold text-emerald-700">
                        <span>Saldo da Carteira</span>
                        <span>- {formatCurrency(walletDiscountValue)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {selectedFatura.status === 'pago' && (() => {
              const pagamentosArr: any[] = Array.isArray((selectedFatura as any).pagamentos)
                ? (selectedFatura as any).pagamentos : [];

              const metodoLabel = (m: string) => ({
                pix: 'PIX (InfinitePay)', credit_card: 'Cartão de Crédito',
                cartao: 'Cartão de Crédito', boleto: 'Boleto',
                infinitepay: 'InfinitePay', manual: 'Manual',
                pontos: 'Desconto Pontos', voucher: 'Voucher',
                carteira: 'Saldo Carteira', indicacao: 'Desconto Indicação',
                promocao: 'Desconto Promoção',
              }[m?.toLowerCase()] || m || 'Pagamento');

              return (
                <div className="space-y-3 pt-6 border-t border-black/5">
                  <h4 className="flex items-center gap-2 font-medium text-[#1a1a1a]">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                    Composição do Pagamento
                  </h4>
                  <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 p-5 space-y-3">
                    {(() => {
                      const validPagamentos = pagamentosArr.filter((p: any) => p.status === 'concluido' || p.status === 'aprovado' || !p.status);
                      const hasNotes = !!selectedFatura.observacoes;
                      
                      if (validPagamentos.length > 0) {
                        return validPagamentos.map((p: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="flex items-center gap-2 text-neutral-700 font-medium">
                              <CreditCard className="h-4 w-4" /> {metodoLabel(p.metodo)}{hasNotes && !['voucher', 'pontos', 'carteira'].includes(p.metodo?.toLowerCase()) ? ' - Baixa realizada manualmente pelo financeiro' : ''}
                            </span>
                            <span className="font-bold text-neutral-900">{formatCurrency(p.valor)}</span>
                          </div>
                        ));
                      }
                      
                      if (selectedFatura.status === 'pago') {
                        const valorTotalFatura = Number(selectedFatura.valor_pago || selectedFatura.valor_total || 0);
                        if (valorTotalFatura > 0) {
                          return (
                            <div className="flex justify-between text-sm">
                              <span className="flex items-center gap-2 text-neutral-700 font-medium">
                                <CheckCircle className="h-4 w-4" /> Pagamento Concluído
                              </span>
                              <span className="font-bold text-neutral-900">{formatCurrency(valorTotalFatura)}</span>
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}
                    {selectedFatura.observacoes && (
                      <div className="p-3.5 rounded-xl bg-white border border-emerald-100 text-[11px] font-semibold text-emerald-800 leading-normal">
                        <span className="block text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">
                          Observações da Baixa
                        </span>
                        {selectedFatura.observacoes}
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t border-emerald-200">
                      <span className="text-sm font-black text-emerald-800 uppercase tracking-tight">Total Pago</span>
                      <span className="text-lg font-black text-emerald-700">
                        {formatCurrency((selectedFatura as any).valor_pago || selectedFatura.valor_total)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between border-t border-black/5 pt-8">
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Total da Fatura</p>
                <p className="text-3xl tracking-tight text-[#1a1a1a] mt-1">{formatCurrency(selectedFatura.valor_total)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">
                  {selectedFatura.status === 'pago' ? 'Status' : 'Restante a Pagar'}
                </p>
                <p className={`text-2xl tracking-tight mt-1 ${selectedFatura.status === 'pago' ? 'text-emerald-600 font-black' : 'text-[#1a1a1a]'}`}>
                  {selectedFatura.status === 'pago'
                    ? 'PAGO'
                    : selectedFatura.status === 'cancelado'
                      ? 'CANCELADO'
                      : formatCurrency(Math.max(0, Number(selectedFatura.valor_total || 0) - Number((selectedFatura as any).valor_pago || 0)))
                  }
                </p>
              </div>
            </div>

            {selectedFatura.status === 'protestado' && (
              <div className="border border-rose-200 bg-rose-50/50 p-6 rounded-2xl mt-8">
                <div className="flex gap-4">
                  <div className="shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-rose-100 text-rose-600">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-rose-900">Atenção: Título Protestado em Cartório</h3>
                    <p className="text-sm tracking-tight text-rose-800/80 leading-relaxed mt-2">
                       A falta de pagamento ocasionou o encaminhamento desta dívida ao cartório, sofrendo os acréscimos legais e custas cartorárias. 
                       Por favor, entre em contato imediatamente com nossa acessoria de cobranças para realizar um acordo.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Seção de Contestação ─────────────────────────── */}
            {['pendente', 'vencida', 'pendente_pagamento'].includes(selectedFatura.status) && (
              <div className="border-t border-black/5 pt-8 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-orange-500" />
                  <h4 className="font-bold text-[#1a1a1a]">Contestação de Fatura</h4>
                </div>

                {loadingContestacao ? (
                  <div className="flex justify-center py-6">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
                  </div>
                ) : contestacao ? (
                  <div className={`rounded-2xl p-5 ring-1 space-y-3 ${
                    contestacao.status === 'resolvida' ? 'bg-emerald-50 ring-emerald-200' :
                    contestacao.status === 'recusada' ? 'bg-red-50 ring-red-200' :
                    contestacao.status === 'em_analise' ? 'bg-blue-50 ring-blue-200' :
                    'bg-orange-50 ring-orange-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Status da Contestação</span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
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
                    <div>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Motivo</p>
                      <p className="text-sm font-medium text-neutral-800">{contestacao.motivo}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Descrição enviada</p>
                      <p className="text-sm text-neutral-700 leading-relaxed bg-white/60 rounded-xl p-3">{contestacao.descricao}</p>
                    </div>
                    {contestacao.resposta_admin && (
                      <div className="pt-2 border-t border-white/60">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Resposta da Equipe GSA
                        </p>
                        <p className="text-sm text-neutral-800 leading-relaxed bg-white rounded-xl p-3 font-medium">{contestacao.resposta_admin}</p>
                      </div>
                    )}
                  </div>
                ) : showContestacaoForm ? (
                  <div className="rounded-2xl bg-orange-50 ring-1 ring-orange-200 p-5 space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 block mb-2">Motivo da Contestação *</label>
                      <select
                        value={contestacaoMotivo}
                        onChange={e => setContestacaoMotivo(e.target.value)}
                        className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm font-medium text-neutral-800 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all"
                      >
                        <option value="">Selecione um motivo...</option>
                        <option value="Cobrança indevida">Cobrança indevida</option>
                        <option value="Valor incorreto">Valor incorreto</option>
                        <option value="Serviço não prestado">Serviço não prestado</option>
                        <option value="Duplicidade de cobrança">Duplicidade de cobrança</option>
                        <option value="Serviço cancelado">Serviço cancelado</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 block mb-2">
                        Descrição detalhada * <span className="text-neutral-400 font-normal normal-case">(mín. 20 caracteres)</span>
                      </label>
                      <textarea
                        value={contestacaoDescricao}
                        onChange={e => setContestacaoDescricao(e.target.value)}
                        rows={4}
                        placeholder="Descreva com detalhes o motivo da sua contestação..."
                        className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all resize-none"
                      />
                      <p className="text-right text-[10px] text-neutral-400 mt-1">{contestacaoDescricao.length} / 20 mín.</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowContestacaoForm(false)}
                        className="flex-1 rounded-xl border border-orange-200 bg-white py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleEnviarContestacao}
                        disabled={enviandoContestacao}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition-all active:scale-95 disabled:opacity-70"
                      >
                        {enviandoContestacao ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        {enviandoContestacao ? 'Enviando...' : 'Enviar Contestação'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-5">
                    <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
                      Se você acredita que há algum erro nesta fatura, pode abrir uma contestação. Nossa equipe analisará e responderá em até 2 dias úteis.
                    </p>
                    <button
                      onClick={() => setShowContestacaoForm(true)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition-all active:scale-95"
                    >
                      <ShieldAlert className="h-4 w-4" />
                      Contestar esta Fatura
                    </button>
                  </div>
                )}
              </div>
            )}

            {faturaOrdemFiscal && (
              <button
                onClick={() => {
                  setIsDetailOpen(false);
                  window.dispatchEvent(new CustomEvent('change-financeiro-tab', { detail: { tab: 'nf', itemId: faturaOrdemFiscal.id } }));
                }}
                className="w-full rounded-xl bg-indigo-50 border-2 border-indigo-200 py-4 text-sm font-bold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-all flex items-center justify-center gap-2 mb-2"
              >
                <Receipt className="h-5 w-5" />
                Ver Nota Fiscal / Recibo
              </button>
            )}

            <div className="flex flex-col gap-3 mt-3">
              <button 
                onClick={async () => {
                  try {
                    const doc = await generateFaturaPDF(selectedFatura, cliente, (selectedFatura as any).ordens_servico, { returnDoc: true }) as any;
                    const pdfBase64 = doc.output('datauristring');
                    const mensagemBase = whatsappNotificationService.gerarMensagemWhatsApp({
                      tipo: 'fatura',
                      clienteNome: cliente?.nome,
                      codigo: selectedFatura.codigo_fatura,
                      status: selectedFatura.status === 'pago' ? 'Paga' : selectedFatura.status === 'vencida' ? 'Vencida' : selectedFatura.status === 'cancelado' ? 'Cancelada' : 'Pendente',
                      dataVencimento: selectedFatura.data_vencimento ? formatDate(selectedFatura.data_vencimento) : undefined,
                      valorTotal: formatCurrency(selectedFatura.valor_total)
                    });
                    
                    await sendToWhatsApp(
                      cliente?.telefone, 
                      mensagemBase, 
                      pdfBase64, 
                      `fatura_${selectedFatura.codigo_fatura}.pdf`
                    );
                  } catch (error) {
                    console.error("Erro ao gerar PDF:", error);
                    toast.error("Erro ao gerar documento para envio.");
                  }
                }}
                disabled={isSendingWhatsApp}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-100 py-4 text-sm font-bold text-emerald-800 hover:bg-emerald-200 border border-emerald-200 transition-all disabled:opacity-50"
              >
                {isSendingWhatsApp ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
                ) : (
                  <MessageSquare className="h-5 w-5" />
                )}
                {isSendingWhatsApp ? 'Enviando...' : 'Enviar p/ meu WhatsApp'}
              </button>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setIsDetailOpen(false)}
                  className="flex-1 rounded-xl bg-neutral-200 py-4 text-base font-bold text-[#1a1a1a] hover:bg-neutral-300 transition-all"
                >
                  Fechar Detalhes
                </button>
                {['pendente', 'vencida', 'fatura_negociada'].includes(selectedFatura.status) && (
                  <button 
                    onClick={() => { 
                      setIsDetailOpen(false);
                      setFaturaToPay(selectedFatura); 
                      setPaymentModalOpen(true); 
                    }}
                    className="flex-[2] rounded-xl bg-emerald-600 py-4 text-base font-bold text-white hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    Realizar Pagamento
                  </button>
                )}
              </div>
            </div>
          </div>
          );
        })()}
      </Modal>

      {faturaToPay && (
        <PaymentModal 
          isOpen={paymentModalOpen} 
          onClose={() => setPaymentModalOpen(false)} 
          fatura={faturaToPay}
          clientName={cliente?.nome}
          onSuccess={() => {
            setPaymentModalOpen(false);
            fetchFaturas();
            onRefresh();
          }}
        />
      )}

      {faturas.length === 0 && (
        <div className="col-span-full py-24 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-emerald-500 opacity-20" />
          <p className="mt-4 text-[#1a1a1a]/40 font-medium">Você não possui faturas pendentes. Tudo em dia!</p>
        </div>
      )}
    </div>
  );
}
