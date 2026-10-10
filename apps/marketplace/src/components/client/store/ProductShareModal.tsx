import React from 'react';
import { X, Copy, Check, Smartphone, Instagram, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProductShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: any;
  productUrl: string;
}

export function ProductShareModal({ isOpen, onClose, product, productUrl }: ProductShareModalProps) {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(productUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar link', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Confira ${product.nome} na GSA`,
          text: `Olha só o que eu encontrei na GSA E-commerce: ${product.nome}`,
          url: productUrl,
        });
        onClose();
      } catch (err) {
        console.error('Falha no share nativo', err);
      }
    } else {
      handleCopy();
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Olha só o que eu encontrei na GSA E-commerce:\n\n*${product.nome}*\n\n${productUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
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
            className="fixed left-1/2 top-1/2 z-[1001] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-[#17345f]">Compartilhar</h3>
              <button onClick={onClose} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col items-center mb-8">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-neutral-100 border-2 border-neutral-200 mb-4 shadow-sm">
                {product.imagem_url ? (
                  <img src={product.imagem_url} alt={product.nome} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-400">
                    <Share2 className="w-8 h-8 opacity-20" />
                  </div>
                )}
              </div>
              <p className="text-center text-sm font-bold text-neutral-800 px-4 line-clamp-2">
                {product.nome}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {navigator.share && (
                <button 
                  onClick={handleNativeShare}
                  className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition-colors border border-neutral-200"
                >
                  <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold text-neutral-700">Mais Opções</span>
                </button>
              )}
              
              <button 
                onClick={handleWhatsAppShare}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition-colors border border-neutral-200"
              >
                <div className="h-10 w-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                  </svg>
                </div>
                <span className="text-xs font-bold text-neutral-700">WhatsApp</span>
              </button>

              <button 
                onClick={() => {
                  window.open(`https://www.instagram.com/`, '_blank');
                }}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition-colors border border-neutral-200"
              >
                <div className="h-10 w-10 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center">
                  <Instagram className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-neutral-700">Instagram</span>
              </button>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-neutral-100 border border-neutral-200">
                <input 
                  type="text" 
                  readOnly 
                  value={productUrl} 
                  className="flex-1 bg-transparent text-sm text-neutral-600 outline-none px-2 truncate"
                />
                <button 
                  onClick={handleCopy}
                  className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg font-bold text-sm text-[#17345f] border border-neutral-200 hover:bg-neutral-50 transition-colors shadow-sm"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-500" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>
            
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
