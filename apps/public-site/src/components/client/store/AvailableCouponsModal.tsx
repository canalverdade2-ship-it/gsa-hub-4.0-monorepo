import React, { useState } from 'react';
import { 
  ArrowRight, CheckCircle2, Clock, Tag, Ticket, AlertCircle, 
  ShoppingBag, Truck, Percent, Sparkles, Check, Copy, Flame
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import { toast } from 'react-hot-toast';
import { routes } from '../../../routing/routeCatalog';
import { navigate } from '../../../routing/navigationService';
import type { CupomLoja } from '../../../types';

interface AvailableCouponsModalProps {
  isOpen: boolean;
  onClose: () => void;
  coupons: CupomLoja[];
  onSelect?: (code: string) => void;
  onSelectCoupon?: (coupon: CupomLoja) => void;
  category: 'desconto' | 'entrega';
  subtotal?: number;
  selectedCouponCode?: string;
}

export default function AvailableCouponsModal({
  isOpen,
  onClose,
  coupons,
  onSelect,
  onSelectCoupon,
  category,
  subtotal,
  selectedCouponCode,
}: AvailableCouponsModalProps) {
  const [manualCode, setManualCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const isDesconto = category === 'desconto';
  const modalTitle = isDesconto ? 'Cupons de Desconto Disponíveis' : 'Benefícios de Frete & Entrega';

  const handleSelect = (coupon: CupomLoja) => {
    if (onSelect) {
      onSelect(coupon.codigo_cupom);
    }
    if (onSelectCoupon) {
      onSelectCoupon(coupon);
    }
    onClose();
  };

  const handleApplyManual = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim().toUpperCase();
    if (!clean) return;
    if (onSelect) {
      onSelect(clean);
    }
    onClose();
  };

  const copyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Código ${code} copiado!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        
        {/* Banner Informativo Superior Estilo E-Commerce */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-[#0f233f] via-[#17345f] to-[#1f4782] p-4 text-white shadow-md">
          <div className="absolute right-0 top-0 -mt-2 -mr-2 h-24 w-24 rounded-full bg-amber-400/10 blur-xl pointer-events-none" />
          <div className="flex items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30">
                {isDesconto ? <Percent className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  {isDesconto ? 'Economize no seu Pedido' : 'Economize no Frete'}
                </h4>
                <p className="text-[11px] text-blue-100 font-medium leading-tight mt-0.5">
                  Selecione um dos cupons ativados abaixo para aplicar o benefício instantaneamente.
                </p>
              </div>
            </div>
            {subtotal !== undefined && subtotal > 0 && (
              <div className="hidden sm:block text-right shrink-0 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-xs">
                <span className="text-[10px] font-bold text-blue-200 block uppercase">Subtotal Atual</span>
                <span className="text-sm font-black text-white">{formatCurrency(subtotal)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Campo Rápido para Digitar Código Manual */}
        <form onSubmit={handleApplyManual} className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="Possui outro código? Digite aqui (Ex: DESCONTO10)..."
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50/80 pl-9 pr-3 py-2.5 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 uppercase tracking-wider focus:border-[#17345f] focus:bg-white focus:outline-none focus-visible:ring-[#9b742f] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="rounded-xl bg-[#17345f] px-4 py-2.5 text-xs font-black text-white hover:bg-[#102746] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-[#9b742f] transition-all cursor-pointer shadow-xs shrink-0"
          >
            Aplicar
          </button>
        </form>

        {/* Lista de Cupons Estilo Ticket de Marketplace */}
        {coupons.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-neutral-200 bg-neutral-50/60 px-6 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-neutral-200 bg-white shadow-xs">
              <Ticket className="h-8 w-8 text-neutral-300" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-black text-neutral-900 uppercase tracking-wide">
              Nenhum benefício disponível nesta categoria
            </h3>
            <p className="mt-1.5 max-w-[300px] text-xs leading-relaxed text-neutral-500 font-medium">
              Você pode ver e ativar todos os seus cupons na nossa{' '}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(routes.marketplace.store.cupons());
                }}
                className="font-bold underline text-[#17345f] hover:text-[#0f2342] cursor-pointer"
              >
                Página de Cupons & Benefícios
              </button>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3.5 pt-1">
            {coupons.map((coupon) => {
              const minValor = Number(coupon.valor_minimo_compra || 0);
              const isMinMet = subtotal === undefined || minValor <= 0 || subtotal >= minValor;
              const faltandoParaMinimo = subtotal !== undefined && minValor > 0 && subtotal < minValor ? minValor - subtotal : 0;
              const isCurrentlySelected = selectedCouponCode && selectedCouponCode.toUpperCase() === coupon.codigo_cupom.toUpperCase();
              const progressPct = minValor > 0 && subtotal !== undefined ? Math.min(100, Math.round((subtotal / minValor) * 100)) : 100;

              return (
                <div
                  key={coupon.id}
                  onClick={() => handleSelect(coupon)}
                  className={`group relative flex flex-col sm:flex-row overflow-hidden rounded-2xl border-2 transition-all cursor-pointer shadow-xs ${
                    isCurrentlySelected
                      ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20 shadow-md'
                      : isMinMet
                      ? 'border-neutral-200 bg-white hover:border-[#17345f] hover:shadow-lg hover:-translate-y-0.5'
                      : 'border-amber-200/80 bg-white opacity-85 hover:opacity-100 hover:border-amber-400'
                  }`}
                >
                  {/* Badge de Destaque "Selecionado / Em Uso" */}
                  {isCurrentlySelected && (
                    <div className="absolute top-0 right-0 z-20 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest px-3 py-0.5 rounded-bl-xl shadow-xs flex items-center gap-1">
                      <Check className="h-3 w-3" /> Aplicado no Pedido
                    </div>
                  )}

                  {/* LADO ESQUERDO DO TICKET: VALOR E IDENTIDADE VISUAL */}
                  <div className={`relative flex flex-col items-center justify-center p-4 sm:w-44 shrink-0 text-white overflow-hidden border-b sm:border-b-0 sm:border-r-2 border-dashed ${
                    isDesconto
                      ? 'bg-linear-to-br from-[#102441] via-[#17345f] to-[#1f4782] border-blue-900/30'
                      : 'bg-linear-to-br from-[#064e3b] via-[#047857] to-[#059669] border-emerald-900/30'
                  }`}>
                    {/* Elementos Decorativos de Fundo */}
                    <div className="absolute -left-6 -bottom-6 h-20 w-20 rounded-full bg-white/5 pointer-events-none" />
                    <div className="absolute right-0 top-0 h-12 w-12 rounded-full bg-amber-400/10 blur-sm pointer-events-none" />

                    {/* Semicírculos de Recorte de Cupom (Notches) na Divisória */}
                    <div className="hidden sm:block absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-white border border-neutral-300 z-10" />
                    <div className="hidden sm:block absolute -right-2.5 -bottom-2.5 h-5 w-5 rounded-full bg-white border border-neutral-300 z-10" />

                    {/* Tag de Tipo do Cupom */}
                    <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300 border border-white/10 backdrop-blur-xs flex items-center gap-1">
                      <Flame className="h-3 w-3 text-amber-400" />
                      {isDesconto ? 'Cupom de Desconto' : 'Cupom de Entrega'}
                    </span>

                    {/* Valor Gigante e Chamativo */}
                    <div className="my-2 text-center">
                      {isDesconto ? (
                        coupon.tipo_desconto === 'porcentagem' ? (
                          <div className="flex items-baseline justify-center">
                            <span className="text-3xl sm:text-4xl font-black tracking-tighter text-amber-300 drop-shadow-xs">
                              {coupon.valor_desconto}
                            </span>
                            <span className="ml-1 text-base font-black text-amber-200 uppercase">% OFF</span>
                          </div>
                        ) : (
                          <div className="flex items-baseline justify-center">
                            <span className="text-xs font-bold text-amber-200 mr-0.5">R$</span>
                            <span className="text-2xl sm:text-3xl font-black tracking-tighter text-amber-300 drop-shadow-xs">
                              {coupon.valor_desconto}
                            </span>
                            <span className="ml-1 text-[10px] font-black text-amber-200 uppercase">OFF</span>
                          </div>
                        )
                      ) : (
                        coupon.tipo_entrega === 'frete_gratis' || coupon.tipo_entrega === 'frete_gratis_minimo' ? (
                          <div className="space-y-0.5 text-center">
                            <Truck className="h-6 w-6 text-emerald-200 mx-auto" />
                            <span className="text-lg sm:text-xl font-black uppercase tracking-tight text-white block">
                              Frete Grátis
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-0.5 text-center">
                            <span className="text-[10px] font-bold text-emerald-200 uppercase block">Frete Fixo</span>
                            <span className="text-xl font-black text-emerald-100 block">
                              {formatCurrency(coupon.taxa_fixa_entrega || 0)}
                            </span>
                          </div>
                        )
                      )}
                    </div>

                    {/* Badge do Código do Cupom com Botão de Copiar */}
                    <div 
                      onClick={(e) => copyCode(coupon.codigo_cupom, e)}
                      title="Clique para copiar código"
                      className="group/code mt-1 flex items-center gap-1.5 rounded-lg border border-dashed border-amber-300/60 bg-black/25 px-2.5 py-1 text-[11px] font-mono font-black text-amber-300 hover:bg-black/40 transition-colors"
                    >
                      <span>{coupon.codigo_cupom}</span>
                      {copiedCode === coupon.codigo_cupom ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-amber-300/70 group-hover/code:text-amber-200" />
                      )}
                    </div>
                  </div>

                  {/* LADO DIREITO DO TICKET: INFORMAÇÕES, REGRAS E BOTÃO */}
                  <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between space-y-3 bg-white">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-black text-neutral-900 group-hover:text-[#17345f] transition-colors leading-snug">
                            {coupon.nome_cupom}
                          </h4>
                          {(coupon as any).descricao ? (
                            <p className="text-xs text-neutral-500 font-medium line-clamp-2 mt-0.5">
                              {(coupon as any).descricao}
                            </p>
                          ) : (
                            <p className="text-xs text-neutral-400 font-medium mt-0.5">
                              {isDesconto ? 'Aproveite este desconto especial em seu carrinho de compras.' : 'Economize na taxa de entrega do seu pedido.'}
                            </p>
                          )}
                        </div>

                        {coupon.data_validade && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md shrink-0">
                            <Clock className="h-3 w-3 text-neutral-400" />
                            Até {formatDate(coupon.data_validade)}
                          </span>
                        )}
                      </div>

                      {/* Regras e Condições do Cupom com Design Limpo */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {minValor > 0 && (
                          <div className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black border ${
                            isMinMet
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-900 border-amber-300'
                          }`}>
                            {isMinMet ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            <span>Compra mínima de <strong>{formatCurrency(minValor)}</strong></span>
                            {faltandoParaMinimo > 0 && (
                              <span className="text-amber-700 font-medium">
                                (faltam {formatCurrency(faltandoParaMinimo)})
                              </span>
                            )}
                          </div>
                        )}

                        {coupon.produto_id && (
                          <div className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800 border border-blue-200">
                            <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />
                            <span>Válido para item específico</span>
                          </div>
                        )}

                        {coupon.limite_usos_por_cliente && Number(coupon.limite_usos_por_cliente) > 0 && (
                          <div className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600">
                            <span>Limite de {coupon.limite_usos_por_cliente} uso(s) por conta</span>
                          </div>
                        )}
                      </div>

                      {/* Barra de Progresso de Compra Mínima (se houver regra de valor mínimo) */}
                      {minValor > 0 && subtotal !== undefined && (
                        <div className="space-y-1 pt-1">
                          <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                isMinMet ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Rodapé do Card com Ação */}
                    <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                      <div className="text-[11px] text-neutral-400 font-medium">
                        {isCurrentlySelected ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Cupom pronto para finalização
                          </span>
                        ) : isMinMet ? (
                          <span className="text-emerald-700 font-bold">
                            ✓ Requisitos atendidos para uso
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold">
                            ⚠ Adicione mais itens para atingir o mínimo
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(coupon);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-black text-white transition shadow-sm cursor-pointer ${
                          isCurrentlySelected
                            ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-600/20'
                            : isMinMet
                            ? 'bg-[#17345f] hover:bg-[#102746] hover:scale-105 active:scale-95 shadow-blue-900/10'
                            : 'bg-amber-600 hover:bg-amber-700'
                        }`}
                      >
                        {isCurrentlySelected ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Aplicado</span>
                          </>
                        ) : (
                          <>
                            <span>Usar Cupom</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
