import React, { useState } from 'react';
import { X, Users, Gift, Loader2, Calendar, Phone, User, Share2, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { vaquinhaService, Vaquinha } from '../../../lib/vaquinhaService';
import { formatCurrency } from '../../../utils/formatters';
import { maskPhone } from '../../../lib/utils';
import { getProductEffectivePrice } from '../../../lib/productPricing';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';

interface GroupBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: any;
  productUrl: string;
}

export function GroupBuyModal({ isOpen, onClose, product, productUrl }: GroupBuyModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const productPrice = product ? getProductEffectivePrice(product) : 0;

  const [formData, setFormData] = useState({
    organizadorNome: '',
    organizadorTelefone: '',
    nomePresenteado: '',
    dataEvento: '',
    mensagem: '',
  });

  const [createdVaquinha, setCreatedVaquinha] = useState<Vaquinha | null>(null);
  const [linkGerado, setLinkGerado] = useState('');

  if (!isOpen || !product) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await vaquinhaService.createVaquinha({
        produto_id: product.id,
        produto_snapshot: {
          id: product.id,
          nome: product.nome,
          imagem_url: product.imagem_url || '',
          valor: product.valor,
          valor_promocional: product.valor_promocional,
          categoria: product.loja_categoria?.nome || product.categoria || '',
        },
        organizador_nome: formData.organizadorNome.trim(),
        organizador_telefone: formData.organizadorTelefone.trim(),
        presenteado_nome: formData.nomePresenteado.trim(),
        data_evento: formData.dataEvento || undefined,
        mensagem: formData.mensagem.trim() || undefined,
        meta_valor: productPrice,
      });

      if (!res.success || !res.vaquinha) {
        throw new Error(res.error || 'Não foi possível criar a vaquinha.');
      }

      const vaquinha = res.vaquinha;
      setCreatedVaquinha(vaquinha);
      
      const fullLink = `${window.location.origin}/marketplace/loja/vaquinha/${vaquinha.codigo}`;
      setLinkGerado(fullLink);
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ocorreu um erro ao criar a vaquinha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleWhatsAppShare = () => {
    if (!createdVaquinha) return;
    const shareUrl = vaquinhaService.getWhatsAppShareUrl(createdVaquinha);
    window.open(shareUrl, '_blank');
  };

  const handleGoToVaquinha = () => {
    if (!createdVaquinha) return;
    onClose();
    navigate(`/marketplace/loja/vaquinha/${createdVaquinha.codigo}`);
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
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-[1001] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 p-6 text-white relative shrink-0">
              <button 
                onClick={onClose} 
                className="absolute top-4 right-4 rounded-full p-2 text-white/80 hover:bg-white/10 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs">
                  <Gift className="h-6 w-6 text-purple-200" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight">Fazer Vaquinha de Presente</h3>
                  <p className="text-purple-200 text-xs font-medium">Junte os amigos e divida o valor com PIX automático</p>
                </div>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {step === 1 ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Resumo do Produto */}
                  <div className="flex items-center gap-3 p-3.5 bg-purple-50/60 rounded-2xl border border-purple-100 mb-2">
                    <img 
                      src={product.imagem_url} 
                      alt={product.nome} 
                      className="w-16 h-16 object-cover rounded-xl bg-white shadow-xs border border-purple-200/50" 
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-neutral-900 line-clamp-2">{product.nome}</p>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-xs text-neutral-500 font-medium">Meta do presente:</span>
                        <span className="text-sm font-black text-purple-900">{formatCurrency(productPrice)}</span>
                      </div>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold">
                      {errorMessage}
                    </div>
                  )}

                  {/* Dados do Presenteado */}
                  <div>
                    <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                      Quem vai receber o presente? *
                    </label>
                    <div className="relative">
                      <Gift className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                      <input 
                        type="text" 
                        required
                        value={formData.nomePresenteado}
                        onChange={e => setFormData({ ...formData, nomePresenteado: e.target.value })}
                        placeholder="Ex: Carlos Oliveira, Mãe, Letícia..." 
                        className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Dados do Organizador */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                        Seu Nome (Organizador) *
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                        <input 
                          type="text" 
                          required
                          value={formData.organizadorNome}
                          onChange={e => setFormData({ ...formData, organizadorNome: e.target.value })}
                          placeholder="Seu nome completo" 
                          className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                        Seu WhatsApp *
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                        <input  
                          type="tel" 
                          required
                          maxLength={15}
                          value={formData.organizadorTelefone}
                          inputMode="numeric"
onChange={(e) => setFormData({ ...formData, organizadorTelefone: maskPhone(e.target.value) })}
                          placeholder="(11) 99999-9999" 
                          className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Data do Evento */}
                  <div>
                    <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                      Data da surpresa / evento (Opcional)
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                      <input 
                        type="date" 
                        value={formData.dataEvento}
                        onChange={e => setFormData({ ...formData, dataEvento: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Mensagem para o grupo */}
                  <div>
                    <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1">
                      Recado para a galera *
                    </label>
                    <textarea 
                      required
                      value={formData.mensagem}
                      onChange={e => setFormData({ ...formData, mensagem: e.target.value })}
                      placeholder="Ex: Galera, vamos nos juntar para dar esse super presente de aniversário! Cada um contribui com o valor que puder no PIX..." 
                      className="w-full p-3.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-22"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg hover:shadow-purple-500/25 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Criando Vaquinha no Sistema...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 text-purple-200" />
                        <span>Criar Vaquinha & Gerar Link</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3 shadow-inner">
                    <Check className="w-8 h-8 stroke-[3]" />
                  </div>
                  <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-black mb-2">
                    Código: {createdVaquinha?.codigo}
                  </span>
                  <h4 className="text-2xl font-black text-neutral-900 mb-1">Vaquinha Criada com Sucesso!</h4>
                  <p className="text-xs text-neutral-600 mb-6 max-w-sm">
                    Agora é só enviar o link para o grupo. Cada amigo escolhe o valor e paga pelo próprio PIX direto no celular.
                  </p>
                  
                  {/* Link Container */}
                  <div className="w-full p-3 bg-neutral-50 rounded-2xl border border-neutral-200 mb-4 flex items-center justify-between gap-2 text-left">
                    <span className="text-xs font-mono text-neutral-700 truncate select-all">{linkGerado}</span>
                    <button 
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs font-bold text-neutral-700 hover:bg-neutral-100 flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>

                  <div className="w-full space-y-2.5">
                    {/* Botão Compartilhar no WhatsApp */}
                    <button 
                      onClick={handleWhatsAppShare}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Compartilhar no WhatsApp</span>
                    </button>

                    {/* Botão Ver Página da Vaquinha */}
                    <button 
                      onClick={handleGoToVaquinha}
                      className="w-full flex items-center justify-center gap-2 bg-[#17345f] hover:bg-[#0c2340] text-white font-bold py-3.5 rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Acessar Página da Vaquinha</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
export default GroupBuyModal;
