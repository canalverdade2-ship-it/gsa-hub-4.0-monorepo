import React, { useState, useEffect } from 'react';
import { 
  Gift, Users, Calendar, Share2, Copy, Check, Heart, Sparkles, 
  ArrowLeft, MessageCircle, Clock, ShieldCheck, QrCode, Loader2, 
  PartyPopper, ChevronRight, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { vaquinhaService, Vaquinha, VaquinhaContribuicao } from '../../../lib/vaquinhaService';
import { formatCurrency } from '../../../utils/formatters';
import { maskPhone } from '../../../lib/utils';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import { supabase } from '../../../lib/supabase';
import { useSEO } from '../../../hooks/useSEO';

interface VaquinhaPublicPageProps {
  vaquinhaIdOrCode?: string;
  clientId?: string;
  onRequireAuth?: () => void;
}

export function VaquinhaPublicPage({ vaquinhaIdOrCode }: VaquinhaPublicPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaquinha, setVaquinha] = useState<Vaquinha | null>(null);
  const [contribuicoes, setContribuicoes] = useState<VaquinhaContribuicao[]>([]);
  const [percentual, setPercentual] = useState(0);
  const [valorRestante, setValorRestante] = useState(0);
  const [metaAtingida, setMetaAtingida] = useState(false);

  // Form de contribuição
  const [customValor, setCustomValor] = useState<number | ''>('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(50);
  const [nomeContribuinte, setNomeContribuinte] = useState('');
  const [telefoneContribuinte, setTelefoneContribuinte] = useState('');
  const [mensagemContribuinte, setMensagemContribuinte] = useState('');
  
  // Estado do PIX da contribuição
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [currentPixCode, setCurrentPixCode] = useState('');
  const [currentQrCodeUrl, setCurrentQrCodeUrl] = useState('');
  const [activeContribId, setActiveContribId] = useState<string | null>(null);
  const [submittingContrib, setSubmittingContrib] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  useSEO({
    title: vaquinha ? `Vaquinha de Presente para ${vaquinha.presenteado_nome} | Grupo GSA` : 'Vaquinha de Presente | Grupo GSA',
    description: 'Contribua com o presente coletivo pelo PIX de forma rápida e segura.',
  });

  const fetchVaquinhaData = async (silent = false) => {
    if (!vaquinhaIdOrCode) return;
    if (!silent) setLoading(true);
    try {
      const res = await vaquinhaService.getVaquinha(vaquinhaIdOrCode);
      if (!res.success || !res.vaquinha) {
        throw new Error(res.error || 'Vaquinha não encontrada.');
      }
      setVaquinha(res.vaquinha);
      setContribuicoes(res.contribuicoes || []);
      setPercentual(res.percentual || 0);
      setValorRestante(res.valor_restante || 0);
      setMetaAtingida(Boolean(res.meta_atingida));
      setError(null);
    } catch (err: any) {
      console.error('[VaquinhaPublicPage] Erro:', err);
      setError(err.message || 'Erro ao carregar detalhes da vaquinha.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaquinhaData();
  }, [vaquinhaIdOrCode]);

  // Supabase Realtime Subscription para atualizar ao vivo
  useEffect(() => {
    if (!vaquinha?.id) return;

    const channel = supabase
      .channel(`vaquinha-${vaquinha.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loja_vaquinha_contribuicoes', filter: `vaquinha_id=eq.${vaquinha.id}` },
        () => {
          fetchVaquinhaData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loja_vaquinhas', filter: `id=eq.${vaquinha.id}` },
        () => {
          fetchVaquinhaData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vaquinha?.id]);

  const activeValor = selectedPreset !== null ? selectedPreset : (typeof customValor === 'number' ? customValor : 0);

  const handleStartContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaquinha) return;

    if (activeValor <= 0) {
      alert('Por favor, selecione ou digite um valor válido para contribuir.');
      return;
    }
    if (!nomeContribuinte.trim()) {
      alert('Por favor, informe o seu nome.');
      return;
    }

    setSubmittingContrib(true);
    try {
      const res = await vaquinhaService.createContribution({
        vaquinha_id: vaquinha.id,
        contribuinte_nome: nomeContribuinte,
        contribuinte_telefone: telefoneContribuinte || undefined,
        valor: activeValor,
        mensagem: mensagemContribuinte || undefined,
        codigoVaquinha: vaquinha.codigo,
      });

      if (!res.success || !res.contribution) {
        throw new Error(res.error || 'Não foi possível gerar a contribuição.');
      }

      setActiveContribId(res.contribution.id);
      setCurrentPixCode(res.pixCopiaECola || '');
      setCurrentQrCodeUrl(res.qrCodeUrl || '');
      setPixModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar o PIX da contribuição.');
    } finally {
      setSubmittingContrib(false);
    }
  };

  const handleConfirmPix = async () => {
    if (!activeContribId) return;
    setConfirmingPayment(true);
    try {
      const res = await vaquinhaService.confirmContribution(activeContribId);
      if (!res.success) {
        throw new Error(res.error || 'Erro ao validar contribuição.');
      }
      setPixModalOpen(false);
      // Limpa formulário
      setNomeContribuinte('');
      setTelefoneContribuinte('');
      setMensagemContribuinte('');
      setSelectedPreset(50);
      setCustomValor('');
      // Atualiza os dados imediatamente
      await fetchVaquinhaData(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao confirmar contribuição.');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const handleCopyPix = () => {
    if (!currentPixCode) return;
    navigator.clipboard.writeText(currentPixCode);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 3000);
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleWhatsAppShare = () => {
    if (!vaquinha) return;
    const url = vaquinhaService.getWhatsAppShareUrl(vaquinha);
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
        <p className="text-sm font-bold text-neutral-600">Carregando Vaquinha de Presente...</p>
      </div>
    );
  }

  if (error || !vaquinha) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 text-center px-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <Gift className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-neutral-900">Vaquinha não encontrada</h2>
        <p className="text-sm text-neutral-600">
          O link pode estar incorreto ou a vaquinha foi encerrada pelo organizador.
        </p>
        <button
          onClick={() => navigate(routes.marketplace.store.products())}
          className="mt-2 px-6 py-3 bg-[#17345f] text-white font-bold rounded-xl text-sm shadow-md hover:bg-[#0c2340] transition-colors"
        >
          Explorar Produtos da Loja
        </button>
      </div>
    );
  }

  const product = vaquinha.produto_snapshot;

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/50 via-neutral-50/30 to-white pb-24 pt-4 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Barra Superior de Navegação */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(routes.marketplace.store.products())}
            className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para a Loja</span>
          </button>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100/80 border border-purple-200 text-purple-800 rounded-full text-xs font-black">
            <Gift className="w-3.5 h-3.5 text-purple-600" />
            <span>Código: {vaquinha.codigo}</span>
          </span>
        </div>

        {/* Hero Card da Vaquinha */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-950 p-6 sm:p-8 text-white shadow-2xl">
          {/* Efeito decorativo de fundo */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-purple-200 border border-white/15">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Vaquinha de Presente Coletivo
              </span>

              {vaquinha.data_evento && (
                <span className="inline-flex items-center gap-1.5 text-xs text-purple-200 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-purple-300" />
                  Data do Evento: <strong>{new Date(vaquinha.data_evento).toLocaleDateString('pt-BR')}</strong>
                </span>
              )}
            </div>

            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
                Presente para <span className="text-amber-300 underline decoration-amber-400/60 decoration-wavy decoration-2">{vaquinha.presenteado_nome}</span> 🎁
              </h1>
              <p className="text-xs sm:text-sm text-purple-200 mt-2 font-medium">
                Organizado com carinho por <strong>{vaquinha.organizador_nome}</strong>
              </p>
            </div>

            {vaquinha.mensagem && (
              <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-sm text-purple-100 italic">
                "{vaquinha.mensagem}"
              </div>
            )}

            {/* Barra de Progresso Interativa */}
            <div className="p-5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs text-purple-200 uppercase tracking-wider font-bold">Total Arrecadado:</span>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                    {formatCurrency(vaquinha.valor_arrecadado)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-purple-200 uppercase tracking-wider font-bold">Meta do Presente:</span>
                  <div className="text-lg sm:text-xl font-bold text-white/90">
                    {formatCurrency(vaquinha.meta_valor)}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-4 w-full bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, percentual)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 rounded-full relative"
                />
              </div>

              <div className="flex items-center justify-between text-xs font-bold text-purple-200">
                <span>{percentual.toFixed(1)}% alcançado</span>
                <span>{contribuicoes.length} amigo(s) contribuíram</span>
              </div>
            </div>

            {metaAtingida && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200">
                <PartyPopper className="w-6 h-6 text-emerald-300 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-emerald-100">Meta Conquistada com Sucesso! 🎉</h4>
                  <p className="text-xs text-emerald-200">O valor total do presente já foi arrecadado. O pedido já pode ser emitido para entrega!</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grade de 2 Colunas: Produto + Formulário de Contribuição */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Coluna Esquerda: Produto Alvo (5 colunas) */}
          <div className="md:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl p-5 border border-neutral-200/80 shadow-xs space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-neutral-500">
                Produto Escolhido
              </h3>

              <div className="rounded-2xl overflow-hidden bg-neutral-50 border border-neutral-100 aspect-square flex items-center justify-center">
                {product?.imagem_url ? (
                  <img 
                    src={product.imagem_url} 
                    alt={product.nome} 
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" 
                  />
                ) : (
                  <Gift className="w-16 h-16 text-neutral-300" />
                )}
              </div>

              <div>
                <h4 className="text-base font-bold text-neutral-900 line-clamp-2">{product?.nome}</h4>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xs text-neutral-500">Valor de Tabela:</span>
                  <span className="text-lg font-black text-[#17345f]">{formatCurrency(product?.valor || vaquinha.meta_valor)}</span>
                </div>
              </div>

              {product?.id && (
                <button
                  onClick={() => navigate(routes.marketplace.store.product(product.id))}
                  className="w-full py-2.5 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Ver Detalhes do Produto na Loja</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Botões de Compartilhar */}
              <div className="pt-2 border-t border-neutral-100 space-y-2">
                <span className="block text-xs font-bold text-neutral-600 text-center">Compartilhe no grupo de amigos:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleWhatsAppShare}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={handleCopyShareLink}
                    className="py-2.5 px-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Caixa de Contribuição PIX (7 colunas) */}
          <div className="md:col-span-7 space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-neutral-200/80 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Heart className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-neutral-900">Contribuir com a Vaquinha</h3>
                  <p className="text-xs text-neutral-500">Escolha o valor que puder e pague no PIX em segundos</p>
                </div>
              </div>

              <form onSubmit={handleStartContribution} className="space-y-4">
                {/* Seleção de Valores Prontos */}
                <div>
                  <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-2">
                    Escolha um valor de contribuição
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[20, 50, 100, 150].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setSelectedPreset(val);
                          setCustomValor('');
                        }}
                        className={`py-3 rounded-2xl text-xs font-black transition-all border ${
                          selectedPreset === val
                            ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20 scale-[1.02]'
                            : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        R$ {val}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2.5">
                    <input 
                      type="number"
                      min="1"
                      step="any"
                      placeholder="Ou digite outro valor (ex: R$ 75,00)"
                      value={customValor}
                      inputMode="numeric"
                      onChange={(e) => {
                        const v = e.target.value === '' ? '' : Number(e.target.value);
                        setCustomValor(v);
                        setSelectedPreset(null);
                      }}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Dados do Contribuinte */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                      Seu Nome *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Como vai aparecer no mural"
                      value={nomeContribuinte}
                      onChange={(e) => setNomeContribuinte(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                      Seu WhatsApp (Opcional)
                    </label>
                    <input 
                      type="tel"
                      placeholder="(11) 99999-9999"
                      maxLength={15}
                      value={telefoneContribuinte}
                      inputMode="numeric"
                      onChange={(e) => setTelefoneContribuinte(maskPhone(e.target.value))}
                      className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Mensagem / Recado */}
                <div>
                  <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                    Deixe uma mensagem de felicitação (Opcional)
                  </label>
                  <textarea
                    placeholder={`Escreva algo especial para ${vaquinha.presenteado_nome}...`}
                    value={mensagemContribuinte}
                    onChange={(e) => setMensagemContribuinte(e.target.value)}
                    className="w-full p-3.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingContrib || activeValor <= 0}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/20 text-base flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {submittingContrib ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Gerando PIX...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-5 h-5" />
                      <span>Pagar {formatCurrency(activeValor)} no PIX</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Mural de Recados e Amigos que Contribuíram */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-neutral-900">Mural dos Amigos ({contribuicoes.length})</h3>
                <p className="text-xs text-neutral-500">Veja quem já participou desse presente especial</p>
              </div>
            </div>
          </div>

          {contribuicoes.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 space-y-2">
              <MessageCircle className="w-10 h-10 mx-auto stroke-1" />
              <p className="text-sm font-bold">Nenhuma contribuição realizada ainda.</p>
              <p className="text-xs">Seja a primeira pessoa a fazer uma contribuição e deixar um recado!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {contribuicoes.map((c) => (
                <div 
                  key={c.id} 
                  className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-neutral-900 truncate">{c.contribuinte_nome}</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md shrink-0">
                        {formatCurrency(c.valor)}
                      </span>
                    </div>

                    {c.mensagem && (
                      <p className="text-xs text-neutral-600 mt-2 italic bg-white p-2.5 rounded-xl border border-neutral-200/60 line-clamp-4">
                        "{c.mensagem}"
                      </p>
                    )}
                  </div>

                  <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Modal de Pagamento PIX */}
      <AnimatePresence>
        {pixModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1050] bg-black/60 backdrop-blur-sm"
              onClick={() => setPixModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 z-[1051] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white shadow-2xl p-6 text-center space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <span className="text-xs font-black uppercase tracking-wider text-purple-900">
                  Pagamento PIX da Vaquinha
                </span>
                <button
                  onClick={() => setPixModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <span className="text-xs text-neutral-500">Valor da sua contribuição:</span>
                <div className="text-3xl font-black text-emerald-600 mt-0.5">
                  {formatCurrency(activeValor)}
                </div>
              </div>

              {/* QR Code */}
              {currentQrCodeUrl && (
                <div className="p-3 bg-white border-2 border-dashed border-neutral-200 rounded-2xl inline-block shadow-xs">
                  <img src={currentQrCodeUrl} alt="QR Code PIX" className="w-48 h-48 mx-auto" />
                </div>
              )}

              {/* Copia e Cola */}
              <div className="space-y-2 text-left">
                <label className="text-[11px] font-bold text-neutral-600">PIX Copia e Cola:</label>
                <div className="p-2.5 bg-neutral-100 rounded-xl border border-neutral-200 text-[11px] font-mono break-all text-neutral-700 max-h-20 overflow-y-auto select-all">
                  {currentPixCode}
                </div>
                <button
                  type="button"
                  onClick={handleCopyPix}
                  className="w-full py-2.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {copiedPix ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedPix ? 'Código PIX Copiado!' : 'Copiar Código PIX'}</span>
                </button>
              </div>

              {/* Botão de Confirmação */}
              <div className="pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={handleConfirmPix}
                  disabled={confirmingPayment}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-black shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {confirmingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Confirmando Contribuição...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 stroke-[3]" />
                      <span>Já Paguei / Confirmar Contribuição</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const X = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default VaquinhaPublicPage;
