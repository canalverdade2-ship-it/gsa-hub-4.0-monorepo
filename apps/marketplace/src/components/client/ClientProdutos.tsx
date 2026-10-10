import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';
import { formatCurrency, formatDate, formatDateTime, generateCode, handleError } from '../../lib/utils';
import { 
  ShoppingBag, 
  Package, 
  CheckCircle, 
  Clock, 
  Info, 
  MapPin, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  Tag, 
  Truck, 
  AlertCircle,
  TrendingUp,
  Receipt,
  ArrowRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';

export function ClientProdutos({ 
  clientId, 
  initialTab,
  initialItemId,
  onNavigate
}: { 
  clientId: string, 
  initialTab?: string,
  initialItemId?: string,
  onNavigate?: (module: string, tab?: string) => void
}) {
  const { containerRef: meusTabsRef, setButtonRef: setMeusTabButtonRef } = useAutoFitTabs(16, 10);
  const [meusTab, setMeusTab] = useState<'comprados' | 'cancelados'>(
    (initialTab as any) || 'comprados'
  );

  useEffect(() => {
    if (initialTab) setMeusTab(initialTab as any);
  }, [initialTab]);
  const [meusProdutos, setMeusProdutos] = useState<any[]>([]);
  const [selectedProduto, setSelectedProduto] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isComprarNovamenteModalOpen, setIsComprarNovamenteModalOpen] = useState(false);
  const [novaQuantidade, setNovaQuantidade] = useState(1);
  const hasAutoOpened = useRef<string | null>(null);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialItemId && meusProdutos.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = meusProdutos.find(p => p.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        if (['em_analise', 'pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(item.status)) setMeusTab('comprados');
        else if (item.status === 'cancelado') setMeusTab('cancelados');

        setSelectedProduto(item);
        setIsModalOpen(true);

        // Scroll to the item
        setTimeout(() => {
          const element = document.getElementById(`prod-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 300);
      } else {
        if (initialTab && initialTab !== meusTab) {
          setMeusTab(initialTab as any);
        }
      }
    }
  }, [initialItemId, meusProdutos.length, initialTab]);

  useEffect(() => {
    fetchMeusProdutos();
  }, [clientId, meusTab]);

  useRealtimeSubscription(
    [
      {
        table: 'ordens_compra',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchMeusProdutos,
      },
      {
        table: 'produtos',
        onChange: fetchMeusProdutos,
      },
      {
        table: 'faturas',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchMeusProdutos,
      },
    ],
    [clientId]
  );

  async function fetchMeusProdutos() {
    const { data } = await supabase
      .from('ordens_compra')
      .select('*, produtos(nome, valor, imagem_url), faturas(*), orcamentos(*)')
      .eq('cliente_id', clientId);
    
    if (data) setMeusProdutos(data);
  };

  const handleOpenComprarNovamente = async (produto: any) => {
    setSelectedProduto(produto);
    
    try {
      if (!clientId) throw new Error('ID do cliente não encontrado');

      const { data: catalogProduct, error: catalogError } = await supabase
        .from('produtos')
        .select('id, status, visivel_na_loja, controle_estoque, estoque_disponivel, tipo_cliente')
        .eq('id', produto.produto_id)
        .single();
      if (catalogError || !catalogProduct || catalogProduct.status !== 'ativo' || !catalogProduct.visivel_na_loja) {
        throw new Error('Este produto não está disponível para recompra.');
      }
      if (catalogProduct.controle_estoque && Number(catalogProduct.estoque_disponivel || 0) < 1) {
        throw new Error('Este produto está sem estoque.');
      }

      // Check if item is already in cart
      const { data: existingCart } = await supabase.from('loja_carrinhos')
        .select('id, quantidade')
        .eq('cliente_id', clientId)
        .eq('item_id', produto.produto_id)
        .maybeSingle();

      if (existingCart) {
        // Just increase quantity by 1
        await clientOperationalWrite(clientId, 'loja_carrinhos', 'update', {
          quantidade: existingCart.quantidade + 1,
          updated_at: new Date().toISOString()
        }, { id: existingCart.id });
      } else {
        // Insert new cart item
        await clientOperationalWrite(clientId, 'loja_carrinhos', 'insert', {
          item_id: produto.produto_id,
          tipo: 'produto',
          quantidade: 1,
          updated_at: new Date().toISOString()
        });
      }

      toast.success('Produto adicionado ao carrinho!');
      setIsModalOpen(false);

      if (onNavigate) {
        onNavigate('gsa_store', 'shop'); // Switches active module to gsa_store and tab to shop
      }

      // Dispatch event to open cart after a small delay to allow the store module to mount
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-store-cart', { detail: { open: true } }));
      }, 150);
      
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao adicionar produto ao carrinho.');
      console.error(error);
    }
  };

  const handleOpenDetails = (produto: any) => {
    setSelectedProduto(produto);
    setIsModalOpen(true);
  };

  const filteredMeusProdutos = meusProdutos.filter(p => {
    if (meusTab === 'comprados') {
      return ['em_analise', 'pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(p.status);
    } else {
      return p.status === 'cancelado';
    }
  });

  return (
    <div className="space-y-8">
      <div className="space-y-6">
      <div className="w-full min-w-0 sm:w-auto overflow-hidden">
        <div ref={meusTabsRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">

          <button 
            ref={setMeusTabButtonRef(0)}
            onClick={() => setMeusTab('comprados')}
            className={`min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black leading-none transition-all sm:px-6 ${meusTab === 'comprados' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
          >
            Comprados
          </button>
          <button 
            ref={setMeusTabButtonRef(1)}
            onClick={() => setMeusTab('cancelados')}
            className={`min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black leading-none transition-all sm:px-6 ${meusTab === 'cancelados' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
          >
            Cancelados
          </button>
        </div>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMeusProdutos.map((p) => {
            const fatura = p.faturas?.[0];
            const orcamento = Array.isArray(p.orcamentos) ? p.orcamentos[0] : p.orcamentos;
            
            // Determinar status de exibição rico
            const orderStatus = p.status;
            const isPaid = fatura?.status === 'pago' || orcamento?.status === 'pago' || ['pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(orderStatus);
  
            let displayStatus = orderStatus;
            if (isPaid && orderStatus === 'em_analise') {
              displayStatus = 'pago';
            }
  
            const statusColors: Record<string, string> = {
              'em_analise': 'bg-orange-50 text-orange-600 ring-1 ring-orange-200/50',
              'pago': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50',
              'aprovado': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50',
              'em_expedicao': 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/50',
              'em_transporte': 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/50',
              'concluido': 'bg-purple-50 text-purple-600 ring-1 ring-purple-200/50',
              'cancelado': 'bg-red-50 text-red-600 ring-1 ring-red-200/50',
            };

            const statusLabels: Record<string, string> = {
              'em_analise': 'Aguardando Pagamento',
              'pago': 'Pedido Aprovado',
              'aprovado': 'Pedido Aprovado',
              'em_expedicao': 'Em Expedição',
              'em_transporte': 'Em Transporte',
              'concluido': 'Pedido Entregue',
              'cancelado': 'Cancelado',
            };

            const displayLabel = statusLabels[displayStatus] || displayStatus;
            const badgeClass = statusColors[displayStatus] || 'bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200';
            const isPulsing = ['em_analise', 'em_expedicao', 'em_transporte'].includes(displayStatus);

            return (
              <div 
                id={`prod-${p.id}`} 
                key={p.id} 
                className={`group relative overflow-hidden rounded-[2.5rem] bg-white p-6 transition-all duration-500 hover:-translate-y-1 ${
                  highlightedItemId === p.id 
                    ? 'bg-indigo-50/50 ring-4 ring-indigo-500 shadow-2xl shadow-indigo-500/20 scale-[1.02] z-10' 
                    : 'shadow-md hover:shadow-2xl ring-1 ring-neutral-200'
                }`}
              >
                {/* Efeito decorativo de fundo no card */}
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-50 opacity-20 group-hover:scale-150 transition-all duration-700" />
                
                <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                  <div>
                    {/* Header do Card */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-mono font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100/50">
                        {orcamento?.codigo_orcamento || `#OC${p.codigo_ordem}`}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
                        {isPulsing && (
                          <span className={`h-1.5 w-1.5 rounded-full bg-current animate-ping`} />
                        )}
                        {displayLabel}
                      </span>
                    </div>

                    {/* Conteúdo Principal do Card */}
                    <div className="flex gap-4 items-start">
                      <div className="h-16 w-16 rounded-2xl bg-neutral-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-200/50">
                        {p.produtos?.imagem_url ? (
                          <img src={p.produtos.imagem_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-7 w-7 text-neutral-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base font-black text-neutral-900 tracking-tight leading-tight truncate group-hover:text-indigo-600 transition-colors">
                          {p.nome_produto_contratado ?? p.produtos?.nome}
                        </h4>
                        <p className="text-[11px] font-bold text-neutral-400 mt-1">
                          Data: {formatDate(p.data_criacao)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs font-bold text-neutral-500">
                            {p.quantidade || 1} { (p.quantidade || 1) === 1 ? 'unidade' : 'unidades' }
                          </span>
                          <span className="h-1 w-1 rounded-full bg-neutral-300" />
                          <span className="text-sm font-black text-neutral-900">
                            {formatCurrency((p.valor_unitario_contratado ?? p.produtos?.valor ?? 0) * (p.quantidade || 1))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé e Ação */}
                  <div className="pt-2 border-t border-neutral-100 mt-2">
                    <button
                      onClick={() => handleOpenDetails(p)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-50 py-2.5 text-xs font-black text-neutral-600 transition-all hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Info className="h-4 w-4" />
                      Visualizar Detalhes
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredMeusProdutos.length === 0 && (
            <div className="col-span-full py-12 text-center text-neutral-400 font-medium">
              Nenhum produto encontrado nesta aba.
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Detalhes do Pedido"
        size="lg"
      >
        {selectedProduto && (() => {
          const fatura = selectedProduto.faturas?.[0];
          const orcamento = Array.isArray(selectedProduto.orcamentos) ? selectedProduto.orcamentos[0] : selectedProduto.orcamentos;
          
          const isPaid = fatura?.status === 'pago' || orcamento?.status === 'pago' || ['pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(selectedProduto.status);
  
          let displayStatus = selectedProduto.status;
          if (isPaid && selectedProduto.status === 'em_analise') {
            displayStatus = 'pago';
          }
  
          const statusColors: Record<string, string> = {
            'em_analise': 'bg-orange-50 text-orange-600 ring-1 ring-orange-200',
            'pago': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
            'aprovado': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
            'em_expedicao': 'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
            'em_transporte': 'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
            'concluido': 'bg-purple-50 text-purple-600 ring-1 ring-purple-200',
            'cancelado': 'bg-red-50 text-red-600 ring-1 ring-red-200',
          };

          const statusLabels: Record<string, string> = {
            'em_analise': 'Aguardando Pagamento',
            'pago': 'Pedido Aprovado',
            'aprovado': 'Pedido Aprovado',
            'em_expedicao': 'Em Expedição',
            'em_transporte': 'Em Transporte',
            'concluido': 'Pedido Entregue',
            'cancelado': 'Cancelado',
          };

          const displayLabel = statusLabels[displayStatus] || displayStatus;
          const badgeClass = statusColors[displayStatus] || 'bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200';

          return (
            <div className="space-y-6 text-left">
              {/* Alerta de Cancelamento */}
              {selectedProduto.status === 'cancelado' && (
                <div className="bg-red-50 border border-red-200 rounded-3xl p-5 text-red-700">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider mb-1">Pedido Cancelado</h4>
                      <p className="text-[11px] leading-normal font-semibold">
                        Este pedido foi cancelado e está qualificado para estorno. 
                        Você pode acompanhar o prazo de reembolso de 10 dias na aba <strong className="font-extrabold text-red-800">Trocas e Devoluções</strong> na tela inicial.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Informações Principais do Item */}
              <div className="rounded-[2rem] bg-neutral-50 p-6 ring-1 ring-neutral-200/60 relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 h-24 w-24 rounded-full bg-indigo-500 opacity-5" />
                
                <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-neutral-200/60 pb-6 mb-6">
                  <div className="flex gap-4">
                    <div className="h-20 w-20 rounded-2xl bg-white border border-neutral-200 flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {selectedProduto.produtos?.imagem_url ? (
                        <img src={selectedProduto.produtos.imagem_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-8 w-8 text-neutral-400" />
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Código do Pedido</span>
                      <h3 className="text-xl font-black text-neutral-900 tracking-tight leading-tight">
                        {orcamento?.codigo_orcamento || `#OC${selectedProduto.codigo_ordem}`}
                      </h3>
                      <h4 className="text-sm font-bold text-neutral-600 mt-1 leading-normal">
                        {selectedProduto.nome_produto_contratado ?? selectedProduto.produtos?.nome}
                      </h4>
                    </div>
                  </div>
                  <div className="sm:text-right flex flex-col justify-between items-start sm:items-end">
                    <div>
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status do Pedido</span>
                      <div className="mt-1">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${badgeClass}`}>
                          {['em_analise', 'em_expedicao', 'em_transporte'].includes(displayStatus) && (
                            <span className="h-2 w-2 rounded-full bg-current animate-ping" />
                          )}
                          {displayLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Calendar className="h-3 w-3" /> Data do Pedido</span>
                    <p className="text-sm font-bold text-neutral-900 mt-1">{formatDate(selectedProduto.data_criacao)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> Qtd Pedida</span>
                    <p className="text-sm font-bold text-neutral-900 mt-1">{selectedProduto.quantidade || 1} { (selectedProduto.quantidade || 1) === 1 ? 'unidade' : 'unidades' }</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><DollarSign className="h-3 w-3" /> Valor Unitário</span>
                    <p className="text-sm font-bold text-neutral-900 mt-1">{formatCurrency(selectedProduto.valor_unitario_contratado ?? selectedProduto.produtos?.valor ?? 0)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Receipt className="h-3 w-3" /> Valor Total</span>
                    <p className="text-sm font-black text-indigo-600 mt-1">{formatCurrency((selectedProduto.valor_unitario_contratado ?? selectedProduto.produtos?.valor ?? 0) * (selectedProduto.quantidade || 1))}</p>
                  </div>
                </div>
              </div>

              {/* Grid de Rastreamento e Endereço */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Timeline de Entrega */}
                {isPaid && selectedProduto.status !== 'cancelado' && (
                  <div className="rounded-[2rem] bg-neutral-50 p-6 ring-1 ring-neutral-200/60 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-1.5">
                        <Truck className="h-4 w-4 text-indigo-500 animate-pulse" /> Timeline de Entrega
                      </h4>
                      
                      <div className="relative pl-6 space-y-6">
                        {/* Linha vertical tracejada de fundo */}
                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 border-l-2 border-dashed border-neutral-300" />
                        
                        {(() => {
                          const steps = [
                            { 
                              label: 'Pedido Realizado', 
                              desc: 'Registrado com sucesso',
                              date: orcamento?.data_criacao || selectedProduto.data_criacao, 
                              active: true,
                              icon: Clock,
                              color: 'bg-emerald-500'
                            },
                            { 
                              label: 'Pagamento Aprovado', 
                              desc: 'Pagamento confirmado',
                              date: orcamento?.data_pagamento_aprovado, 
                              active: !!orcamento?.data_pagamento_aprovado || displayStatus !== 'em_analise',
                              icon: CreditCard,
                              color: 'bg-emerald-500'
                            },
                            { 
                              label: 'Em Expedição', 
                              desc: 'Preparando embalagem',
                              date: orcamento?.data_separacao, 
                              active: !!orcamento?.data_separacao || ['em_expedicao', 'em_transporte', 'concluido'].includes(displayStatus),
                              icon: Package,
                              color: 'bg-blue-500'
                            },
                            { 
                              label: 'Em Transporte', 
                              desc: 'A caminho do endereço',
                              date: orcamento?.data_envio, 
                              active: !!orcamento?.data_envio || ['em_transporte', 'concluido'].includes(displayStatus),
                              icon: Truck,
                              color: 'bg-amber-500'
                            },
                            { 
                              label: 'Pedido Entregue', 
                              desc: 'Entregue com sucesso',
                              date: orcamento?.data_entrega, 
                              active: !!orcamento?.data_entrega || displayStatus === 'concluido',
                              icon: CheckCircle,
                              color: 'bg-purple-500'
                            },
                          ];

                          return steps.map((step, idx) => {
                            const StepIcon = step.icon;
                            const isActive = step.active;
                            
                            return (
                              <div key={idx} className="relative flex gap-4">
                                {/* Indicador circular */}
                                <div className={`absolute -left-[25px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                                  isActive ? `${step.color} text-white` : 'bg-neutral-200 text-neutral-400'
                                }`}>
                                  {isActive && <div className="h-1.5 w-1.5 rounded-full bg-white animate-ping absolute" />}
                                  <div className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-neutral-400'}`} />
                                </div>
                                
                                <div className="min-w-0">
                                  <p className={`text-xs font-black uppercase tracking-wider ${isActive ? 'text-neutral-900' : 'text-neutral-400'}`}>
                                    {step.label}
                                  </p>
                                  {isActive ? (
                                    <div className="space-y-0.5 text-left">
                                      <p className="text-[10px] text-neutral-500 font-semibold">{step.desc}</p>
                                      {step.date && (
                                        <p className="text-[10px] font-bold text-indigo-600 mt-0.5">
                                          {formatDateTime(step.date)}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-[10px] font-bold text-neutral-300 mt-0.5">Aguardando etapa...</p>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Detalhes Financeiros e Entrega */}
                <div className="space-y-6">
                  {/* Endereço de Entrega */}
                  {orcamento?.endereco_entrega && (
                    <div className="rounded-[2rem] bg-neutral-50 p-6 ring-1 ring-neutral-200/60">
                      <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-indigo-500" /> Endereço de Entrega
                      </h4>
                      <div className="bg-white rounded-2xl p-4 border border-neutral-200/60 shadow-sm text-xs font-semibold text-neutral-700 space-y-1">
                        <p>{orcamento.endereco_entrega.logradouro}, {orcamento.endereco_entrega.numero}</p>
                        {orcamento.endereco_entrega.complemento && <p>Complemento: {orcamento.endereco_entrega.complemento}</p>}
                        <p>{orcamento.endereco_entrega.bairro} - {orcamento.endereco_entrega.cidade}/{orcamento.endereco_entrega.uf}</p>
                        <p className="text-neutral-400 font-mono text-[10px] pt-1">CEP: {orcamento.endereco_entrega.cep}</p>
                      </div>
                    </div>
                  )}

                  {/* Resumo de Custos e Fatura */}
                  <div className="rounded-[2rem] bg-neutral-50 p-6 ring-1 ring-neutral-200/60 space-y-4">
                    <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                      <Receipt className="h-4 w-4 text-indigo-500" /> Resumo de Faturamento
                    </h4>
                    
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-xs font-bold text-neutral-500">
                        <span>Subtotal de Itens</span>
                        <span>{formatCurrency((selectedProduto.valor_unitario_contratado ?? selectedProduto.produtos?.valor ?? 0) * (selectedProduto.quantidade || 1))}</span>
                      </div>
                      
                      {orcamento?.desconto > 0 && (
                        <div className="flex justify-between text-xs font-bold text-emerald-600">
                          <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Desconto Aplicado</span>
                          <span>-{formatCurrency(orcamento.desconto)}</span>
                        </div>
                      )}

                      {orcamento?.taxa_entrega > 0 && (
                        <div className="flex justify-between text-xs font-bold text-neutral-500">
                          <span>Taxa de Entrega (Frete)</span>
                          <span>{formatCurrency(orcamento.taxa_entrega)}</span>
                        </div>
                      )}
                      
                      <div className="h-px bg-neutral-200 my-2" />
                      
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-neutral-800 uppercase tracking-wider">Total Líquido</span>
                        <span className="text-lg font-black text-indigo-600">
                          {formatCurrency(orcamento?.total || ((selectedProduto.produtos?.valor || 0) * (selectedProduto.quantidade || 1)))}
                        </span>
                      </div>
                    </div>

                    {/* Dados da Fatura */}
                    {fatura && (
                      <div className="mt-3 pt-3 border-t border-neutral-200 flex items-center justify-between text-[10px] font-bold text-neutral-500">
                        <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Fatura: {fatura.codigo_fatura || `#FAT-${fatura.id?.slice(0, 6)}`}</span>
                        <span className={`uppercase px-2 py-0.5 rounded-full ${
                          fatura.status === 'pago' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50' : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/50'
                        }`}>
                          {fatura.status === 'pago' ? 'Pago' : 'Aguardando Pagamento'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Botão de Compra Novamente */}
              {selectedProduto.status === 'concluido' && (
                <div className="mt-8">
                  <button
                    onClick={() => handleOpenComprarNovamente(selectedProduto)}
                    className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-700 hover:shadow-indigo-700/40 transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Comprar Novamente
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>


    </div>
  );
}
