import React from 'react';
import { X, Gift, Copy, CheckCircle2, ArrowRight } from 'lucide-react';
import { useState } from 'react';

interface VolteEganheModalProps {
  isOpen: boolean;
  onClose: () => void;
  couponCode?: string;
  discountMessage?: string;
  onApplyCoupon?: () => void;
}

export function VolteEganheModal({
  isOpen,
  onClose,
  couponCode = 'VOLTE10',
  discountMessage = 'Você ganhou 10% de desconto para finalizar sua compra!',
  onApplyCoupon
}: VolteEganheModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(couponCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header Decorativo */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_white_0%,_transparent_100%)]" />
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md shadow-inner border border-white/30">
            <Gift className="h-8 w-8 text-white" />
          </div>
          
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Sentimos sua falta!</h2>
          <p className="text-indigo-100 text-sm font-medium leading-relaxed">
            {discountMessage}
          </p>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <p className="text-sm text-neutral-500 mb-4 font-medium">Use o cupom abaixo no carrinho:</p>
          
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="relative group flex-1">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-[#d8bd73] rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
              <div className="relative flex items-center justify-between bg-neutral-50 border-2 border-dashed border-indigo-200 rounded-xl p-4">
                <span className="text-2xl font-black tracking-widest text-indigo-900 ml-4">{couponCode}</span>
                <button 
                  onClick={handleCopy}
                  className="flex items-center justify-center h-10 w-10 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors"
                >
                  {copied ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => {
                if(onApplyCoupon) onApplyCoupon();
                onClose();
              }}
              className="w-full rounded-xl bg-[#17345f] px-6 py-4 text-sm font-bold text-white shadow-lg hover:bg-[#0c2340] hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              Aproveitar Desconto <ArrowRight className="h-4 w-4" />
            </button>
            <button 
              onClick={onClose}
              className="w-full rounded-xl px-6 py-3 text-sm font-bold text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              Agora não
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}
