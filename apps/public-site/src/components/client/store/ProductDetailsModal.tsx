import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Package,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  Truck,
  MessageSquare,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { clientOperationalWrite } from '../../../lib/clientOperationalWrite';
import { notificationService } from '../../../lib/notificationService';
import { getProductDisplayCode } from '../../../lib/productIdentification';
import { formatCurrency } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import { mapColumnsToGallery } from '../ClientGSAStore';
import {
  formatProductDiscountPercentage,
  getProductDiscountAmount,
  getProductEffectivePrice,
  getProductRemainingDaysText,
  getProductRemainingQuantityText,
  hasActiveProductDiscount,
} from '../../../lib/productPricing';

type ItemType = 'produto' | 'servico' | 'assinatura';

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  tipo: ItemType;
  onAdd: () => void;
  clientId?: string;
  onRequireAuth?: () => void;
}

function getTypeLabel(tipo: ItemType) {
  if (tipo === 'assinatura') return 'Plano e assinatura';
  if (tipo === 'servico') return 'Serviço';
  return 'Produto';
}

function getCategoryLabel(item: any): string {
  if (typeof item?.categoria === 'string') return item.categoria;
  if (typeof item?.categorias?.nome === 'string') return item.categorias.nome;
  if (typeof item?.categoria_nome === 'string') return item.categoria_nome;
  return '';
}

function Placeholder({ tipo }: { tipo: ItemType }) {
  const className = 'h-20 w-20 text-slate-300';
  if (tipo === 'assinatura') return <Calendar className={className} aria-hidden="true" />;
  if (tipo === 'servico') return <Scissors className={className} aria-hidden="true" />;
  return <Package className={className} aria-hidden="true" />;
}

