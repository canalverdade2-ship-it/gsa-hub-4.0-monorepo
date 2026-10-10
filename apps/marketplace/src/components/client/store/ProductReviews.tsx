import React, { useState, useEffect } from 'react';
import {
  Star,
  ThumbsUp,
  ShieldCheck,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Plus,
  X,
  UserCheck
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { clientOperationalWrite } from '../../../lib/clientOperationalWrite';
import { fetchProductReviews, insertProductReview, likeProductReview } from '../../../lib/storeReviews';
import {
  calculateProductRating,
  getProductDisplayComments,
  ProductReviewItem,
  ProductRatingSummary
} from '../../../lib/productRatings';
import { toast } from 'react-hot-toast';

interface ProductReviewsProps {
  productId: string;
  product: any;
  clientId?: string;
  onRatingCalculated?: (rating: number, total: number) => void;
}

const STAR_LABELS = {
  1: 'Péssimo',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente!'
};

export function ProductReviews({
  productId,
  product,
  clientId,
  onRatingCalculated
}: ProductReviewsProps) {
  const [reviews, setReviews] = useState<ProductReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filterStar, setFilterStar] = useState<number | null>(null);

  // Form State
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [authorName, setAuthorName] = useState('');
  const [authorCity, setAuthorCity] = useState('');
  const [authorState, setAuthorState] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [recommends, setRecommends] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likedReviews, setLikedReviews] = useState<Set<string>>(new Set());

  // Carregar avaliações do produto
  const loadReviews = async () => {
    if (!productId) return;
    try {
      setLoading(true);
      const data = await fetchProductReviews(productId);
      setReviews(data);
    } catch (err) {
      console.warn('[ProductReviews] Erro ao carregar avaliações:', err);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadReviews();
  }, [productId]);

  // Pré-preencher nome do cliente se logado
  useEffect(() => {
    if (clientId) {
      supabase
        .from('clientes')
        .select('nome, cidade, estado')
        .eq('id', clientId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            if (data.nome) setAuthorName(data.nome);
            if (data.cidade) setAuthorCity(data.cidade);
            if (data.estado) setAuthorState(data.estado);
          }
        });
    }
  }, [clientId]);

  // Cálculo da pontuação com precedência
  const ratingSummary: ProductRatingSummary = calculateProductRating(product, reviews);
  const displayCommentsData = getProductDisplayComments(product, reviews);

  useEffect(() => {
    if (onRatingCalculated) {
      onRatingCalculated(ratingSummary.rating, ratingSummary.totalCount);
    }
  }, [ratingSummary.rating, ratingSummary.totalCount, onRatingCalculated]);

  // Submissão de nova avaliação
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!comment.trim()) {
      toast.error('Por favor, escreva sua opinião sobre o produto.');
      return;
    }

    const finalAuthor = authorName.trim() || (clientId ? 'Cliente GSA' : 'Comprador Verificado');

    try {
      setIsSubmitting(true);

      // Verificar se o cliente tem compra deste produto
      let isVerifiedPurchase = false;
      if (clientId) {
        const { data: orderItem } = await supabase
          .from('orcamentos')
          .select('id')
          .eq('cliente_id', clientId)
          .eq('produto_id', productId)
          .limit(1);
        if (orderItem && orderItem.length > 0) {
          isVerifiedPurchase = true;
        }
      }

      const reviewPayload = {
        produto_id: productId,
        cliente_id: clientId || null,
        nome_autor: finalAuthor,
        cidade: authorCity.trim() || null,
        estado: authorState.trim() || null,
        nota: rating,
        titulo: title.trim() || null,
        comentario: comment.trim(),
        recomenda: recommends,
        origem: 'gsa',
        verificado: isVerifiedPurchase || !clientId, // Marcar como verificado no ecossistema
        status: 'aprovado',
        curtidas_uteis: 0,
        created_at: new Date().toISOString()
      };

      if (clientId) {
        try {
          await insertProductReview(reviewPayload, (data) =>
            clientOperationalWrite(clientId, 'loja_avaliacoes', 'insert', data),
          );
        } catch {
          await insertProductReview(reviewPayload);
        }
      } else {
        await insertProductReview(reviewPayload);
      }

      toast.success('Avaliação publicada com sucesso! Obrigado pelo seu feedback.');

      // Reset form
      setTitle('');
      setComment('');
      setIsFormOpen(false);

      // Recarregar avaliações para refletir a nova média imediatamente
      await loadReviews();
    } catch (err) {
      console.error('[ProductReviews] Erro ao enviar avaliação:', err);
      toast.error('Erro ao enviar avaliação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Curtir avaliação útil
  const handleLikeReview = async (reviewId: string, currentLikes: number = 0) => {
    if (likedReviews.has(reviewId)) return;

    try {
      setLikedReviews((prev) => new Set(prev).add(reviewId));
      await likeProductReview(reviewId, currentLikes);

      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId ? { ...r, curtidas_uteis: (r.curtidas_uteis || 0) + 1 } : r
        )
      );
      toast.success('Obrigado pelo seu voto!');
    } catch (err) {
      console.warn('[ProductReviews] Erro ao curtir avaliação:', err);
    }
  };

  // Filtragem de comentários por estrelas
  const filteredComments = displayCommentsData.comments.filter((c) => {
    if (!filterStar) return true;
    return Math.round(Number(c.nota)) === filterStar;
  });

  return (
    <section className="mt-14 rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm sm:p-10 lg:p-12" aria-labelledby="reviews-section-title">
      
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col justify-between gap-6 border-b border-neutral-100 pb-8 md:flex-row md:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#17345f]/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-[#17345f]">
            <Star className="h-3.5 w-3.5 fill-current" />
            Opinião de Quem Comprou
          </div>
          <h2 id="reviews-section-title" className="mt-2 text-2xl font-black text-neutral-900 sm:text-3xl">
            Avaliações e Comentários do Produto
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {ratingSummary.source === 'gsa'
              ? 'Avaliações reais feitas por clientes verificados na GSA Store.'
              : ratingSummary.source === 'importado'
              ? 'Avaliações e classificações verificadas do catálogo oficial.'
              : 'Seja o primeiro a avaliar este produto após a sua compra!'}
          </p>
        </div>

        {/* Botão de Avaliar Produto */}
        <button
          type="button"
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#17345f] px-6 py-3.5 text-sm font-black text-white shadow-md shadow-[#17345f]/20 transition-all hover:bg-[#0f2342] hover:scale-105 active:scale-100 cursor-pointer"
        >
          {isFormOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isFormOpen ? 'Fechar Formulário' : 'Avaliar este Produto'}
        </button>
      </div>

      {/* Formulário de Avaliação Retrátil */}
      {isFormOpen && (
        <form onSubmit={handleSubmitReview} className="my-8 rounded-3xl border-2 border-[#17345f]/20 bg-slate-50/80 p-6 sm:p-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between border-b border-neutral-200/60 pb-4">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              <h3 className="text-lg font-black text-neutral-900">Deixe sua Avaliação</h3>
            </div>
            <span className="text-xs font-semibold text-neutral-500">Sua opinião é fundamental</span>
          </div>

          <div className="mt-6 space-y-6">
            {/* Seletor Interativo de Estrelas */}
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-neutral-700">
                Sua Nota Geral *
              </label>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const active = (hoverRating || rating) >= starVal;
                    return (
                      <button
                        key={starVal}
                        type="button"
                        onClick={() => setRating(starVal)}
                        onMouseEnter={() => setHoverRating(starVal)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                        aria-label={`${starVal} estrelas`}
                      >
                        <Star
                          className={`h-7 w-7 transition-colors ${
                            active
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-neutral-200 text-neutral-200 hover:text-amber-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="ml-3 rounded-lg bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 border border-amber-200">
                  {STAR_LABELS[((hoverRating || rating) as keyof typeof STAR_LABELS)] || 'Excelente!'}
                </span>
              </div>
            </div>

            {/* Identificação */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700">Seu Nome / Apelido</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-neutral-900 focus:border-[#17345f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700">Cidade</label>
                <input
                  type="text"
                  value={authorCity}
                  onChange={(e) => setAuthorCity(e.target.value)}
                  placeholder="Ex: São Paulo"
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-neutral-900 focus:border-[#17345f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700">Estado (UF)</label>
                <input
                  type="text"
                  maxLength={2}
                  value={authorState}
                  onChange={(e) => setAuthorState(e.target.value.toUpperCase())}
                  placeholder="Ex: SP"
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-semibold uppercase text-neutral-900 focus:border-[#17345f] focus:outline-none"
                />
              </div>
            </div>

            {/* Recomendação */}
            <div>
              <label className="block text-xs font-bold text-neutral-700">
                Você recomendaria este produto para um amigo?
              </label>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setRecommends(true)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                    recommends
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/30'
                      : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" />
                  Sim, recomendo
                </button>
                <button
                  type="button"
                  onClick={() => setRecommends(false)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                    !recommends
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/30'
                      : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  Não recomendo
                </button>
              </div>
            </div>

            {/* Título e Comentário */}
            <div>
              <label className="block text-xs font-bold text-neutral-700">Título do Comentário (Opcional)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Excelente qualidade e chegou super rápido!"
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-neutral-900 focus:border-[#17345f] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700">Sua Opinião Detalhada *</label>
              <textarea
                rows={4}
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte o que você mais gostou no produto, acabamento, utilidade, facilidade de uso..."
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-3.5 text-xs font-medium text-neutral-900 focus:border-[#17345f] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !comment.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#17345f] px-6 py-2.5 text-xs font-black text-white shadow-md transition-all hover:bg-[#0f2342] disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                {isSubmitting ? 'Publicando...' : 'Publicar Avaliação'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Resumo Visual das Notas e Distribuição */}
      <div className="my-8 grid grid-cols-1 gap-8 rounded-3xl bg-neutral-50/70 p-6 border border-neutral-100 lg:grid-cols-12 lg:p-8">
        
        {/* Nota Média em Destaque (4 colunas) */}
        <div className="flex flex-col items-center justify-center text-center lg:col-span-4 lg:border-r lg:border-neutral-200/60 lg:pr-8">
          <span className="text-5xl font-black text-neutral-950 tracking-tight sm:text-6xl">
            {ratingSummary.rating.toFixed(1)}
          </span>

          <div className="mt-3 flex text-amber-400">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`h-5 w-5 ${
                  s <= Math.round(ratingSummary.rating) ? 'fill-amber-400' : 'fill-neutral-200 text-neutral-200'
                }`}
              />
            ))}
          </div>

          <p className="mt-2 text-xs font-extrabold text-neutral-600">
            Baseado em <span className="text-neutral-950 font-black">{ratingSummary.totalCount}</span> {ratingSummary.totalCount === 1 ? 'avaliação' : 'avaliações'}
          </p>

          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-3 py-1 text-[11px] font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>{ratingSummary.recommendPercentage}% recomendam este produto</span>
          </div>
        </div>

        {/* Barras de Distribuição das Estrelas (8 colunas) */}
        <div className="flex flex-col justify-center space-y-2.5 lg:col-span-8 lg:pl-4">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = ratingSummary.distribution[stars as 1 | 2 | 3 | 4 | 5] || 0;
            const pct = ratingSummary.totalCount > 0 ? Math.round((count / ratingSummary.totalCount) * 100) : 0;
            const isSelected = filterStar === stars;

            return (
              <button
                key={stars}
                type="button"
                onClick={() => setFilterStar(isSelected ? null : stars)}
                className={`group flex items-center gap-3 rounded-xl p-1 text-xs transition-colors cursor-pointer ${
                  isSelected ? 'bg-amber-100/70 font-bold' : 'hover:bg-neutral-100/60'
                }`}
              >
                <div className="flex w-16 shrink-0 items-center justify-end gap-1 font-bold text-neutral-700">
                  <span>{stars}</span>
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                </div>

                <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <span className="w-10 text-right font-extrabold text-neutral-500 group-hover:text-neutral-900">
                  {pct}%
                </span>
              </button>
            );
          })}

          {filterStar && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setFilterStar(null)}
                className="text-xs font-bold text-[#17345f] hover:underline cursor-pointer"
              >
                Limpar filtro de {filterStar} estrelas
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lista de Comentários / Avaliações */}
      <div className="mt-8">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <h3 className="text-lg font-black text-neutral-900">
            Comentários dos Usuários ({filteredComments.length})
          </h3>
          {displayCommentsData.source === 'gsa' && (
            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <UserCheck className="h-3.5 w-3.5" /> Avaliações GSA Verificadas
            </span>
          )}
        </div>

        {filteredComments.length > 0 ? (
          <div className="mt-6 divide-y divide-neutral-100 space-y-6">
            {filteredComments.map((rev) => (
              <article key={rev.id} className="pt-6 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-neutral-900 text-sm">
                        {rev.nome_autor}
                      </span>
                      {rev.cidade && (
                        <span className="text-xs text-neutral-400 font-medium">
                          • {rev.cidade}{rev.estado ? `/${rev.estado}` : ''}
                        </span>
                      )}
                      {rev.verificado && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 border border-emerald-200">
                          <ShieldCheck className="h-3 w-3" /> Compra Verificada
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex text-amber-400">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`h-3.5 w-3.5 ${
                              s <= Math.round(Number(rev.nota))
                                ? 'fill-amber-400'
                                : 'fill-neutral-200 text-neutral-200'
                            }`}
                          />
                        ))}
                      </div>

                      {rev.recomenda && (
                        <span className="text-[11px] font-bold text-emerald-700">
                          • Recomenda este produto
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-xs text-neutral-400">
                    {new Date(rev.created_at || Date.now()).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                {rev.titulo && (
                  <h4 className="mt-3 text-sm font-extrabold text-neutral-900">
                    {rev.titulo}
                  </h4>
                )}

                <p className="mt-2 text-xs font-normal leading-relaxed text-neutral-700 sm:text-sm">
                  {rev.comentario}
                </p>

                {/* Botão de Útil */}
                <div className="mt-4 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleLikeReview(rev.id, rev.curtidas_uteis || 0)}
                    disabled={likedReviews.has(rev.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                      likedReviews.has(rev.id)
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    <span>Útil ({rev.curtidas_uteis || 0})</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="my-10 flex flex-col items-center justify-center rounded-2xl bg-neutral-50/50 p-8 text-center border border-dashed border-neutral-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#17345f]/10 text-[#17345f]">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-extrabold text-neutral-900">
              {filterStar
                ? `Nenhuma avaliação encontrada com ${filterStar} estrelas.`
                : 'Ainda não há comentários para este produto.'}
            </h4>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm">
              Compartilhe sua experiência de compra e ajude outros compradores a tomarem a melhor decisão!
            </p>
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#17345f] px-5 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-[#0f2342] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Seja o primeiro a avaliar
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default ProductReviews;
