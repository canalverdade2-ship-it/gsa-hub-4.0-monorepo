import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, Package, Scissors, Calendar, Trash2, X, Plus, Minus, Tag, Check, AlertCircle, Loader2, ChevronLeft, ChevronRight, Filter, SlidersHorizontal, Briefcase, ArrowRight, ArrowLeft, MapPin, Ticket, Coins, CreditCard, CheckCircle, Clock, CheckCircle2, Wallet, Gift, Diamond } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getProductDisplayCode } from '../../../lib/productIdentification';
import { formatCurrency, generateUUID } from '../../../lib/utils';
import { toast } from 'react-hot-toast';
import { Modal } from '../../ui/Modal';
import AvailableCouponsModal from './AvailableCouponsModal';
import type { CupomLoja, Produto } from '../../../types';
import type { PromoResult } from '../../../lib/promocaoQuantidadeEngine';
import { callClientRpc } from '../../../lib/clientRpc';
import { getProductEffectivePrice, hasActiveProductDiscount, getProductQuantityPriceBreakdown } from '../../../lib/productPricing';
import { checkPixDiscountApplies } from '../../../hooks/usePixDiscount';
import { CheckoutPixModal } from './CheckoutPixModal';
import { createInfinitePayOrderCheckout } from '../../../lib/pixService';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';

type CartItem = {
  id: string;
  item_id: string;
  tipo: 'produto' | 'servico' | 'assinatura';
  quantidade: number;
  item_detalhes?: Produto | any;
  prazo_meses?: number;
  isBrinde?: boolean;
};

const PENDING_STORE_COUPONS_KEY = 'gsa_pending_store_coupons';

