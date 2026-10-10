import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Package, ArrowRight, Home } from 'lucide-react';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import { useAppLocation } from '../../../routing/useAppLocation';

export function OrderSuccessPage() {
  const route = useAppLocation();
  const orderId = route.query.orderId || '0000';

  useEffect(() => {
    // Confete animation na montagem
    let interval: any = null;
    try {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        (window as any).confetti?.({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        (window as any).confetti?.({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);
    } catch (e) {}

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden text-center"
      >
        <div className="bg-[#17345f] p-8 text-white relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[#d8bd73]/20 rounded-full blur-2xl"></div>
          
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 bg-[#d8bd73] rounded-full mx-auto flex items-center justify-center shadow-lg mb-4 relative z-10"
          >
            <CheckCircle className="w-10 h-10 text-[#17345f]" />
          </motion.div>
          <h1 className="text-2xl font-black relative z-10">Pedido Confirmado!</h1>
          <p className="text-sm text-indigo-100 font-medium mt-2 relative z-10">
            Sua compra foi realizada com sucesso.
          </p>
        </div>

        <div className="p-8">
          <div className="inline-flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl mb-6">
            <Package className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Pedido #{orderId}</span>
          </div>

          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            Nossa equipe já está processando o seu pedido. Você receberá atualizações no seu e-mail e no WhatsApp cadastrado.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(routes.marketplace.root())}
              className="w-full flex items-center justify-center gap-2 bg-[#17345f] text-white py-4 rounded-xl font-bold hover:bg-[#0c2340] transition-colors"
            >
              <Home className="w-5 h-5" />
              Voltar ao Início
            </button>
            <button
              onClick={() => navigate(routes.marketplace.store.products())}
              className="w-full flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 py-4 rounded-xl font-bold hover:border-[#17345f] hover:text-[#17345f] transition-colors"
            >
              Continuar Comprando
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default OrderSuccessPage;
