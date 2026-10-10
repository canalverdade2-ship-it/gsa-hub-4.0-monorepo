import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Package,
  Heart,
  Star,
  Zap,
  Eye,
  Timer,
  Scissors,
  ShoppingBag,
  Truck,
  ShieldCheck
} from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import {
  formatProductDiscountPercentage,
  getProductDiscountAmount,
  getProductEffectivePrice,
  getProductPromotionQuantityInfo,
  hasActiveProductDiscount,
} from '../../../lib/productPricing';
import { calculateProductRating } from '../../../lib/productRatings';
import { usePixDiscount, checkPixDiscountApplies } from '../../../hooks/usePixDiscount';
import { isInWishlist, toggleWishlist } from '../../../lib/wishlistStorage';
import { toast } from 'react-hot-toast';

type ItemType = 'produto' | 'servico' | 'assinatura';

interface StoreItemCardProps {
  item: any;
  tipo: ItemType;
  onAdd: () => any;
  onClick: () => any;
  clientId?: string;
}

function getCategoryLabel(item: any): string {
  if (typeof item?.categoria === 'string') return item.categoria;
  if (typeof item?.categorias?.nome === 'string') return item.categorias.nome;
  if (typeof item?.categoria_nome === 'string') return item.categoria_nome;
  return '';
}

function getTypeLabel(tipo: ItemType): string {
  if (tipo === 'assinatura') return 'Plano';
  if (tipo === 'servico') return 'Serviço';
  return 'Produto';
}

function ItemPlaceholder({ tipo }: { tipo: ItemType }) {
  const iconClass = 'h-12 w-12 text-slate-300 sm:h-14 sm:w-14';

  if (tipo === 'assinatura') return <Calendar className={iconClass} aria-hidden="true" />;
  if (tipo === 'servico') return <Scissors className={iconClass} aria-hidden="true" />;
  return <Package className={iconClass} aria-hidden="true" />;
}