export default function TravelCheckoutModal({ isOpen, onClose, cartItems, promosAplicadas = [], clientId, onSuccess, travelInstallments }: { isOpen: boolean, onClose: () => void, cartItems: any[], promosAplicadas?: any[], clientId: string, onSuccess: (orderId?: string) => void, travelInstallments?: number }) {
  const checkoutRequestId = useRef<string>(generateUUID());
  const normalizedTravelInstallments = travelInstallments || 1;
  // Parcelamento da viagem | parcelas: normalizedTravelInstallments | Total do contrato
  const [step, setStep] = useState(1);
  const [endereco, setEndereco] = useState({ cep: '', logradouro: '', bairro: '', cidade: '', uf: '', numero: '', complemento: '' });
  const [isEditingEndereco, setIsEditingEndereco] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cupomDescInput, setCupomDescInput] = useState('');
  const [cupomEntInput, setCupomEntInput] = useState('');
  const [cupomDesconto, setCupomDesconto] = useState<CupomLoja | null>(null);
  const [cupomEntrega, setCupomEntrega] = useState<CupomLoja | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [taxaEntregaFixa, setTaxaEntregaFixa] = useState(0);

  // Estados para pontos
  const [saldoPontos, setSaldoPontos] = useState(0);
  const [saldoCarteira, setSaldoCarteira] = useState(0);
  const [usarPontos, setUsarPontos] = useState(false);
  const [usarSaldoCarteira, setUsarSaldoCarteira] = useState(false);
  const [pontosAplicados, setPontosAplicados] = useState(0);
  const [saldoCarteiraAplicado, setSaldoCarteiraAplicado] = useState(0);

  // Estados para crédito da loja
  const [limiteCreditoTotal, setLimiteCreditoTotal] = useState(0);
  const [limiteCreditoDisponivel, setLimiteCreditoDisponivel] = useState(0);
  const [opcaoPagamentoParcelado, setOpcaoPagamentoParcelado] = useState(false);
  const [maxParcelas, setMaxParcelas] = useState(12);
  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'cartao' | 'boleto' | 'credito_loja' | 'outros'>('pix');
  const [numParcelas, setNumParcelas] = useState(1);
  const [solicitacaoAtivaId, setSolicitacaoAtivaId] = useState<string | null>(null);
  const [jurosCreditoAvista, setJurosCreditoAvista] = useState(20);
  const [jurosCreditoParcelado, setJurosCreditoParcelado] = useState(50);
  const [lojaPixDescontoAtivo, setLojaPixDescontoAtivo] = useState(false);
  const [lojaPixDescontoPorcentagem, setLojaPixDescontoPorcentagem] = useState(5);
  const [lojaPixDescontoPermitirPontos, setLojaPixDescontoPermitirPontos] = useState(false);
  const [lojaPixDescontoPermitirCarteira, setLojaPixDescontoPermitirCarteira] = useState(false);
  const [modalAlertaPix, setModalAlertaPix] = useState<{
    tipo: 'carteira' | 'pontos' | 'troca_pix';
    pendingValue?: number;
  } | null>(null);
  const [pixSettings, setPixSettings] = useState<{ativo: boolean, porcentagem: number, tipoAplicacao: any, categorias: string[], produtos: string[]}>({
    ativo: false, porcentagem: 5, tipoAplicacao: 'todos', categorias: [], produtos: []
  });
  const [checkoutMetodoPixAtivo, setCheckoutMetodoPixAtivo] = useState(true);
  const [checkoutMetodoCartaoAtivo, setCheckoutMetodoCartaoAtivo] = useState(true);
  const [checkoutMetodoBoletoAtivo, setCheckoutMetodoBoletoAtivo] = useState(true);

  // Parcelamento Cartão e Modal PIX InfinitePay
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [clienteInfo, setClienteInfo] = useState({ nome: '', email: '', telefone: '' });
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixModalData, setPixModalData] = useState<{
    orderId: string;
    orderCode: string;
    total: number;
    pixCode: string;
    qrCodeUrl: string;
    checkoutUrl?: string;
  } | null>(null);

  const fetchDadosCredito = async () => {
    if (!clientId) return;
    try {
      const { data: cliData, error: cliErr } = await supabase
        .from('clientes')
        .select('id, nome, email, telefone, limite_credito_total, limite_credito_disponivel, limite_credito_bloqueado, opcao_pagamento_parcelado, max_parcelas, cep, endereco, numero, bairro, cidade, estado, saldo_carteira')
        .eq('id', clientId)
        .single();
        
      if (cliErr) throw cliErr;
      if (cliData) {
        setClienteInfo({
          nome: cliData.nome || '',
          email: cliData.email || '',
          telefone: cliData.telefone || '',
        });
        setLimiteCreditoTotal(Number(cliData.limite_credito_total || 0));
        setLimiteCreditoDisponivel(Math.max(Number(cliData.limite_credito_disponivel || 0) - Number(cliData.limite_credito_bloqueado || 0), 0));
        setSaldoCarteira(Number(cliData.saldo_carteira || 0));
        setOpcaoPagamentoParcelado(cliData.opcao_pagamento_parcelado || false);
        setMaxParcelas(cliData.max_parcelas || 12);

        // Se tiver cep cadastrado no banco, preenche automaticamente
        if (cliData.cep) {
          setEndereco({
            cep: cliData.cep || '',
            logradouro: cliData.endereco || '',
            bairro: cliData.bairro || '',
            cidade: cliData.cidade || '',
            uf: cliData.estado || '',
            numero: cliData.numero || '',
            complemento: ''
          });
          setIsEditingEndereco(false);
        } else {
          setEndereco({ cep: '', logradouro: '', bairro: '', cidade: '', uf: '', numero: '', complemento: '' });
          setIsEditingEndereco(true);
        }
      }

      // Também busca a solicitação ativa liberada
      const { data: solData } = await supabase
        .from('loja_credito_solicitacoes')
        .select('id')
        .eq('cliente_id', clientId)
        .eq('status', 'liberado')
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (solData && solData.length > 0) {
        setSolicitacaoAtivaId(solData[0].id);
      }      // Buscar taxas de juros de Crédito GSA do system_settings e configs do PIX
      const { data: setts } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', [
          'loja_credito_juros_avista', 
          'loja_credito_juros_parcelado', 
          'loja_pix_desconto_ativo', 
          'loja_pix_desconto_porcentagem', 
          'loja_pix_desconto_tipo_aplicacao', 
          'loja_pix_desconto_categorias', 
          'loja_pix_desconto_produtos', 
          'loja_pix_desconto_permitir_pontos', 
          'loja_pix_desconto_permitir_saldo_carteira',
          'checkout_metodo_pix_ativo', 
          'checkout_metodo_cartao_ativo', 
          'checkout_metodo_boleto_ativo'
        ]);
        
      if (setts) {
        const av = setts.find(s => s.key === 'loja_credito_juros_avista');
        const pa = setts.find(s => s.key === 'loja_credito_juros_parcelado');
        if (av) setJurosCreditoAvista(Number(av.value) ?? 20);
        if (pa) setJurosCreditoParcelado(Number(pa.value) ?? 50);

        const pixD = setts.find(s => s.key === 'loja_pix_desconto_ativo');
        const pixP = setts.find(s => s.key === 'loja_pix_desconto_porcentagem');
        const pixTA = setts.find(s => s.key === 'loja_pix_desconto_tipo_aplicacao');
        const pixCat = setts.find(s => s.key === 'loja_pix_desconto_categorias');
        const pixProd = setts.find(s => s.key === 'loja_pix_desconto_produtos');
        const pixPermPontos = setts.find(s => s.key === 'loja_pix_desconto_permitir_pontos');
        const pixPermCart = setts.find(s => s.key === 'loja_pix_desconto_permitir_saldo_carteira');
        
        const settings = {
          ativo: pixD ? pixD.value === 'true' : true,
          porcentagem: Number(pixP?.value) || 5,
          tipoAplicacao: pixTA?.value || 'todos',
          categorias: (pixCat?.value || '').split(',').map(s => s.trim()).filter(Boolean),
          produtos: (pixProd?.value || '').split(',').map(s => s.trim()).filter(Boolean)
        };
        setPixSettings(settings);

        if (pixD) setLojaPixDescontoAtivo(settings.ativo);
        if (pixP) setLojaPixDescontoPorcentagem(settings.porcentagem);
        if (pixPermPontos) setLojaPixDescontoPermitirPontos(pixPermPontos.value === 'true');
        if (pixPermCart) setLojaPixDescontoPermitirCarteira(pixPermCart.value === 'true');

        const mPix = setts.find(s => s.key === 'checkout_metodo_pix_ativo');
        const mCar = setts.find(s => s.key === 'checkout_metodo_cartao_ativo');
        const mBol = setts.find(s => s.key === 'checkout_metodo_boleto_ativo');

        if (mPix) setCheckoutMetodoPixAtivo(mPix.value !== 'false');
        if (mCar) setCheckoutMetodoCartaoAtivo(mCar.value !== 'false');
        if (mBol) setCheckoutMetodoBoletoAtivo(mBol.value !== 'false');
      }
    } catch (err) {
      console.error('Erro ao buscar dados de crédito do cliente:', err);
    }
  };

  const fetchSaldoPontos = async () => {
    if (!clientId) return;
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('saldo_pontos')
        .eq('id', clientId)
        .single();
      if (error) throw error;
      if (data) setSaldoPontos(data.saldo_pontos || 0);
    } catch (err) {
      console.error('Erro ao buscar saldo de pontos:', err);
    }
  };

  // Etapa do Checkout: 1 = Endereço, 2 = Benefícios & Cupons, 3 = Pagamento & Resumo
  const [etapaCheckout, setEtapaCheckout] = useState<1 | 2 | 3>(1);

  // Estados para o seletor de cupons
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorCategory, setSelectorCategory] = useState<'desconto' | 'entrega'>('desconto');
  const [availableCoupons, setAvailableCoupons] = useState<CupomLoja[]>([]);

  const fetchCoupons = async (category: 'desconto' | 'entrega') => {
    try {
      // Busca apenas cupons que o cliente ativou
      const { data: ativados, error: errAtivados } = await supabase
        .from('cupons_ativados')
        .select('cupom_id')
        .eq('cliente_id', clientId);

      if (errAtivados) throw errAtivados;

      const ativadosIds = (ativados || []).map((a: any) => a.cupom_id);

      if (ativadosIds.length === 0) {
        setAvailableCoupons([]);
        return;
      }

      let query = supabase
        .from('cupons_loja')
        .select('*')
        .eq('status', 'ativo')
        .eq('categoria_cupom', category)
        .in('id', ativadosIds);

      if (clientId) {
        query = query.or(`cliente_id.is.null,cliente_id.eq.${clientId}`);
      } else {
        query = query.is('cliente_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;

      const { data: orcamentos } = await supabase
        .from('orcamentos')
        .select('cupom_desconto_id, cupom_entrega_id')
        .eq('cliente_id', clientId)
        .neq('status', 'cancelado');

      const clientUsesMap = new Map<string, number>();
      (orcamentos || []).forEach(orc => {
        if (orc.cupom_desconto_id) {
          clientUsesMap.set(orc.cupom_desconto_id, (clientUsesMap.get(orc.cupom_desconto_id) || 0) + 1);
        }
        if (orc.cupom_entrega_id) {
          clientUsesMap.set(orc.cupom_entrega_id, (clientUsesMap.get(orc.cupom_entrega_id) || 0) + 1);
        }
      });

      const now = new Date();
      const filtered = (data || []).filter(c => {
        const usesByClient = clientUsesMap.get(c.id) || 0;
        const maxUsesPerClient = c.limite_usos_por_cliente || 1;
        if (usesByClient >= maxUsesPerClient) return false;

        if (c.data_validade) {
          const [year, month, day] = String(c.data_validade).split('T')[0].split('-').map(Number);
          const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
          if (expiryDate < now) return false;
        }
        if (c.limite_usos && c.total_usos >= c.limite_usos) return false;
        return true;
      });

      setAvailableCoupons(filtered);
    } catch (err) {
      console.error('Erro ao buscar cupons:', err);
    }
  };

  const handleOpenSelector = (category: 'desconto' | 'entrega') => {
    setSelectorCategory(category);
    fetchCoupons(category);
    setIsSelectorOpen(true);
  };

  useEffect(() => {
    if (isOpen) {
      // Não regenera o id de idempotência enquanto uma submissão anterior estiver em voo
      // (evita pedido duplicado quando o cliente fecha e reabre o modal em rede lenta).
      if (!isSubmitting) {
        checkoutRequestId.current = generateUUID();
      }
      setEtapaCheckout(1);
      fetchTaxaEntrega();
      fetchSaldoPontos();
      fetchDadosCredito();
      setUsarPontos(false);
      setPontosAplicados(0);
      setFormaPagamento('pix');
      setNumParcelas(1);
      setEndereco({ cep: '', logradouro: '', bairro: '', cidade: '', uf: '', numero: '', complemento: '' });
      setIsEditingEndereco(false);
    }
  }, [isOpen, clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'clientes',
        filter: clientId ? `id=eq.${clientId}` : undefined,
        enabled: isOpen && !!clientId,
        debounceMs: 150,
        onChange: () => {
          fetchSaldoPontos();
          fetchDadosCredito();
        },
      },
      {
        table: 'cupons_ativados',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        enabled: isOpen && !!clientId,
        debounceMs: 150,
        onChange: () => {
          if (isSelectorOpen) {
            fetchCoupons(selectorCategory);
          }
        },
      },
      {
        table: 'cupons_loja',
        enabled: isOpen,
        debounceMs: 150,
        onChange: () => {
          if (isSelectorOpen) {
            fetchCoupons(selectorCategory);
          }
        },
      },
    ],
    [isOpen, clientId, isSelectorOpen, selectorCategory]
  );

  useEffect(() => {
    if (!isOpen || !clientId) return;

    const loadPendingCoupons = async () => {
      const rawCoupons = localStorage.getItem(PENDING_STORE_COUPONS_KEY);
      if (!rawCoupons) return;

      try {
        const parsed = JSON.parse(rawCoupons);
        const couponIds = [parsed?.cupomDescontoId, parsed?.cupomEntregaId].filter(Boolean);
        if (couponIds.length === 0) {
          localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
          return;
        }

        const { data, error } = await supabase
          .from('cupons_loja')
          .select('*')
          .in('id', couponIds);

        if (error) throw error;

        const desconto = (data || []).find((cupom: CupomLoja) => cupom.id === parsed?.cupomDescontoId);
        const entrega = (data || []).find((cupom: CupomLoja) => cupom.id === parsed?.cupomEntregaId);

        if (desconto) setCupomDesconto(desconto as CupomLoja);
        if (entrega) setCupomEntrega(entrega as CupomLoja);

        localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
      } catch (error) {
        console.error('[GSAStore] Erro ao carregar cupons pendentes:', error);
      }
    };

    loadPendingCoupons();
  }, [isOpen, clientId]);

  const fetchTaxaEntrega = async () => {
    try {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'loja_taxa_entrega_padrao').maybeSingle();
      if (data) setTaxaEntregaFixa(parseFloat(data.value) || 0);
    } catch (err) {
      console.error('Erro ao buscar taxa de entrega:', err);
    }
  };

  const temProdutos = cartItems.some((c: CartItem) => c.tipo === 'produto');
  const enderecoCompletoValido = Boolean(
    endereco.cep?.trim()
    && endereco.logradouro?.trim()
    && endereco.numero?.trim()
    && endereco.bairro?.trim()
    && endereco.cidade?.trim()
    && endereco.uf?.trim(),
  );
  const subtotalInicial = cartItems.reduce((acc: number, cur: CartItem) => {
    if (cur.tipo === 'produto') {
      return acc + getProductQuantityPriceBreakdown(cur.item_detalhes, cur.quantidade).subtotalFinal;
    }
    return acc + ((cur.item_detalhes?.valor || 0) * cur.quantidade);
  }, 0);

  const subtotalContrato = cartItems.reduce((acc: number, cur: CartItem) => {
    const multiplicadorPeriodo = cur.tipo === 'assinatura' ? (cur.prazo_meses || 1) : 1;
    if (cur.tipo === 'produto') {
      return acc + (getProductQuantityPriceBreakdown(cur.item_detalhes, cur.quantidade).subtotalFinal * multiplicadorPeriodo);
    }
    return acc + ((cur.item_detalhes?.valor || 0) * cur.quantidade * multiplicadorPeriodo);
  }, 0);

  const descontoPromocoes = (promosAplicadas || []).reduce((acc: number, promo: PromoResult) => {
    if (promo.status === 'ativa' && promo.desconto_aplicado) {
      return acc + promo.desconto_aplicado.valor_desconto;
    }
    return acc;
  }, 0);
  
  const subtotalComPromos = Math.max(0, subtotalInicial - descontoPromocoes);

  // 1. Calcula descontos lógicos baseado no cupom selecionado (sobre o subtotal de mercadorias)
  const calcularDesconto = () => {
    if (!cupomDesconto) return 0;
    
    let baseCalculo = subtotalComPromos;
    if (cupomDesconto.produto_id) {
      const itemEsp = cartItems.find((c: CartItem) => c.item_id === cupomDesconto.produto_id);
      if (!itemEsp) return 0;
      const descontoPromocionalDoProduto = (promosAplicadas || []).reduce((acc: number, promo: PromoResult) => {
        if (promo.status !== 'ativa') return acc;
        if (promo.desconto_aplicado?.produto_id === cupomDesconto.produto_id) {
          return acc + Number(promo.desconto_aplicado.valor_desconto || 0);
        }
        return acc;
      }, 0);
      const unitVal = itemEsp.tipo === 'produto' ? (getProductQuantityPriceBreakdown(itemEsp.item_detalhes, itemEsp.quantidade).subtotalFinal / itemEsp.quantidade) : (itemEsp.item_detalhes?.valor || 0);
      baseCalculo = Math.max(0, (unitVal * itemEsp.quantidade) - descontoPromocionalDoProduto);
    }

    let desc = 0;
    if (cupomDesconto.tipo_desconto === 'porcentagem') {
      desc = baseCalculo * ((cupomDesconto.valor_desconto || 0) / 100);
    } else {
      desc = cupomDesconto.valor_desconto || 0;
    }

    return Math.min(desc, subtotalComPromos);
  };

  const descontoCalculado = Number(calcularDesconto().toFixed(2));
  
  // Taxa de entrega final (0 se cupom de frete grátis, caso contrário a taxa fixa se houver produtos)
  const taxaEntregaFinal = (temProdutos && !cupomEntrega) ? taxaEntregaFixa : (cupomEntrega?.tipo_entrega === 'taxa_fixa' ? (cupomEntrega.taxa_fixa_entrega || 0) : 0);

  // Total líquido a pagar antes das formas de resgate (Pontos VIP e Saldo da Carteira)
  const totalAntesResgates = Number(Math.max(0, subtotalComPromos - descontoCalculado + taxaEntregaFinal).toFixed(2));

  // 2. Lógica de pontos fidelidade (1 ponto = R$ 0,01) - Limitado ao saldo do cliente e ao total restante a pagar
  const maxPontosEmCentavos = Math.floor(totalAntesResgates * 100);
  const maxPontosValidos = Math.min(saldoPontos, Math.max(0, maxPontosEmCentavos));

  // Regra de Exclusividade PIX
  const isPixDescontoAtivoNoMomento = formaPagamento === 'pix' && lojaPixDescontoAtivo;

  const handleTogglePontos = (checked: boolean) => {
    if (checked) {
      if (isPixDescontoAtivoNoMomento && !lojaPixDescontoPermitirPontos && !usarPontos) {
        setModalAlertaPix({ tipo: 'pontos', pendingValue: maxPontosValidos });
        return;
      }
      setUsarPontos(true);
      setPontosAplicados(maxPontosValidos);
    } else {
      setUsarPontos(false);
      setPontosAplicados(0);
    }
  };

  const handlePontosChange = (val: number) => {
    if (isNaN(val) || val <= 0) {
      setUsarPontos(false);
      setPontosAplicados(0);
      return;
    }
    const cleanVal = Math.min(val, maxPontosValidos);
    if (!usarPontos && isPixDescontoAtivoNoMomento && !lojaPixDescontoPermitirPontos) {
      setModalAlertaPix({ tipo: 'pontos', pendingValue: cleanVal });
      return;
    }
    setUsarPontos(true);
    setPontosAplicados(cleanVal);
  };

  const descontoPontos = usarPontos ? Number((Math.min(pontosAplicados, maxPontosValidos) * 0.01).toFixed(2)) : 0;

  // Desconto PIX
  const eligiblePixSubtotal = cartItems.reduce((acc: number, item: any) => {
    if (item.tipo === 'produto' && checkPixDiscountApplies(item.item_detalhes, pixSettings)) {
      const unitVal = (getProductQuantityPriceBreakdown(item.item_detalhes, item.quantidade).subtotalFinal / item.quantidade) || (item.item_detalhes?.valor || 0);
      return acc + (unitVal * item.quantidade);
    }
    return acc;
  }, 0);

  const pixDiscountBlockedByPoints = usarPontos && pontosAplicados > 0 && !lojaPixDescontoPermitirPontos;
  const pixDiscountBlockedByWallet = usarSaldoCarteira && saldoCarteiraAplicado > 0 && !lojaPixDescontoPermitirCarteira;
  const isPixDiscountEligible = formaPagamento === 'pix' && lojaPixDescontoAtivo && !pixDiscountBlockedByPoints && !pixDiscountBlockedByWallet;

  const baseCalculoPix = Math.max(0, eligiblePixSubtotal - (descontoCalculado || 0) - descontoPontos);
  const pixDiscountValue = isPixDiscountEligible
    ? parseFloat((baseCalculoPix * (lojaPixDescontoPorcentagem / 100)).toFixed(2))
    : 0;

  // Total Líquido antes de abater o saldo da carteira (já considerando cupons, pontos, frete e desconto PIX)
  const totalAntesCarteira = Number(Math.max(0, totalAntesResgates - descontoPontos - pixDiscountValue).toFixed(2));

  // 1.5 Lógica de Saldo na Carteira Virtual
  const saldoCarteiraUtilizavel = Math.max(0, saldoCarteira);
  const maxSaldoValido = Number(Math.min(saldoCarteiraUtilizavel, totalAntesCarteira).toFixed(2));
  
  const handleToggleSaldoCarteira = (checked: boolean) => {
    if (checked) {
      if (isPixDescontoAtivoNoMomento && !lojaPixDescontoPermitirCarteira && !usarSaldoCarteira) {
        setModalAlertaPix({ tipo: 'carteira', pendingValue: maxSaldoValido });
        return;
      }
      setUsarSaldoCarteira(true);
      setSaldoCarteiraAplicado(maxSaldoValido);
    } else {
      setUsarSaldoCarteira(false);
      setSaldoCarteiraAplicado(0);
    }
  };

  const handleSaldoCarteiraChange = (val: number) => {
    if (isNaN(val) || val <= 0) {
      setUsarSaldoCarteira(false);
      setSaldoCarteiraAplicado(0);
      return;
    }
    const cleanVal = Number(Math.min(val, maxSaldoValido).toFixed(2));
    if (!usarSaldoCarteira && isPixDescontoAtivoNoMomento && !lojaPixDescontoPermitirCarteira) {
      setModalAlertaPix({ tipo: 'carteira', pendingValue: cleanVal });
      return;
    }
    setUsarSaldoCarteira(true);
    setSaldoCarteiraAplicado(cleanVal);
  };

  const descontoCarteira = usarSaldoCarteira ? Number(Math.min(saldoCarteiraAplicado, maxSaldoValido).toFixed(2)) : 0;

  const handleSelectPix = () => {
    const hasRedemption = (usarPontos && pontosAplicados > 0 && !lojaPixDescontoPermitirPontos) || 
                          (usarSaldoCarteira && saldoCarteiraAplicado > 0 && !lojaPixDescontoPermitirCarteira);
    if (formaPagamento !== 'pix' && hasRedemption && lojaPixDescontoAtivo) {
      setModalAlertaPix({ tipo: 'troca_pix' });
      return;
    }
    setFormaPagamento('pix');
  };

  // Se o carrinho/total diminuir, reduz automaticamente os valores aplicados
  // para que a tela e o que é enviado ao servidor nunca fiquem dessincronizados.
  useEffect(() => {
    setPontosAplicados((prev) => (prev > maxPontosValidos ? maxPontosValidos : prev));
  }, [maxPontosValidos]);

  useEffect(() => {
    setSaldoCarteiraAplicado((prev) => (prev > maxSaldoValido ? maxSaldoValido : prev));
  }, [maxSaldoValido]);

  const totalHojeSemJuros = Number(Math.max(0, totalAntesCarteira - descontoCarteira).toFixed(2));
  
  // Taxa de juros do Crédito GSA
  const calcularTaxaJuros = (parcelas: number) =>
    parcelas <= 1 ? jurosCreditoAvista : jurosCreditoAvista + (jurosCreditoParcelado * parcelas);

  const taxaJurosAplicada = formaPagamento === 'credito_loja'
    ? calcularTaxaJuros(numParcelas)
    : 0;
  const valorJurosCredito = formaPagamento === 'credito_loja'
    ? parseFloat((totalHojeSemJuros * (taxaJurosAplicada / 100)).toFixed(2))
    : 0;

  // Parcelamento e Juros de Cartão de Crédito (Taxa InfinitePay)
  const taxaJurosCartaoMensal = 2.99; // % a.m. a partir de 2x (por conta do comprador)
  const calcularParcelaCartao = (n: number, base: number) => {
    if (n <= 1) return { parcela: base, total: base, juros: 0, comJuros: false, taxa: 0 };
    const taxaTotal = Number(((taxaJurosCartaoMensal * n)).toFixed(2));
    const jurosTotal = parseFloat((base * (taxaTotal / 100)).toFixed(2));
    const totalComJuros = Number((base + jurosTotal).toFixed(2));
    const valorParcela = Number((totalComJuros / n).toFixed(2));
    return { parcela: valorParcela, total: totalComJuros, juros: jurosTotal, comJuros: true, taxa: taxaTotal };
  };

  const infoParcelaCartao = calcularParcelaCartao(parcelasCartao, totalHojeSemJuros);
  const valorJurosCartao = formaPagamento === 'cartao' ? infoParcelaCartao.juros : 0;

  const totalHojeFinal = Number(Math.max(0, totalHojeSemJuros + valorJurosCredito + valorJurosCartao).toFixed(2));
  const totalContratoFinal = totalHojeFinal + (subtotalContrato - subtotalInicial);

  const isTravelCheckout = cartItems.some((c: CartItem) => c.tipo === ('pacote_viagem' as any));

  useEffect(() => {
    if (!isOpen) return;

    if (cupomEntrega) {
      if (!temProdutos) {
        setCupomEntrega(null);
        toast.error('Cupom de entrega removido: não há mais produtos físicos no carrinho.');
      } else if (
        cupomEntrega.tipo_entrega === 'frete_gratis_minimo' &&
        subtotalInicial < (cupomEntrega.valor_minimo_compra || 0)
      ) {
        setCupomEntrega(null);
        toast.error(
          `Cupom de frete grátis removido: a compra mínima é ${formatCurrency(cupomEntrega.valor_minimo_compra || 0)}.`,
        );
      }
    }

    if (cupomDesconto?.produto_id) {
      const itemNoCarrinho = cartItems.find((c: CartItem) => c.item_id === cupomDesconto.produto_id);
      if (!itemNoCarrinho) {
        setCupomDesconto(null);
        toast.error('Cupom removido: o produto exigido por este cupom não está mais no carrinho.');
      }
    }

    if (cupomDesconto && (cupomDesconto.valor_minimo_compra || 0) > 0 && subtotalInicial < (cupomDesconto.valor_minimo_compra || 0)) {
      setCupomDesconto(null);
      toast.error(
        `Cupom removido: a compra mínima para este cupom é ${formatCurrency(cupomDesconto.valor_minimo_compra || 0)}.`,
      );
    }

  }, [isOpen, subtotalInicial, temProdutos, cartItems, cupomEntrega, cupomDesconto]);

  const buscarCep = async (cep: string) => {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setEndereco(p => ({ ...p, cep: limpo, logradouro: data.logradouro, bairro: data.bairro, cidade: data.localidade, uf: data.uf }));
      } else {
        toast.error('CEP não encontrado.');
      }
    } catch {
      toast.error('Erro ao buscar CEP.');
    } finally {
      setBuscandoCep(false);
    }
  };

  const aplicarCupom = async (codigo: string, tipo: 'desconto' | 'entrega') => {
    if (!codigo) return;
    try {
      const { data, error } = await supabase.from('cupons_loja').select('*').eq('codigo_cupom', codigo.toUpperCase()).single();
      if (error || !data) {
        toast.error('Cupom inválido ou não encontrado.');
        return;
      }
      
      const cupom = data as CupomLoja;
      
      // Validações básicas
      if (cupom.status !== 'ativo') return toast.error('Este cupom não está mais ativo.');
      if (Number(cupom.limite_usos || 0) > 0 && Number(cupom.total_usos || 0) >= Number(cupom.limite_usos)) return toast.error('Limite de uso do cupom esgotado.');
      if (cupom.data_validade) {
        const [year, month, day] = String(cupom.data_validade).split('T')[0].split('-').map(Number);
        const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
        if (expiryDate < new Date()) return toast.error('Cupom expirado.');
      }
      if (cupom.cliente_id && cupom.cliente_id !== clientId) return toast.error('Este cupom é exclusivo para outro cliente.');

      // Verifica se o cliente ativou este cupom em Meus Cupons
      const { data: ativacao, error: errAtiv } = await supabase
        .from('cupons_ativados')
        .select('id')
        .eq('cliente_id', clientId)
        .eq('cupom_id', cupom.id)
        .maybeSingle();

      if (errAtiv) throw errAtiv;

      if (!ativacao) {
        return toast.error('Você precisa ativar este cupom primeiro. Vá em Meus Cupons e clique em "Ativar Cupom" antes de usar no checkout.', { duration: 5000 });
      }

      // Verifica se já atingiu o limite de usos do cliente
      const { data: orcUsados } = await supabase
        .from('orcamentos')
        .select('id')
        .eq('cliente_id', clientId)
        .neq('status', 'cancelado')
        .or(`cupom_desconto_id.eq.${cupom.id},cupom_entrega_id.eq.${cupom.id}`);

      const limiteCliente = cupom.limite_usos_por_cliente || 1;
      if (orcUsados && orcUsados.length >= limiteCliente) {
        return toast.error(`Você já atingiu o limite de ${limiteCliente} uso(s) deste cupom.`);
      }
      
      // Validação de tipo
      if (tipo === 'desconto' && cupom.categoria_cupom === 'entrega') return toast.error('Este é um cupom de entrega.');
      if (tipo === 'entrega' && cupom.categoria_cupom !== 'entrega') return toast.error('Este não é um cupom de entrega.');
      
      // Validação de produto específico
      if (cupom.produto_id) {
        const itemNoCarrinho = cartItems.find((c: CartItem) => c.item_id === cupom.produto_id);
        if (!itemNoCarrinho) {
          // Busca o nome e o código do produto para uma mensagem mais clara
          const { data: prodData } = await supabase.from('produtos').select('nome, codigo_produto, codigo_barras, identificador_preferencial').eq('id', cupom.produto_id).single();
          const nomeProd = prodData?.nome || 'um produto específico';
          const codProd = prodData ? getProductDisplayCode(prodData as any) : '---';
          return toast.error(`Este cupom é exclusivo para o item [${codProd}] ${nomeProd}. Adicione-o ao carrinho para aplicar o desconto.`);
        }
      }

      // Validação Extra de Entrega
      if (tipo === 'entrega') {
        if (!temProdutos) return toast.error('Você não tem produtos físicos no carrinho para usar cupom de entrega.');
        if (cupom.tipo_entrega === 'frete_gratis_minimo' && subtotalInicial < (cupom.valor_minimo_compra || 0)) {
          return toast.error(`A compra mínima para este frete grátis é ${formatCurrency(cupom.valor_minimo_compra || 0)}.`);
        }
        setCupomEntrega(cupom);
        setCupomEntInput('');
        toast.success('Benefício de entrega aplicado!');
      } else {
        // Cupom de desconto também respeita o valor mínimo de compra configurado.
        if ((cupom.valor_minimo_compra || 0) > 0 && subtotalInicial < (cupom.valor_minimo_compra || 0)) {
          return toast.error(`A compra mínima para usar este cupom é ${formatCurrency(cupom.valor_minimo_compra || 0)}.`);
        }
        setCupomDesconto(cupom);
        setCupomDescInput('');
        toast.success('Desconto aplicado com sucesso!');
      }

    } catch {
      toast.error('Erro ao processar cupom.');
    }
  };

  const handleFinalizar = async () => {
    // Trava síncrona contra duplo-clique (o estado do React pode não ter propagado ainda).
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await executarFinalizacao();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const executarFinalizacao = async () => {
    // Verificar se houve alteração de preço no banco antes de fechar
    try {
      const productIds = cartItems.filter((c: any) => c.tipo === 'produto').map((c: any) => c.item_id);
      if (productIds.length > 0) {
        const { data: dbProducts } = await supabase
          .from('produtos')
          .select('id, valor, valor_promocional, desconto_ativo, desconto_fim_em, desconto_prazo_tipo, desconto_limite_quantidade_ativo, desconto_quantidade_limite, desconto_quantidade_utilizada, visivel_na_loja, estoque_disponivel')
          .in('id', productIds);
        if (dbProducts) {
          let priceChanged = false;
          for (const item of cartItems) {
            if (item.tipo !== 'produto') continue;
            const dbProd = dbProducts.find((p: any) => p.id === item.item_id);
            if (dbProd) {
              // Verifica se a promoção expirou no banco
              let isStillActive = dbProd.desconto_ativo;
              if (isStillActive && dbProd.desconto_prazo_tipo === 'determinado' && dbProd.desconto_fim_em) {
                if (new Date() >= new Date(dbProd.desconto_fim_em)) {
                  isStillActive = false;
                }
              }
              // Verifica se a cota de quantidade foi esgotada
              if (isStillActive && dbProd.desconto_limite_quantidade_ativo && dbProd.desconto_quantidade_limite) {
                const restante = dbProd.desconto_quantidade_limite - (dbProd.desconto_quantidade_utilizada || 0);
                if (restante <= 0) {
                  isStillActive = false;
                }
              }
              const currentDbPrice = isStillActive ? dbProd.valor_promocional : dbProd.valor;
              const cartPrice = getProductQuantityPriceBreakdown(item.item_detalhes, item.quantidade).subtotalFinal / item.quantidade;
              if (Math.abs((currentDbPrice || 0) - cartPrice) > 0.001) {
                priceChanged = true;
                break;
              }
            }
          }
          if (priceChanged) {
            toast.error('O preço ou disponibilidade de alguns itens no seu pacote foi atualizado.');
            return;
          }
        }
      }
    } catch (err) {
      console.error('Erro ao validar alteração de preço:', err);
      toast.error('Não foi possível validar preços e estoque. Tente novamente.');
      return;
    }


    const hasInvalidOrDeleted = cartItems.some((c: any) => 
      !c.item_detalhes 
      || (c.tipo === 'produto' && c.item_detalhes?.controle_estoque && (c.item_detalhes?.estoque_disponivel <= 0))
    );
    if (hasInvalidOrDeleted) {
      toast.error('Remova os produtos excluídos ou esgotados do carrinho antes de finalizar.');
      return;
    }

    // Quantidade solicitada não pode ultrapassar o estoque disponível.
    const itemSemEstoqueSuficiente = cartItems.find((c: any) => (
      c.tipo === 'produto'
      && c.item_detalhes?.controle_estoque
      && Number(c.quantidade || 0) > Number(c.item_detalhes?.estoque_disponivel || 0)
    ));
    if (itemSemEstoqueSuficiente) {
      toast.error(
        `Estoque insuficiente para "${itemSemEstoqueSuficiente.item_detalhes?.nome || 'um produto'}": `
        + `restam ${Number(itemSemEstoqueSuficiente.item_detalhes?.estoque_disponivel || 0)} unidade(s).`,
      );
      return;
    }

    if (temProdutos && !enderecoCompletoValido) {
      toast.error('Endereço completo é obrigatório para entrega de produtos (CEP, logradouro, número, bairro, cidade e UF).');
      return;
    }

    // Revalida saldo de carteira, pontos e limite de crédito imediatamente antes do envio
    // (podem ter sido consumidos em outra aba/pedido concorrente).
    try {
      const { data: freshCli, error: freshErr } = await supabase
        .from('clientes')
        .select('limite_credito_disponivel, limite_credito_bloqueado, saldo_carteira, saldo_pontos')
        .eq('id', clientId)
        .single();
      if (freshErr) throw freshErr;

      const freshLimite = Math.max(Number(freshCli?.limite_credito_disponivel || 0) - Number(freshCli?.limite_credito_bloqueado || 0), 0);
      const freshCarteira = Number(freshCli?.saldo_carteira || 0);
      const freshPontos = Number(freshCli?.saldo_pontos || 0);

      setLimiteCreditoDisponivel(freshLimite);
      setSaldoCarteira(freshCarteira);
      setSaldoPontos(freshPontos);

      if (usarSaldoCarteira && saldoCarteiraAplicado > freshCarteira + 0.001) {
        toast.error('Seu saldo em carteira mudou. Revise o valor aplicado antes de finalizar.');
        setSaldoCarteiraAplicado(Number(Math.min(saldoCarteiraAplicado, freshCarteira).toFixed(2)));
        return;
      }

      if (usarPontos && pontosAplicados > freshPontos) {
        toast.error('Seu saldo de pontos mudou. Revise a quantidade aplicada antes de finalizar.');
        setPontosAplicados(Math.min(pontosAplicados, freshPontos));
        return;
      }

      if (formaPagamento === 'credito_loja' && totalHojeFinal > freshLimite) {
        toast.error(
          `Crédito GSA insuficiente: esta compra exige ${formatCurrency(totalHojeFinal)} `
          + `(com juros) e você tem ${formatCurrency(freshLimite)} disponível.`,
        );
        return;
      }
    } catch (err) {
      console.error('Erro ao revalidar saldos do cliente:', err);
      toast.error('Não foi possível validar seus saldos. Tente novamente.');
      return;
    }

    // Revalida os cupons aplicados imediatamente antes do envio (podem ter expirado
    // ou esgotado o limite de usos enquanto o checkout ficou aberto).
    try {
      const cupomIds = [cupomDesconto?.id, cupomEntrega?.id].filter(Boolean) as string[];
      if (cupomIds.length > 0) {
        const { data: freshCupons, error: cupErr } = await supabase
          .from('cupons_loja')
          .select('id, status, data_validade, total_usos, limite_usos')
          .in('id', cupomIds);
        if (cupErr) throw cupErr;

        const invalido = (id?: string | null) => {
          if (!id) return false;
          const c: any = (freshCupons || []).find((f: any) => f.id === id);
          if (!c) return true;
          if (c.status !== 'ativo') return true;
          if (Number(c.limite_usos || 0) > 0 && Number(c.total_usos || 0) >= Number(c.limite_usos)) return true;
          if (c.data_validade) {
            const [y, m, d] = String(c.data_validade).split('T')[0].split('-').map(Number);
            if (new Date(y, m - 1, d, 23, 59, 59) < new Date()) return true;
          }
          return false;
        };

        if (invalido(cupomDesconto?.id)) {
          setCupomDesconto(null);
          toast.error('O cupom de desconto aplicado não é mais válido e foi removido. Revise o total antes de finalizar.');
          return;
        }
        if (invalido(cupomEntrega?.id)) {
          setCupomEntrega(null);
          toast.error('O cupom de entrega aplicado não é mais válido e foi removido. Revise o total antes de finalizar.');
          return;
        }
      }
    } catch (err) {
      console.error('Erro ao revalidar cupons:', err);
      toast.error('Não foi possível validar os cupons aplicados. Tente novamente.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (isTravelCheckout) {
        // Fluxo de checkout de viagem
        const pacote = cartItems.find((c: any) => c.tipo === 'pacote_viagem');
        const data = await callClientRpc<any>('gsa_client_checkout_travel', {
          p_payload: {
            request_id: checkoutRequestId.current,
            proposta_id: pacote.item_id,
            forma_pagamento: formaPagamento,
            parcelas: normalizedTravelInstallments,
          }
        });
        
        toast.success('🎉 Viagem Confirmada com Sucesso!');
        checkoutRequestId.current = generateUUID();
        onSuccess(data.transacao_id);
      } else {
        // Fluxo normal da loja
        const enderecoCompleto = temProdutos ? endereco : null;
        const data = await callClientRpc<any>('gsa_client_checkout_store', {
          p_payload: {
            request_id: checkoutRequestId.current,
            carrinho: cartItems.map((item: CartItem) => ({
              item_id: item.item_id,
              tipo: item.tipo,
              quantidade: item.quantidade,
              ...(item.tipo === 'assinatura' ? { prazo_meses: item.prazo_meses || 1 } : {}),
            })),
            forma_pagamento: formaPagamento === 'credito_loja' ? 'credito_loja' : 'outros',
            pontos_usados: usarPontos ? Math.min(pontosAplicados, maxPontosValidos) : 0,
            saldo_carteira_usado: descontoCarteira,
            cupom_desconto_id: cupomDesconto?.id || null,
            cupom_entrega_id: cupomEntrega?.id || null,
            endereco_entrega: enderecoCompleto,
            parcelas: formaPagamento === 'credito_loja' && opcaoPagamentoParcelado ? numParcelas : 1,
          }
        });

        const orcamentoId = data.orcamento_id;
        const codigoOrcamento = data.codigo_orcamento || `ODC-${orcamentoId?.slice(0, 8)}`;

        // 1. PIX Instantâneo
        if (formaPagamento === 'pix') {
          const checkoutInfo = await createInfinitePayOrderCheckout({
            orcamentoId: orcamentoId,
            codigoOrcamento: codigoOrcamento,
            clienteId: clientId,
            clienteNome: clienteInfo.nome,
            clienteEmail: clienteInfo.email,
            clienteTelefone: clienteInfo.telefone,
          });

          if (!checkoutInfo.success) throw new Error(checkoutInfo.error || 'Não foi possível gerar a cobrança.');

        setPixModalData({
            orderId: orcamentoId,
            orderCode: codigoOrcamento,
            total: checkoutInfo.total ?? totalHojeFinal,
            pixCode: checkoutInfo.pixCode || '',
            qrCodeUrl: checkoutInfo.qrCodeUrl || '',
            checkoutUrl: checkoutInfo.link,
          });
          setPixModalOpen(true);
          return;
        }

        // 2. Cartão de Crédito
        if (formaPagamento === 'cartao') {
          const checkoutInfo = await createInfinitePayOrderCheckout({
            orcamentoId: orcamentoId,
            codigoOrcamento: codigoOrcamento,
            clienteId: clientId,
            clienteNome: clienteInfo.nome,
            clienteEmail: clienteInfo.email,
            clienteTelefone: clienteInfo.telefone,
          });

          if (!checkoutInfo.success) throw new Error(checkoutInfo.error || 'Não foi possível gerar a cobrança.');

        toast.success('🎉 Pedido Registrado! Abrindo pagamento seguro do cartão...', { duration: 4000 });
          checkoutRequestId.current = generateUUID();
          if (checkoutInfo.link && checkoutInfo.link.startsWith('http')) {
            window.open(checkoutInfo.link, '_blank');
          }
          onSuccess(orcamentoId);
          return;
        }

        // 3. Boleto Bancário
        if (formaPagamento === 'boleto') {
          toast.success('🎉 Pedido Registrado! Seu boleto bancário está disponível para pagamento.', { duration: 5000 });
          checkoutRequestId.current = generateUUID();
          onSuccess(orcamentoId);
          return;
        }

        toast.success('🎉 Pedido Confirmado com Sucesso!');
        checkoutRequestId.current = generateUUID();
        onSuccess(orcamentoId);
      }
      
    } catch (e: any) {
      console.error('Erro no checkout RPC:', e);
      const raw = String(e?.message || '');
      const friendly = /produto indispon/i.test(raw)
        ? 'Um dos produtos do carrinho saiu do catálogo. Abra o carrinho e remova o item indisponível para concluir a compra.'
        : raw || 'Falha ao processar compra. Tente novamente.';
      toast.error(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Finalizar Compra" size="2xl">
      <div className="-m-5 sm:-m-6 lg:-m-7 flex flex-col bg-neutral-50 min-h-0">
        
        {/* Barra de Progresso Visual Compacta e Elegante */}
        <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-2.5 shrink-0">
          <div className="flex items-center justify-between relative max-w-md mx-auto">
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-neutral-200 rounded-full z-0"></div>
            <div 
              className="absolute left-6 top-1/2 -translate-y-1/2 h-0.5 bg-[#17345f] rounded-full z-0 transition-all duration-300"
              style={{
                width: etapaCheckout === 1 ? '0%' : etapaCheckout === 2 ? '50%' : 'calc(100% - 3rem)'
              }}
            ></div>
            
            {/* Passo 1: Endereço */}
            <button
              type="button"
              onClick={() => setEtapaCheckout(1)}
              className="relative z-10 flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                etapaCheckout > 1 
                  ? 'bg-[#17345f] text-white' 
                  : etapaCheckout === 1 
                    ? 'bg-[#17345f] text-white ring-2 ring-indigo-200' 
                    : 'bg-white text-neutral-400 border border-neutral-300'
              }`}>
                {etapaCheckout > 1 ? <Check className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
              </div>
              <span className={`text-[9px] font-extrabold uppercase tracking-wider ${etapaCheckout === 1 ? 'text-[#17345f]' : 'text-neutral-500'}`}>
                1. Endereço
              </span>
            </button>

            {/* Passo 2: Cupons & Benefícios */}
            <button
              type="button"
              onClick={() => {
                if (temProdutos && !enderecoCompletoValido) {
                  toast.error('Preencha o endereço de entrega completo para avançar.');
                  return;
                }
                setEtapaCheckout(2);
              }}
              className="relative z-10 flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                etapaCheckout > 2 
                  ? 'bg-[#17345f] text-white' 
                  : etapaCheckout === 2 
                    ? 'bg-[#17345f] text-white ring-2 ring-indigo-200' 
                    : 'bg-white text-neutral-400 border border-neutral-300'
              }`}>
                {etapaCheckout > 2 ? <Check className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5" />}
              </div>
              <span className={`text-[9px] font-extrabold uppercase tracking-wider ${etapaCheckout === 2 ? 'text-[#17345f]' : 'text-neutral-500'}`}>
                2. Benefícios
              </span>
            </button>

            {/* Passo 3: Pagamento & Resumo */}
            <button
              type="button"
              onClick={() => {
                if (temProdutos && !enderecoCompletoValido) {
                  toast.error('Preencha o endereço de entrega completo para avançar.');
                  return;
                }
                setEtapaCheckout(3);
              }}
              className="relative z-10 flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                etapaCheckout === 3 
                  ? 'bg-[#17345f] text-white ring-2 ring-indigo-200' 
                  : 'bg-white text-neutral-400 border border-neutral-300'
              }`}>
                <CreditCard className="w-3.5 h-3.5" />
              </div>
              <span className={`text-[9px] font-extrabold uppercase tracking-wider ${etapaCheckout === 3 ? 'text-[#17345f]' : 'text-neutral-500'}`}>
                3. Pagamento
              </span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ETAPA 1: CONFIRMAR ENDEREÇO DE ENTREGA */}
        {/* ========================================================================= */}
        {etapaCheckout === 1 && (
          <div className="p-4 sm:p-6 space-y-4 max-w-xl mx-auto w-full">
            <div className="bg-white rounded-xl p-4 sm:p-5 border border-neutral-200/90 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
                      Endereço de Entrega
                    </h3>
                    <p className="text-[10px] text-neutral-400 font-medium">
                      {temProdutos ? 'Confirme o local para envio dos produtos' : 'Identificação para o pedido'}
                    </p>
                  </div>
                </div>

                {temProdutos && endereco.cep && !isEditingEndereco && (
                  <button 
                    type="button"
                    onClick={() => setIsEditingEndereco(true)}
                    className="text-[11px] font-bold text-[#17345f] hover:text-[#0c2242] uppercase tracking-wider flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-100 cursor-pointer shadow-xs transition-all"
                  >
                    ✏️ Alterar
                  </button>
                )}
              </div>

              {temProdutos ? (
                !isEditingEndereco && endereco.cep ? (
                  <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3.5 text-xs text-neutral-700 space-y-1">
                    <p className="font-bold text-neutral-900 leading-tight">
                      {endereco.logradouro}, {endereco.numero} {endereco.complemento && `(${endereco.complemento})`}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {endereco.bairro} — {endereco.cidade}/{endereco.uf} · CEP: <span className="font-mono font-semibold text-neutral-700">{endereco.cep}</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {endereco.cep && (
                      <div className="flex justify-end">
                        <button 
                          type="button"
                          onClick={() => {
                            fetchDadosCredito();
                            setIsEditingEndereco(false);
                          }}
                          className="text-[10px] font-bold text-neutral-500 hover:text-neutral-700 uppercase tracking-wider cursor-pointer"
                        >
                          Usar endereço cadastrado
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-0.5">CEP *</label>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          maxLength={9}
                          value={endereco.cep} 
                          onChange={e => { 
                            let v = e.target.value.replace(/\D/g, '');
                            if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
                            setEndereco({...endereco, cep: v}); 
                            if(v.replace(/\D/g, '').length >= 8) buscarCep(v); 
                          }} 
                          className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none" 
                          placeholder="00000-000" 
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-0.5">Logradouro *</label>
                        <input type="text" readOnly value={endereco.logradouro} className="w-full px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg text-xs text-neutral-600" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-0.5">Número *</label>
                        <input type="text" inputMode="numeric" value={endereco.numero} onChange={e => setEndereco({...endereco, numero: e.target.value})} className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-0.5">Complemento</label>
                        <input type="text" value={endereco.complemento} onChange={e => setEndereco({...endereco, complemento: e.target.value})} className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-0.5">Bairro *</label>
                        <input type="text" readOnly value={endereco.bairro} className="w-full px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg text-xs text-neutral-600" />
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-0.5">Cidade / UF *</label>
                        <input type="text" readOnly value={`${endereco.cidade} - ${endereco.uf}`} className="w-full px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg text-xs text-neutral-600" />
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                  <p className="text-[11px] font-bold text-indigo-900 leading-normal">
                    Seu pedido contém apenas itens digitais e não requer entrega física.
                  </p>
                </div>
              )}
            </div>

            {/* Mini Box de Conferência */}
            <div className="bg-white rounded-xl p-3 sm:p-4 border border-neutral-200/90 shadow-xs flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-black uppercase text-neutral-800 tracking-wider">Itens no Carrinho</h4>
                  <p className="text-[10px] text-neutral-400">
                    {cartItems.reduce((acc: number, c: CartItem) => acc + c.quantidade, 0)} {cartItems.reduce((acc: number, c: CartItem) => acc + c.quantidade, 0) === 1 ? 'item' : 'itens'}
                  </p>
                </div>
              </div>
              <span className="text-sm font-black text-neutral-900">{formatCurrency(subtotalInicial)}</span>
            </div>

            {/* Botão de Avançar Etapa 1 */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                disabled={temProdutos && !enderecoCompletoValido}
                onClick={() => {
                  if (temProdutos && !enderecoCompletoValido) {
                    toast.error('Preencha os campos de endereço para avançar.');
                    return;
                  }
                  setEtapaCheckout(2);
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Avançar para Cupons & Benefícios
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 2: CUPONS (ESQUERDA) & PONTOS VIP E CARTEIRA (DIREITA) */}
        {/* ========================================================================= */}
        {etapaCheckout === 2 && (
          <div className="p-4 sm:p-5 w-full flex flex-col justify-between min-h-0 flex-1 space-y-4">
            
            {/* Grid de 2 Colunas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5 items-start">
              
              {/* Coluna Esquerda: Cupons da Loja */}
              <div className="bg-white rounded-xl p-4 border border-neutral-200/90 shadow-xs space-y-3">
                <div className="flex items-center gap-1.5 border-b border-neutral-100 pb-2.5">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">Cupons da Loja</h3>
                </div>
                
                {/* Cupom Desconto */}
                <div className="bg-blue-50/40 p-3 rounded-xl border border-blue-100 space-y-1.5">
                  <label className="text-[10px] font-bold text-blue-800 uppercase flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Cupom de Desconto
                  </label>
                  {cupomDesconto ? (
                    <div className="flex items-center justify-between bg-white border border-blue-200 px-3 py-2 rounded-lg text-xs">
                      <span className="font-mono font-bold text-blue-700">
                        {cupomDesconto.codigo_cupom} - {cupomDesconto.tipo_desconto === 'porcentagem' ? `${cupomDesconto.valor_desconto}% OFF` : `R$ ${cupomDesconto.valor_desconto} OFF`}
                      </span>
                      <button onClick={() => setCupomDesconto(null)} className="text-[11px] font-bold text-red-500 hover:text-red-700 cursor-pointer">
                        Remover
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <input 
                          type="text" 
                          value={cupomDescInput} 
                          onChange={e => setCupomDescInput(e.target.value.toUpperCase())} 
                          placeholder="CÓDIGO DO CUPOM" 
                          className="flex-1 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-mono uppercase focus:ring-1 focus:ring-blue-500 focus:outline-none" 
                        />
                        <button 
                          onClick={() => aplicarCupom(cupomDescInput, 'desconto')} 
                          className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 cursor-pointer shadow-xs transition-all"
                        >
                          Aplicar
                        </button>
                      </div>
                      <button 
                        onClick={() => handleOpenSelector('desconto')}
                        className="text-[9px] font-black text-blue-600 uppercase tracking-wider hover:text-blue-800 cursor-pointer block pt-0.5"
                      >
                        Ver Cupons Disponíveis
                      </button>
                    </div>
                  )}
                </div>

                {/* Cupom Entrega */}
                {temProdutos && (
                  <div className="bg-emerald-50/40 p-3 rounded-xl border border-emerald-100 space-y-1.5">
                    <label className="text-[10px] font-bold text-emerald-800 uppercase flex items-center gap-1">
                      <Package className="w-3 h-3" /> Benefício de Frete
                    </label>
                    {cupomEntrega ? (
                      <div className="flex items-center justify-between bg-white border border-emerald-200 px-3 py-2 rounded-lg text-xs">
                        <span className="font-mono font-bold text-emerald-700">
                          {cupomEntrega.codigo_cupom} - {cupomEntrega.tipo_entrega === 'frete_gratis' ? 'Frete Grátis' : 'Frete Fixo'}
                        </span>
                        <button onClick={() => setCupomEntrega(null)} className="text-[11px] font-bold text-red-500 hover:text-red-700 cursor-pointer">
                          Remover
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input 
                            type="text" 
                            value={cupomEntInput} 
                            onChange={e => setCupomEntInput(e.target.value.toUpperCase())} 
                            placeholder="CÓDIGO DE FRETE" 
                            className="flex-1 px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-mono uppercase focus:ring-1 focus:ring-emerald-500 focus:outline-none" 
                          />
                          <button 
                            onClick={() => aplicarCupom(cupomEntInput, 'entrega')} 
                            className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 cursor-pointer shadow-xs transition-all"
                          >
                            Aplicar
                          </button>
                        </div>
                        <button 
                          onClick={() => handleOpenSelector('entrega')}
                          className="text-[9px] font-black text-emerald-700 uppercase tracking-wider hover:text-emerald-900 cursor-pointer block pt-0.5"
                        >
                          Ver Benefícios de Frete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Coluna Direita: Pontos VIP & Saldo da Carteira */}
              <div className="space-y-3">
                
                {/* Sessão de Resgate de Pontos VIP */}
                {!isTravelCheckout && (
                  <div className="rounded-xl border border-purple-800/40 bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-900 p-3.5 text-white shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-amber-400 p-1.5 text-purple-950">
                          <Coins className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-wider text-white">Resgatar Pontos VIP</h3>
                          <p className="text-[9px] text-purple-200">100 pts = R$ 1,00 de desconto</p>
                        </div>
                      </div>

                      <label className="relative inline-flex cursor-pointer items-center">
                        <input 
                          type="checkbox" 
                          checked={usarPontos} 
                          disabled={saldoPontos <= 0 || maxPontosValidos <= 0}
                          onChange={e => handleTogglePontos(e.target.checked)}
                          className="peer sr-only" 
                        />
                        <div className="h-5 w-9 rounded-full bg-purple-950 peer-checked:bg-amber-400 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-purple-950 border border-purple-400/40"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-purple-800/40">
                      <span className="text-purple-200/80 text-[11px]">Saldo Disponível:</span>
                      <span className="font-black text-amber-300 text-xs">
                        👑‘ {saldoPontos.toLocaleString()} pts ({formatCurrency(saldoPontos / 100)})
                      </span>
                    </div>

                    {usarPontos && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            inputMode="numeric"
                            value={pontosAplicados || ''} 
                            min="0"
                            max={maxPontosValidos}
                            onChange={e => handlePontosChange(parseInt(e.target.value) || 0)}
                            className="flex-1 rounded-lg border border-purple-400/30 bg-white px-2.5 py-1 text-xs font-bold text-neutral-900 focus:outline-none" 
                            placeholder="Ex: 500"
                          />
                          <span className="text-xs font-black text-amber-300 shrink-0">
                            - {formatCurrency(descontoPontos)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {saldoPontos >= 100 && maxPontosValidos >= 100 && (
                            <button type="button" onClick={() => handlePontosChange(100)} className="rounded bg-purple-900/60 px-2 py-0.5 text-[9px] font-bold text-amber-200 cursor-pointer">100 pts</button>
                          )}
                          {saldoPontos >= 500 && maxPontosValidos >= 500 && (
                            <button type="button" onClick={() => handlePontosChange(500)} className="rounded bg-purple-900/60 px-2 py-0.5 text-[9px] font-bold text-amber-200 cursor-pointer">500 pts</button>
                          )}
                          <button type="button" onClick={() => handlePontosChange(maxPontosValidos)} className="ml-auto rounded bg-amber-400 px-2 py-0.5 text-[9px] font-black text-purple-950 cursor-pointer">Máximo ({maxPontosValidos.toLocaleString()} pts)</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sessão de Saldo da Carteira Virtual */}
                {!isTravelCheckout && (
                  <div className="rounded-xl border border-emerald-700/50 bg-gradient-to-r from-emerald-950 via-teal-950 to-emerald-900 p-3.5 text-white shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-emerald-400 p-1.5 text-emerald-950">
                          <Wallet className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-wider text-white">Usar Saldo da Carteira</h3>
                          <p className="text-[9px] text-emerald-200">Abata o valor com seu saldo</p>
                        </div>
                      </div>

                      <label className="relative inline-flex cursor-pointer items-center">
                        <input 
                          type="checkbox" 
                          checked={usarSaldoCarteira} 
                          disabled={saldoCarteira <= 0 || maxSaldoValido <= 0}
                          onChange={e => handleToggleSaldoCarteira(e.target.checked)}
                          className="peer sr-only" 
                        />
                        <div className="h-5 w-9 rounded-full bg-emerald-950 peer-checked:bg-emerald-400 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-emerald-950 border border-emerald-300/40"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-800/60">
                      <span className="text-emerald-200/80 text-[11px]">Saldo Disponível:</span>
                      <span className="font-black text-emerald-300 text-xs">{formatCurrency(saldoCarteira)}</span>
                    </div>

                    {usarSaldoCarteira && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            inputMode="decimal"
                            value={saldoCarteiraAplicado ? Number(saldoCarteiraAplicado.toFixed(2)) : ''} 
                            min="0"
                            max={maxSaldoValido}
                            step="0.01"
                            onChange={e => handleSaldoCarteiraChange(parseFloat(e.target.value) || 0)}
                            className="flex-1 rounded-lg border border-emerald-400/30 bg-white px-2.5 py-1 text-xs font-bold text-neutral-900 focus:outline-none" 
                            placeholder="Ex: 50.00"
                          />
                          <span className="text-xs font-black text-emerald-300 shrink-0">
                            - {formatCurrency(descontoCarteira)}
                          </span>
                        </div>
                        <button type="button" onClick={() => handleSaldoCarteiraChange(maxSaldoValido)} className="block ml-auto rounded bg-emerald-400 px-2 py-0.5 text-[9px] font-black text-emerald-950 cursor-pointer">Usar Máximo ({formatCurrency(maxSaldoValido)})</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Navegação da Etapa 2 */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-200/80">
              <button
                type="button"
                onClick={() => setEtapaCheckout(1)}
                className="px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar para Endereço
              </button>

              <button
                type="button"
                onClick={() => setEtapaCheckout(3)}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                Avançar para Pagamento
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 3: PAGAMENTO (COMPACTO) & RESUMO DO PEDIDO (AMPLO E PROPORCIONAL) */}
        {/* ========================================================================= */}
        {etapaCheckout === 3 && (
          <div className="flex flex-col md:flex-row min-h-0 flex-1">
            
            {/* Coluna Esquerda: Formas de Pagamento Compactas */}
            <div className="w-full md:w-[230px] lg:w-[250px] shrink-0 p-3.5 border-b md:border-b-0 md:border-r border-neutral-200 flex flex-col justify-between space-y-3">
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 border-b border-neutral-100 pb-2">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                  <h3 className="text-[11px] font-black text-neutral-800 uppercase tracking-wider">Pagamento</h3>
                </div>
                
                {/* Opções Enfileiradas */}
                <div className="flex flex-col gap-1.5">
                  {checkoutMetodoPixAtivo && (
                    <button
                      type="button"
                      onClick={handleSelectPix}
                      className={`flex items-center justify-between p-2.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                        formaPagamento === 'pix'
                          ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-bold shadow-xs'
                          : 'border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${formaPagamento === 'pix' ? 'bg-indigo-600' : 'bg-neutral-300'}`}></div>
                        <span className="text-xs font-black">PIX</span>
                      </div>
                      {lojaPixDescontoAtivo && isPixDiscountEligible ? (
                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                          -{lojaPixDescontoPorcentagem}%
                        </span>
                      ) : lojaPixDescontoAtivo && (pixDiscountBlockedByPoints || pixDiscountBlockedByWallet) ? (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded" title="Desconto no PIX não aplicável devido ao uso de saldo/pontos">
                          Sem desc. (Saldo/Pontos)
                        </span>
                      ) : null}
                    </button>
                  )}

                  {checkoutMetodoCartaoAtivo && (
                    <button
                      type="button"
                      onClick={() => setFormaPagamento('cartao')}
                      className={`flex items-center justify-between p-2.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                        formaPagamento === 'cartao'
                          ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-bold shadow-xs'
                          : 'border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${formaPagamento === 'cartao' ? 'bg-indigo-600' : 'bg-neutral-300'}`}></div>
                        <span className="text-xs font-black">Cartão de Crédito</span>
                      </div>
                    </button>
                  )}

                  {checkoutMetodoBoletoAtivo && (
                    <button
                      type="button"
                      onClick={() => setFormaPagamento('boleto')}
                      className={`flex items-center justify-between p-2.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                        formaPagamento === 'boleto'
                          ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-bold shadow-xs'
                          : 'border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${formaPagamento === 'boleto' ? 'bg-indigo-600' : 'bg-neutral-300'}`}></div>
                        <span className="text-xs font-black">Boleto Bancário</span>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={limiteCreditoTotal <= 0}
                    onClick={() => {
                      const totalInicialComJuros = totalHojeSemJuros * (1 + calcularTaxaJuros(numParcelas) / 100);
                      if (totalInicialComJuros > limiteCreditoDisponivel) {
                        toast.error(`Saldo de crédito insuficiente (${formatCurrency(limiteCreditoDisponivel)}).`);
                        return;
                      }
                      setFormaPagamento('credito_loja');
                    }}
                    className={`flex flex-col p-2.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                      limiteCreditoTotal <= 0
                        ? 'opacity-50 cursor-not-allowed border-neutral-100 bg-neutral-50/50 text-neutral-400'
                        : formaPagamento === 'credito_loja'
                          ? 'border-emerald-600 bg-emerald-50/30 text-emerald-950 font-bold shadow-xs'
                          : 'border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${formaPagamento === 'credito_loja' ? 'bg-emerald-600' : 'bg-neutral-300'}`}></div>
                      <span className="text-xs font-black">Crédito GSA</span>
                    </div>
                    {limiteCreditoTotal > 0 && (
                      <span className="text-[9px] text-neutral-400 ml-4">
                        Disp: <strong className="text-emerald-700">{formatCurrency(limiteCreditoDisponivel)}</strong>
                      </span>
                    )}
                  </button>
                </div>

                {formaPagamento === 'cartao' && (
                  <div className="p-2 bg-neutral-100 rounded-lg space-y-1">
                    <label className="text-[9px] font-bold text-neutral-500 uppercase block">Parcelas do Cartão</label>
                    <select
                      value={parcelasCartao}
                      onChange={e => setParcelasCartao(parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1 bg-white border border-neutral-300 rounded text-[11px] font-bold text-neutral-800"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(p => {
                        const calc = calcularParcelaCartao(p, totalHojeSemJuros);
                        return (
                          <option key={p} value={p}>
                            {p}x de {formatCurrency(calc.parcela)} {calc.comJuros ? `(Total: ${formatCurrency(calc.total)} c/ juros)` : '(sem juros à vista)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {formaPagamento === 'credito_loja' && opcaoPagamentoParcelado && (
                  <div className="p-2 bg-neutral-100 rounded-lg space-y-1">
                    <label className="text-[9px] font-bold text-neutral-500 uppercase block">Parcelas</label>
                    <select
                      value={numParcelas}
                      onChange={e => setNumParcelas(parseInt(e.target.value))}
                      className="w-full px-2 py-1 bg-white border border-neutral-300 rounded text-[11px] font-bold text-neutral-800"
                    >
                      <option value={1}>À vista (30d) - {formatCurrency(totalHojeSemJuros * (1 + calcularTaxaJuros(1) / 100))}</option>
                      {Array.from({ length: Math.max(0, maxParcelas - 1) }, (_, i) => i + 2).map(n => {
                        const taxaN = calcularTaxaJuros(n);
                        const totalComJuros = totalHojeSemJuros * (1 + taxaN / 100);
                        return (
                          <option key={n} value={n}>{n}x de {formatCurrency(totalComJuros / n)} (+{taxaN}%)</option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              {/* Botão Retornar */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setEtapaCheckout(2)}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Voltar
                </button>
              </div>
            </div>

            {/* Coluna Direita: Resumo do Pedido Amplo e Proporcional */}
            <div className="flex-1 p-3.5 sm:p-4.5 bg-neutral-100/70 flex flex-col justify-between">
              <div className="w-full bg-[#181818] rounded-2xl p-4 sm:p-5 text-white shadow-xl flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-neutral-300" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-white">Resumo do Pedido</h3>
                    </div>
                    <span className="text-[10px] font-bold text-neutral-300 bg-white/10 px-2 py-0.5 rounded-md">
                      {cartItems.reduce((acc: number, c: CartItem) => acc + c.quantidade, 0)} {cartItems.reduce((acc: number, c: CartItem) => acc + c.quantidade, 0) === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                  
                  {/* Lista de Itens do Pedido */}
                  <div className="space-y-1.5 mb-4 max-h-44 overflow-y-auto pr-1.5 custom-scrollbar">
                    {cartItems.map((c: CartItem) => {
                      const itemSubtotalEfetivo = c.tipo === 'produto'
                        ? getProductQuantityPriceBreakdown(c.item_detalhes, c.quantidade).subtotalFinal
                        : (c.item_detalhes?.valor || 0) * c.quantidade;

                      const itemPixEligivel = formaPagamento === 'pix' && isPixDiscountEligible
                        && c.tipo === 'produto'
                        && checkPixDiscountApplies(c.item_detalhes, pixSettings);
                      const itemPrecoComPix = itemPixEligivel
                        ? parseFloat((itemSubtotalEfetivo * (1 - lojaPixDescontoPorcentagem / 100)).toFixed(2))
                        : itemSubtotalEfetivo;

                      return (
                        <div key={c.id} className="flex justify-between items-center py-1.5 px-2.5 rounded-lg bg-white/5 text-xs">
                          <div className="pr-2 min-w-0 flex-1">
                            <span className="text-[9px] text-neutral-400 block">
                              {c.quantidade}x · <span className="font-mono text-indigo-300">{c.tipo === 'produto' ? getProductDisplayCode(c.item_detalhes as any) : ''}</span>
                            </span>
                            <span className="font-bold truncate text-[11px] block leading-tight text-white">{c.item_detalhes?.nome}</span>
                          </div>

                          <div className="text-right shrink-0">
                            {itemPixEligivel ? (
                              <div className="flex flex-col items-end leading-none gap-0.5">
                                <span className="text-[10px] text-neutral-500 line-through">{formatCurrency(itemSubtotalEfetivo)}</span>
                                <span className="font-black text-emerald-400 text-xs">{formatCurrency(itemPrecoComPix)}</span>
                                <span className="text-[8px] font-black text-emerald-300 bg-emerald-500/20 px-1 rounded">-{lojaPixDescontoPorcentagem}% PIX</span>
                              </div>
                            ) : (
                              <span className="font-bold text-white text-xs">{formatCurrency(itemSubtotalEfetivo)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Detalhamento de Valores */}
                  <div className="border-t border-white/10 pt-2.5 space-y-1.5 text-xs">
                    <div className="flex justify-between text-neutral-300 text-[11px]">
                      <span>Subtotal</span>
                      <span className="font-bold">{formatCurrency(subtotalInicial)}</span>
                    </div>
                    
                    {pixDiscountValue > 0 && (
                      <div className="flex justify-between items-center bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 rounded-lg">
                        <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">🏷️ Desconto PIX ({lojaPixDescontoPorcentagem}%)</span>
                        <span className="text-xs font-black text-emerald-300">-{formatCurrency(pixDiscountValue)}</span>
                      </div>
                    )}
                    
                    {cupomDesconto && (
                      <div className="flex justify-between text-blue-400 text-[11px] font-bold">
                        <span>Cupom ({cupomDesconto.codigo_cupom})</span>
                        <span>-{formatCurrency(descontoCalculado)}</span>
                      </div>
                    )}
                    
                    {usarPontos && descontoPontos > 0 && (
                      <div className="flex justify-between text-purple-300 text-[11px] font-bold">
                        <span>Desconto VIP</span>
                        <span>-{formatCurrency(descontoPontos)}</span>
                      </div>
                    )}
                    
                    {usarSaldoCarteira && descontoCarteira > 0 && (
                      <div className="flex justify-between text-emerald-400 text-[11px] font-bold">
                        <span>Saldo Carteira</span>
                        <span>-{formatCurrency(descontoCarteira)}</span>
                      </div>
                    )}
                    
                    {temProdutos && (
                      <div className="flex justify-between text-[11px] font-bold text-red-400">
                        <span>Frete</span>
                        <span>
                          {cupomEntrega 
                            ? (cupomEntrega.tipo_entrega === 'frete_gratis' ? 'Grátis' : formatCurrency(cupomEntrega.taxa_fixa_entrega || 0)) 
                            : formatCurrency(taxaEntregaFixa)}
                        </span>
                      </div>
                    )}
                    
                    {formaPagamento === 'credito_loja' && (
                      <div className="flex justify-between text-amber-400 text-[11px] font-bold">
                        <span>Juros Crédito (+{taxaJurosAplicada}%)</span>
                        <span>+{formatCurrency(valorJurosCredito)}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-neutral-800 flex justify-between items-end">
                      <div>
                        <span className="text-[10px] font-bold text-neutral-400 block">Total Hoje</span>
                        <span className="text-[8px] text-[#d8bd73] font-bold">+{Math.floor(totalHojeFinal)} pts VIP</span>
                      </div>
                      <span className="text-xl font-black text-white">{formatCurrency(totalHojeFinal)}</span>
                    </div>
                  </div>
                </div>

                {/* Botão de Finalização */}
                <div className="mt-3 pt-1">
                  <button 
                    onClick={handleFinalizar}
                    disabled={
                      isSubmitting
                      || (temProdutos && !enderecoCompletoValido)
                      || (formaPagamento === 'credito_loja' && totalHojeFinal > limiteCreditoDisponivel)
                    }
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-2.5 rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Confirmar Pedido
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pop-up Modal Informativo de Exclusividade do Desconto PIX */}
      {modalAlertaPix && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-neutral-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 border border-amber-500/30">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-neutral-900 leading-snug">
                  {modalAlertaPix.tipo === 'troca_pix'
                    ? `Aplicar Desconto de ${lojaPixDescontoPorcentagem}% no PIX`
                    : `Desconto Exclusivo no PIX (${lojaPixDescontoPorcentagem}%)`
                  }
                </h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  {modalAlertaPix.tipo === 'troca_pix'
                    ? `Aplicar o desconto de ${lojaPixDescontoPorcentagem}% no PIX desativará os resgates de saldo e pontos de fidelidade, pois o desconto é exclusivo para pagamento 100% no PIX. Deseja desativar os resgates para aplicar o desconto de ${lojaPixDescontoPorcentagem}%?`
                    : modalAlertaPix.tipo === 'carteira'
                    ? `O desconto de ${lojaPixDescontoPorcentagem}% no PIX é exclusivo para pagamento integral via PIX. Ao aplicar o saldo da sua carteira, o desconto de ${lojaPixDescontoPorcentagem}% no PIX será anulado (mas você ainda poderá pagar o valor restante via PIX normalmente).`
                    : `O desconto de ${lojaPixDescontoPorcentagem}% no PIX é exclusivo para pagamento integral via PIX. Ao resgatar pontos VIP para desconto, o desconto de ${lojaPixDescontoPorcentagem}% no PIX será anulado (mas você ainda poderá pagar o valor restante via PIX normalmente).`
                  }
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50/60 p-3.5 border border-amber-200/80 text-xs text-amber-900 space-y-1.5">
              {modalAlertaPix.tipo === 'troca_pix' ? (
                <>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-neutral-500">Opção 1:</span>
                    <span className="text-emerald-700 font-extrabold">Aplicar {lojaPixDescontoPorcentagem}% PIX (Desativa resgates)</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-neutral-500">Opção 2:</span>
                    <span className="text-neutral-700 font-extrabold">Manter resgates (Sem desc. PIX)</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-neutral-500">Opção 1:</span>
                    <span className="text-emerald-700 font-extrabold">Manter {lojaPixDescontoPorcentagem}% de Desconto no PIX</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-neutral-500">Opção 2:</span>
                    <span className="text-purple-700 font-extrabold">
                      {modalAlertaPix.tipo === 'carteira' ? 'Resgatar Saldo da Carteira (Anula Desc. PIX)' : 'Resgatar Pontos VIP (Anula Desc. PIX)'}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              {modalAlertaPix.tipo === 'troca_pix' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormaPagamento('pix');
                      setUsarPontos(false);
                      setPontosAplicados(0);
                      setUsarSaldoCarteira(false);
                      setSaldoCarteiraAplicado(0);
                      setModalAlertaPix(null);
                      toast.success(`Desconto de ${lojaPixDescontoPorcentagem}% no PIX aplicado! Resgates desativados.`);
                    }}
                    className="w-full rounded-xl bg-emerald-600 py-3 px-3 text-xs font-black text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all cursor-pointer text-center"
                  >
                    Aplicar desconto de {lojaPixDescontoPorcentagem}%
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormaPagamento('pix');
                      setModalAlertaPix(null);
                      toast(`Forma de pagamento alterada para PIX (mantendo resgates).`);
                    }}
                    className="w-full rounded-xl border border-neutral-300 bg-white py-3 px-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-all cursor-pointer text-center"
                  >
                    Manter resgates
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setModalAlertaPix(null);
                      toast(`Desconto de ${lojaPixDescontoPorcentagem}% no PIX mantido.`);
                    }}
                    className="w-full rounded-xl border border-neutral-300 bg-white py-3 px-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-all cursor-pointer text-center"
                  >
                    Continuar com desconto
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const tipo = modalAlertaPix.tipo;
                      const pending = modalAlertaPix.pendingValue;
                      setModalAlertaPix(null);
                      if (tipo === 'carteira') {
                        setUsarSaldoCarteira(true);
                        setSaldoCarteiraAplicado(pending ?? maxSaldoValido);
                        toast.success('Saldo da carteira aplicado. Desconto do PIX anulado.');
                      } else {
                        setUsarPontos(true);
                        setPontosAplicados(pending ?? maxPontosValidos);
                        toast.success('Pontos VIP aplicados. Desconto do PIX anulado.');
                      }
                    }}
                    className="w-full rounded-xl bg-indigo-600 py-3 px-3 text-xs font-black text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all cursor-pointer text-center"
                  >
                    {modalAlertaPix.tipo === 'carteira' ? 'Resgatar saldo' : 'Resgatar pontos'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AvailableCouponsModal 
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        coupons={availableCoupons}
        subtotal={subtotalInicial}
        selectedCouponCode={selectorCategory === 'desconto' ? cupomDesconto?.codigo_cupom : cupomEntrega?.codigo_cupom}
        onSelect={(code) => {
          if (selectorCategory === 'desconto') {
            setCupomDescInput(code);
            aplicarCupom(code, 'desconto');
          } else {
            setCupomEntInput(code);
            aplicarCupom(code, 'entrega');
          }
        }}
        category={selectorCategory}
      />

      {/* Modal de Pagamento PIX Instantâneo (InfinitePay) */}
      {pixModalData && (
        <CheckoutPixModal
          isOpen={pixModalOpen}
          onClose={() => {
            setPixModalOpen(false);
            onSuccess(pixModalData.orderId);
          }}
          orderId={pixModalData.orderId}
          orderCode={pixModalData.orderCode}
          total={pixModalData.total}
          pixCode={pixModalData.pixCode}
          qrCodeUrl={pixModalData.qrCodeUrl}
          checkoutUrl={pixModalData.checkoutUrl}
          onPaymentSuccess={(orderId) => {
            setPixModalOpen(false);
            onSuccess(orderId);
          }}
        />
      )}
    </Modal>
  );
}