export default function ProductDetailsModal({ isOpen, onClose, item, tipo, onAdd, clientId, onRequireAuth }: ProductDetailsModalProps) {
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [isRequestingTicket, setIsRequestingTicket] = useState(false);
  const images = useMemo(() => mapColumnsToGallery(item), [item]);

  useEffect(() => {
    setActiveImageIdx(0);
  }, [item?.id]);

  const handleRequestOutOfStockProduct = async () => {
    if (!item) return;

    if (!clientId) {
      toast.error('Você precisa estar logado para solicitar este produto.');
      if (onRequireAuth) onRequireAuth();
      return;
    }

    if (isRequestingTicket) return;
    setIsRequestingTicket(true);

    try {
      const ticket = await clientOperationalWrite<{ id: string }>(clientId, 'tickets', 'insert', {
        cliente_id: clientId,
        assunto: `Solicitação de produto esgotado: ${item.nome}`,
        categoria: 'Dúvidas/Solicitações',
        descricao: `Solicitação automática de aviso/reposição para o produto esgotado: "${item.nome}" (Código: ${item.codigo_produto || item.id}).`,
        prioridade: 'normal',
        modulo: 'cliente',
        status: 'aberto'
      });

      await notificationService.notifyAdmin(
        '🎟️ Solicitação de Produto Esgotado',
        `Cliente solicitou o produto esgotado: "${item.nome}"`,
        'suporte',
        'ticket_aberto_cliente',
        { itemId: ticket.id, tab: 'abertos' }
      );

      await notificationService.notifyClient(
        clientId,
        'Solicitação Registrada! 💬',
        `Seu chamando para o produto "${item.nome}" foi registrado com sucesso. Avisaremos assim que o estoque for reposto.`,
        'suporte',
        'ticket_aberto',
        { itemId: ticket.id }
      );

      toast.success(`Ticket aberto com sucesso! Registramos sua solicitação para "${item.nome}".`);
    } catch (error: any) {
      console.error('Erro ao abrir ticket de solicitação:', error);
      toast.error('Erro ao abrir ticket de solicitação. Tente novamente em instantes.');
    } finally {
      setIsRequestingTicket(false);
    }
  };

  if (!isOpen || !item) return null;

  const category = getCategoryLabel(item);
  const isProduct = tipo === 'produto';
  const outOfStock = isProduct && item.controle_estoque && Number(item.estoque_disponivel || 0) <= 0;
  const lowStock = isProduct && item.controle_estoque && Number(item.estoque_disponivel || 0) > 0 && Number(item.estoque_disponivel || 0) <= 5;
  const discount = isProduct && hasActiveProductDiscount(item);
  const currentPrice = discount ? getProductEffectivePrice(item) : Number(item.valor || 0);
  const remainingDays = discount ? getProductRemainingDaysText(item) : null;
  const remainingQuantity = discount ? getProductRemainingQuantityText(item) : null;
  const reference = tipo === 'produto'
    ? getProductDisplayCode(item)
    : tipo === 'servico'
      ? item.codigo_servico
      : item.codigo_assinatura;

  const goToPreviousImage = () => {
    setActiveImageIdx((current) => (current > 0 ? current - 1 : images.length - 1));
  };

  const goToNextImage = () => {
    setActiveImageIdx((current) => (current < images.length - 1 ? current + 1 : 0));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes" size="wide">
      <div className="grid gap-7 md:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] md:gap-9">
        <section aria-label="Galeria do item" className="min-w-0">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[20px] border border-slate-200 bg-[#f5f6f8] md:aspect-[4/3]">
            {images.length > 0 ? (
              <img
                src={images[activeImageIdx]}
                alt={`${item.nome} — imagem ${activeImageIdx + 1} de ${images.length}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <Placeholder tipo={tipo} />
            )}

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goToPreviousImage}
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition hover:bg-white"
                  aria-label="Imagem anterior"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={goToNextImage}
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition hover:bg-white"
                  aria-label="Próxima imagem"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
                <span className="absolute bottom-3 right-3 rounded-lg bg-slate-950/75 px-2.5 py-1 text-xs font-bold text-white">
                  {activeImageIdx + 1}/{images.length}
                </span>
              </>
            )}
          </div>

          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((url: string, index: number) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={() => setActiveImageIdx(index)}
                  aria-label={`Exibir imagem ${index + 1}`}
                  aria-pressed={activeImageIdx === index}
                  className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white transition ${
                    activeImageIdx === index
                      ? 'border-[#17345f] ring-2 ring-[#17345f]/10'
                      : 'border-slate-200 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.1em]">
            <span className="rounded-md bg-[#edf2f7] px-2.5 py-1.5 text-[#17345f]">{getTypeLabel(tipo)}</span>
            {category && <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500">{category}</span>}
            {reference && <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500">Ref. {reference}</span>}
            {discount && !outOfStock && (
              <span className="rounded-md bg-[#9b742f] px-2.5 py-1.5 text-white">{formatProductDiscountPercentage(item)}</span>
            )}
          </div>

          <h1 className="mt-4 text-2xl font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-3xl lg:text-[38px]">
            {item.nome}
          </h1>

          <div className="mt-5 border-y border-slate-100 py-5">
            {item.ocultar_valor ? (
              <p className="text-lg font-extrabold text-slate-700">Valor sob consulta</p>
            ) : (
              <>
                {discount && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-400 line-through">{formatCurrency(item.valor)}</span>
                    <span className="font-bold text-emerald-700">Economia de {formatCurrency(getProductDiscountAmount(item))}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-[34px] font-black leading-none tracking-[-0.045em] text-[#17345f] sm:text-[42px]">
                    {formatCurrency(currentPrice)}
                  </span>
                  {tipo === 'assinatura' && <span className="pb-1 text-sm font-semibold text-slate-500">por mês</span>}
                </div>
              </>
            )}

            {(remainingDays || remainingQuantity) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                {remainingDays && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-800">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {remainingDays}
                  </span>
                )}
                {remainingQuantity && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-800">
                    <Package className="h-3.5 w-3.5" aria-hidden="true" />
                    {remainingQuantity}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mt-5">
            <h2 className="text-sm font-extrabold text-slate-950">Sobre este item</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {item.descricao || 'As informações detalhadas deste item serão disponibilizadas pela equipe GSA.'}
            </p>
          </div>

          {isProduct && item.controle_estoque && (
            <div className={`mt-6 flex items-center gap-2 rounded-xl border px-3.5 py-3 text-xs font-bold ${
              outOfStock
                ? 'border-red-200 bg-red-50 text-red-700'
                : lowStock
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}>
              {outOfStock ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>
                {outOfStock
                  ? 'Produto temporariamente esgotado'
                  : lowStock
                    ? `Restam ${item.estoque_disponivel} unidades`
                    : `${item.estoque_disponivel} unidades disponíveis`}
              </span>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500 border-t border-slate-100 pt-3">
            <span>Compra protegida</span>
            <span>Entrega acompanhada</span>
          </div>


          <div className="mt-6 bg-white pb-4 pt-2 md:sticky md:bottom-0 md:mt-auto md:pb-6 md:pt-6">
            <button
              type="button"
              disabled={outOfStock && !(item as any).link_afiliado}
              onClick={() => {
                if ((item as any).link_afiliado) {
                  window.open((item as any).link_afiliado, '_blank', 'noopener,noreferrer');
                } else {
                  onAdd();
                }
              }}
              className="inline-flex min-h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-[#17345f] px-5 py-4 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(23,52,95,0.18)] transition hover:bg-[#102746] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
            >
              {(item as any).link_afiliado ? <ArrowRight className="h-5 w-5" aria-hidden="true" /> : <ShoppingBag className="h-5 w-5" aria-hidden="true" />}
              {(item as any).link_afiliado ? 'Comprar no Parceiro' : (outOfStock ? 'Produto indisponível' : tipo === 'assinatura' ? 'Escolher período' : 'Adicionar ao carrinho')}
            </button>

            {outOfStock && !(item as any).link_afiliado && (
              <button
                type="button"
                disabled={isRequestingTicket}
                onClick={handleRequestOutOfStockProduct}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-600 bg-indigo-50 px-5 py-3.5 text-sm font-extrabold text-indigo-700 shadow-sm transition hover:bg-indigo-100 active:scale-[0.98] disabled:opacity-50"
              >
                {isRequestingTicket ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-700" />
                ) : (
                  <MessageSquare className="h-4.5 w-4.5 text-indigo-600" />
                )}
                <span>{isRequestingTicket ? 'Abrindo ticket...' : 'Solicitar este produto'}</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
