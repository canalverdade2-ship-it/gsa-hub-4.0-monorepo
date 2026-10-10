import React, { useState } from 'react';
import { X, Star, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { insertProductReview } from '../../../lib/storeReviews';

interface OrderReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

export function OrderReviewModal({ isOpen, onClose, order }: OrderReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error('Por favor, selecione uma nota.');
      return;
    }

    const produtoId =
      order?.produto_id ||
      order?.ordens_items?.[0]?.item_id ||
      order?.ordens_items?.[0]?.produto_id ||
      null;
    const clienteId = order?.cliente_id || null;

    if (!produtoId) {
      toast.error('Não foi possível identificar o produto deste pedido para avaliação.');
      return;
    }

    try {
      setLoading(true);

      // Evita avaliações duplicadas do mesmo cliente para o mesmo produto
      if (clienteId) {
        const { data: existing } = await supabase
          .from('loja_avaliacoes')
          .select('id')
          .eq('produto_id', produtoId)
          .eq('cliente_id', clienteId)
          .limit(1);
        if (existing && existing.length > 0) {
          toast.error('Você já avaliou este produto.');
          setLoading(false);
          return;
        }
      }

      await insertProductReview({
        produto_id: produtoId,
        cliente_id: clienteId,
        nome_autor: order?.clientes?.nome || order?.cliente_nome || 'Cliente GSA',
        nota: rating,
        comentario: comment.trim() || 'Compra avaliada pelo cliente.',
        recomenda: rating >= 4,
        origem: 'gsa',
        verificado: true,
        status: 'aprovado',
        curtidas_uteis: 0,
        created_at: new Date().toISOString(),
      });

      setLoading(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setRating(0);
        setComment('');
        onClose();
      }, 2000);
    } catch (err) {
      console.error('[OrderReviewModal] Erro ao enviar avaliação:', err);
      toast.error('Erro ao enviar avaliação. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
            onClick={!loading && !success ? onClose : undefined}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-[1001] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white shadow-2xl overflow-hidden"
          >
            {success ? (
              <div className="flex flex-col items-center justify-center p-10 text-center">
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }} 
                  className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6"
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </motion.div>
                <h3 className="text-2xl font-black text-neutral-900 mb-2">Avaliação Enviada!</h3>
                <p className="text-sm text-neutral-500">Muito obrigado pelo seu feedback. Ele nos ajuda a melhorar sempre.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-6 pb-2">
                  <h3 className="text-xl font-black text-[#17345f]">Avaliar Produto</h3>
                  <button onClick={onClose} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6 pt-2">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <div className="w-12 h-12 rounded-xl bg-white border border-neutral-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-black text-neutral-400">#PEDIDO</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900 leading-tight line-clamp-1">
                          Pedido {order?.codigo_orcamento || ''}
                        </p>
                        <p className="text-[10px] text-neutral-500 mt-1">Como foi sua experiência?</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center py-4">
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => setRating(star)}
                            className="p-1 transition-transform hover:scale-110 focus:outline-none"
                          >
                            <Star 
                              className={`w-10 h-10 transition-colors ${
                                star <= (hoverRating || rating) 
                                  ? 'fill-amber-400 text-amber-400' 
                                  : 'text-neutral-200'
                              }`} 
                            />
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-bold text-amber-600 mt-3 h-4">
                        {rating === 1 && 'Ruim'}
                        {rating === 2 && 'Poderia melhorar'}
                        {rating === 3 && 'Razoável'}
                        {rating === 4 && 'Muito bom!'}
                        {rating === 5 && 'Perfeito!'}
                      </span>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 mb-2">
                        <MessageSquare className="w-4 h-4" />
                        Deixe um comentário (opcional)
                      </label>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="O que você achou do produto e da entrega?"
                        className="w-full h-32 p-4 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#17345f] resize-none"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={loading || rating === 0}
                      className="w-full flex items-center justify-center gap-2 bg-[#17345f] text-white font-bold py-4 rounded-xl shadow-lg hover:bg-[#0c2340] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar Avaliação'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