export default function StoreItemCard({ item, tipo, onAdd, onClick, clientId }: StoreItemCardProps) {
  const isProduct = tipo === 'produto';
  const isOutOfStock = isProduct && item.controle_estoque && Number(item.estoque_disponivel || 0) <= 0;
  const [favorited, setFavorited] = React.useState(() => isProduct ? isInWishlist(item?.id, clientId) : false);

  React.useEffect(() => {
    if (!isProduct || !item?.id) return;
    setFavorited(isInWishlist(item.id, clientId));
    const handleUpdate = () => {
      setFavorited(isInWishlist(item.id, clientId));
    };
    window.addEventListener('gsa-wishlist-updated', handleUpdate);
    return () => window.removeEventListener('gsa-wishlist-updated', handleUpdate);
  }, [isProduct, item?.id, clientId]);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!item?.id) return;
    const nextState = await toggleWishlist(item.id, clientId);
    setFavorited(nextState);
    toast.success(nextState ? 'Produto salvo nos seus favoritos!' : 'Removido dos favoritos.');
  };
  const isLowStock = isProduct
    && item.controle_estoque
    && Number(item.estoque_disponivel || 0) > 0
    && Number(item.estoque_disponivel || 0) <= 5;
  const hasDiscount = isProduct && hasActiveProductDiscount(item) && !isOutOfStock;
  const categoryLabel = getCategoryLabel(item);
  const pixSettings = usePixDiscount();
  const pixAtivo = checkPixDiscountApplies(item, pixSettings);
  const pixPorcentagem = pixSettings.porcentagem;
  
  const currentPrice = hasDiscount ? getProductEffectivePrice(item) : Number(item.valor || 0);
  const pixPrice = pixAtivo ? currentPrice - (currentPrice * (pixPorcentagem / 100)) : currentPrice;
  const promotionQuantity = hasDiscount ? getProductPromotionQuantityInfo(item) : null;

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (item.link_afiliado) {
        window.open(item.link_afiliado, '_blank', 'noopener,noreferrer');
      } else {
        onClick();
      }
    }
  };

  // Pontos GSA reais: R$ 1,00 gasto = 1 ponto GSA
  const pontosGanhos = Math.floor(currentPrice);

  // Parcelamento no cartão em até 10x / 12x
  const parcelasMax = currentPrice >= 60 ? 12 : 10;
  const valorParcela = (currentPrice / parcelasMax).toFixed(2).replace('.', ',');

  const ratingSummary = calculateProductRating(item);

  const renderStars = () => {
    return (
      <div className="flex items-center gap-1">
        <div className="flex text-amber-400">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`h-3 w-3 ${
                s <= Math.round(ratingSummary.rating) ? 'fill-current' : 'fill-none text-slate-300'
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] font-bold text-slate-500">
          {ratingSummary.rating.toFixed(1)} ({ratingSummary.totalCount})
        </span>
      </div>
    );
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={() => {
        if (item.link_afiliado) {
          window.open(item.link_afiliado, '_blank', 'noopener,noreferrer');
        } else {
          onClick();
        }
      }}
      onKeyDown={handleCardKeyDown}
      aria-label={`Ver detalhes de ${item.nome}`}
      className="group relative flex w-full h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all duration-300 hover:border-[#17345f]/40 hover:shadow-xl hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[#17345f] focus-visible:ring-offset-2"
    >
      {/* Container de Imagem */}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-slate-50 p-3">
        {item.imagem_url ? (
          <img
            src={item.imagem_url}
            alt={item.nome}
            loading="lazy"
            className={`h-full w-full object-contain transition duration-500 group-hover:scale-105 ${isOutOfStock ? 'opacity-50 grayscale-[30%]' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ItemPlaceholder tipo={tipo} />
          </div>
        )}
        
        {/* Favoritos Button */}
        {isProduct && (
          <button 
            type="button"
            className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full shadow-md backdrop-blur-sm transition-all z-10 cursor-pointer ${
              favorited 
                ? 'bg-white text-red-500 scale-105 hover:bg-white/90 shadow-red-500/10' 
                : 'bg-white/90 text-slate-400 hover:bg-white hover:text-red-500 hover:scale-110'
            }`}
            onClick={handleToggleFavorite}
            aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            title={favorited ? "Remover dos favoritos" : "Salvar nos favoritos"}
          >
            <Heart className={`h-4 w-4 ${favorited ? 'fill-red-500 text-red-500' : ''}`} />
          </button>
        )}

        {/* Badges do Produto Stacking */}
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-2rem)] flex-wrap gap-1.5 z-10">
          {hasDiscount && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm">
              <Timer className="h-3 w-3" />
              {formatProductDiscountPercentage(item)}
            </span>
          )}

          {isLowStock && !isOutOfStock && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 shadow-sm">
              <AlertCircle className="h-3 w-3" />
              Últimas {item.estoque_disponivel} unidades
            </span>
          )}

          {item.destaque && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#17345f] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
              <Zap className="h-3 w-3 text-[#d8bd73]" />
              Destaque
            </span>
          )}

          {isOutOfStock && (
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white/95 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-700 shadow-sm">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              Esgotado
            </span>
          )}
        </div>

        {/* Tag de Frete Grátis Mercado Livre Style */}
        {!isOutOfStock && isProduct && (
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between pointer-events-none">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-md">
              <Truck className="h-3 w-3" />
              FRETE GRÁTIS
            </span>
          </div>
        )}
      </div>

      {/* Conteúdo Informativo */}
      <div className="flex flex-1 flex-col justify-between p-4 bg-white">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              {categoryLabel || getTypeLabel(tipo)}
            </span>
            {isProduct && renderStars()}
          </div>

          <h3
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
            className="min-h-[40px] text-sm font-bold leading-snug text-slate-900 transition-colors group-hover:text-[#17345f]"
          >
            {item.nome}
          </h3>
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          {item.ocultar_valor ? (
            <div className="text-sm font-bold text-slate-700">Valor sob consulta</div>
          ) : (
            <div>
              {hasDiscount && (
                <div className="mb-0.5 flex items-center gap-2 text-xs">
                  <span className="text-slate-400 line-through text-[11px]">{formatCurrency(item.valor)}</span>
                  <span className="font-extrabold text-emerald-600 text-[11px]">
                    -{formatProductDiscountPercentage(item)}%
                  </span>
                </div>
              )}
              
              {pixAtivo && (
                <div className="mb-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 inline-block px-1.5 py-0.5 rounded border border-emerald-100">
                  Pague no Pix e ganhe {pixPorcentagem}% de desconto
                </div>
              )}
              
              <div className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl flex items-baseline gap-1">
                {formatCurrency(pixAtivo ? pixPrice : currentPrice)}
                {pixAtivo && <span className="text-xs font-bold text-emerald-600">no Pix</span>}
              </div>

              {pixAtivo && (
                <div className="text-[11px] text-slate-500 font-medium">
                  ou {formatCurrency(currentPrice)} no cartão
                </div>
              )}

              {/* Parcelamento no cartão */}
              {currentPrice > 0 && (
                <div className="mt-0.5 text-[11px] font-bold text-emerald-600">
                  em até {parcelasMax}x de R$ {valorParcela} no cartão
                </div>
              )}

              {/* Pontos GSA */}
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[#fbf6ea] px-2 py-0.5 text-[10px] font-bold text-[#a77a2c]">
                <span>+ {pontosGanhos} pontos GSA</span>
              </div>
            </div>
          )}

          {/* Botão de Ação */}
          <div className="mt-3 flex items-center gap-2">
            {isProduct ? (
              <button
                type="button"
                disabled={isOutOfStock && !item.link_afiliado}
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.link_afiliado) {
                    window.open(item.link_afiliado, '_blank', 'noopener,noreferrer');
                  } else {
                    onAdd();
                  }
                }}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#17345f] px-3 text-xs font-extrabold text-white transition-all hover:bg-[#0f2342] hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 cursor-pointer"
              >
                {item.link_afiliado ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
                {isOutOfStock ? 'Indisponível' : 'Adicionar'}
              </button>
            ) : (
              <span className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-[#17345f] px-3 text-xs font-extrabold text-white">
                Ver {tipo === 'assinatura' ? 'plano' : 'detalhes'}
              </span>
            )}

            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition group-hover:border-[#17345f] group-hover:bg-[#17345f] group-hover:text-white">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
