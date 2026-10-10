import { useEffect, useState } from 'react';
import { copyToClipboard } from '../../../../lib/utils';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Shield, CheckCircle2, Calendar, Share2, Heart, MessageCircle, Send, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { notificationService } from '../../../../lib/notificationService';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface ClassifiedDetailPageProps {
  slug: string;
  onBack: () => void;
  clientId?: string;
}

export function ClassifiedDetailPage({ slug, onBack, clientId }: ClassifiedDetailPageProps) {
  const [ad, setAd] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalAmount, setProposalAmount] = useState('');
  const [proposalMessage, setProposalMessage] = useState('');
  const [submittingProposal, setSubmittingProposal] = useState(false);

  useEffect(() => {
    void fetchAdDetails();
  }, [slug]);

  const fetchAdDetails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classificados_anuncios')
        .select(`
          *,
          classificados_midias(url, tipo, ordem)
        `)
        .eq('slug', slug)
        .single();

      if (error) throw error;

      if (data && data.classificados_midias) {
        data.classificados_midias.sort((a: any, b: any) => a.ordem - b.ordem);
      }

      setAd(data);
      setProposalAmount(data?.preco ? String(data.preco) : '');
    } catch (error) {
      console.error('Erro ao buscar detalhes do anúncio:', error);
      setAd(null);
    } finally {
      setLoading(false);
    }
  };

  const openProposal = () => {
    if (!clientId) {
      const returnTo = encodeURIComponent(routes.marketplace.classifieds.geralItem(slug));
      navigate(`${routes.login.personal()}?returnTo=${returnTo}`);
      return;
    }
    setShowProposalForm(true);
  };

  const submitProposal = async () => {
    if (!clientId || !ad || submittingProposal) return;

    const amount = Number(String(proposalAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe um valor válido para a proposta.');
      return;
    }

    const message = proposalMessage.trim();
    if (message.length < 10) {
      toast.error('Descreva sua proposta com pelo menos 10 caracteres.');
      return;
    }

    setSubmittingProposal(true);
    try {
      const advertisedPrice = Number(ad.preco || 0);
      const formattedAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
      const { data: proposal, error: proposalError } = await supabase.rpc('rpc_criar_proposta_classificado', {
        p_anuncio_id: ad.id,
        p_comprador_id: clientId,
        p_valor_proposta: amount,
        p_mensagem: message,
      });

      if (proposalError || !proposal?.success || !proposal?.id) {
        throw new Error(proposalError?.message || 'A proposta não pôde ser registrada.');
      }

      await notificationService.notifyAdmin(
        '💬 Nova proposta nos Classificados',
        `Um cliente enviou uma proposta de ${formattedAmount} para o anúncio “${ad.titulo}”.`,
        'classificados',
        'propostas',
        {
          itemId: proposal.id,
          tab: 'propostas',
          prioridade: 'alta',
          contexto: {
            anuncio_id: ad.id,
            anuncio_slug: slug,
            valor_anunciado: advertisedPrice,
            valor_proposto: amount,
          },
        },
      );

      toast.success('Proposta registrada nos Classificados GSA.');
      setShowProposalForm(false);
      navigate(routes.marketplace.classifieds.negociacoes());
    } catch (error: any) {
      console.error('Erro ao enviar proposta dos Classificados:', error);
      toast.error(error?.message || 'Não foi possível enviar a proposta.');
    } finally {
      setSubmittingProposal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#1a1a1a] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!ad) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-4">Anúncio não encontrado</h2>
        <button onClick={onBack} className="text-neutral-500 hover:text-black">Voltar</button>
      </div>
    );
  }

  const isOwner = clientId === ad.cliente_id;
  const coverImage = ad.classificados_midias?.find((media: any) => media.tipo === 'image')?.url;
  const gallery = ad.classificados_midias?.filter((media: any) => media.tipo === 'image') || [];

  return (
    <div className="bg-[#FAF9F6] min-h-screen pb-24">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#FAF9F6]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar aos Classificados</span>
          </button>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                void copyToClipboard(window.location.href);
                toast.success('Link do anúncio copiado.');
              }}
              className="h-10 w-10 rounded-full border border-black/10 flex items-center justify-center text-neutral-500 hover:bg-white transition-colors"
              aria-label="Copiar link do anúncio"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toast.success('Anúncio salvo para consulta nesta sessão.')}
              className="h-10 w-10 rounded-full border border-black/10 flex items-center justify-center text-neutral-500 hover:bg-white hover:text-red-500 transition-colors"
              aria-label="Salvar anúncio"
            >
              <Heart className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-5 pt-8">
        <div className="grid lg:grid-cols-[1fr_400px] gap-10">
          <div>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-full">
                {ad.categoria}
              </span>
              <span className="text-sm font-medium text-neutral-500 flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Publicado em {new Date(ad.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>

            <h1 className="text-3xl md:text-5xl font-black text-[#1a1a1a] tracking-tight leading-tight mb-4">
              {ad.titulo}
            </h1>

            <div className="flex items-center gap-2 text-neutral-500 font-medium mb-8">
              <MapPin className="h-5 w-5" />
              {ad.bairro ? `${ad.bairro}, ` : ''}{ad.cidade} - {ad.estado}
            </div>

            <div className="rounded-3xl overflow-hidden bg-neutral-200 aspect-[4/3] md:aspect-[16/9] mb-4">
              {coverImage ? (
                <img src={coverImage} alt={ad.titulo} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-neutral-400 font-bold">Sem imagem</span>
                </div>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
                {gallery.map((media: any, index: number) => (
                  <button key={media.url || index} type="button" className="shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 border-transparent focus:border-black transition-all">
                    <img src={media.url} alt={`Galeria ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-12">
              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-6">Descrição</h3>
              <div className="prose prose-neutral max-w-none text-neutral-600 whitespace-pre-wrap">
                {ad.descricao}
              </div>
            </div>

            {Object.keys(ad.detalhes || {}).length > 0 && (
              <div className="mt-12">
                <h3 className="text-2xl font-bold text-[#1a1a1a] mb-6">Características</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(ad.detalhes).map(([key, value]) => (
                    <div key={key} className="bg-white p-4 rounded-2xl border border-black/5">
                      <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">{key}</div>
                      <div className="text-base font-bold text-neutral-900">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="sticky top-24 space-y-6">
              <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-xl shadow-black/[0.02]">
                <div className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-2">Valor da Oportunidade</div>
                <div className="text-4xl font-black text-[#1a1a1a] mb-8">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.preco)}
                </div>

                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => navigate(routes.marketplace.classifieds.editarAnuncio(ad.id))}
                    className="w-full py-4 bg-neutral-100 text-neutral-700 font-bold rounded-full hover:bg-neutral-200 transition-colors"
                  >
                    Gerenciar meu anúncio
                  </button>
                ) : showProposalForm && clientId ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black text-neutral-900">Enviar proposta</p>
                        <p className="text-xs text-neutral-400">A GSA fará a mediação da negociação.</p>
                      </div>
                      <button type="button" onClick={() => setShowProposalForm(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar proposta">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <label className="block text-xs font-black uppercase tracking-wider text-neutral-500">
                      Valor proposto
                      <input 
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={proposalAmount}
                        inputMode="numeric" onChange={(event) => setProposalAmount(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base font-bold text-neutral-900 outline-none focus:border-neutral-500"
                      />
                    </label>

                    <label className="block text-xs font-black uppercase tracking-wider text-neutral-500">
                      Mensagem
                      <textarea
                        value={proposalMessage}
                        onChange={(event) => setProposalMessage(event.target.value)}
                        rows={4}
                        maxLength={1500}
                        placeholder="Informe condições, prazo e observações importantes."
                        className="mt-2 w-full resize-none rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium normal-case text-neutral-900 outline-none focus:border-neutral-500"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={submittingProposal}
                      onClick={() => void submitProposal()}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-black py-4 font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send className="h-5 w-5" /> {submittingProposal ? 'Enviando...' : 'Confirmar proposta'}
                    </button>
                  </motion.div>
                ) : (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={openProposal}
                      className="w-full py-4 bg-black text-white font-black uppercase tracking-wider rounded-full hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="h-5 w-5" /> Enviar Proposta
                    </button>
                    <p className="text-xs text-center text-neutral-400 font-medium px-4">
                      Sua proposta será registrada na negociação protegida dos Classificados e acompanhada pela GSA.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-br from-[#1a1a1a] to-[#2d2411] rounded-3xl p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#e8a838]/20 blur-3xl rounded-full" />

                <div className="flex items-center gap-3 mb-6 relative z-10">
                  <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-[#e8a838]" />
                  </div>
                  <h4 className="font-bold text-lg">Garantia GSA</h4>
                </div>

                <ul className="space-y-4 relative z-10">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#e8a838] shrink-0" />
                    <span className="text-sm text-white/80 leading-snug">Vendedor e anúncio verificados pela nossa equipe.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#e8a838] shrink-0" />
                    <span className="text-sm text-white/80 leading-snug">Sem contato direto, protegendo seus dados pessoais.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#e8a838] shrink-0" />
                    <span className="text-sm text-white/80 leading-snug">O pagamento principal vai direto para o vendedor, sem taxas ocultas na compra.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
