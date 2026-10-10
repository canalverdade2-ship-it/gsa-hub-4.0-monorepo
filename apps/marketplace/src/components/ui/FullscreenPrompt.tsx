import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize } from 'lucide-react';

export function FullscreenPrompt() {
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);

  useEffect(() => {
    // Verifica se está no celular e se já não está em tela cheia/PWA
    const isMobile = window.innerWidth <= 768;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && (window.navigator as any).standalone);
    const isFullscreen = !!document.fullscreenElement;
    const hasSeenPrompt = sessionStorage.getItem('fullscreenPromptSeen');

    if (isMobile && !isStandalone && !isFullscreen && !hasSeenPrompt) {
      const t = setTimeout(() => setShowFullscreenPrompt(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleFullscreenAccept = async () => {
    try {
      await document.documentElement.requestFullscreen();
      sessionStorage.setItem('fullscreenPromptSeen', 'true');
      setShowFullscreenPrompt(false);
    } catch (err) {
      console.error('Failed to enter fullscreen', err);
      setShowFullscreenPrompt(false);
    }
  };

  const handleFullscreenDecline = () => {
    sessionStorage.setItem('fullscreenPromptSeen', 'true');
    setShowFullscreenPrompt(false);
  };

  return (
    <AnimatePresence>
      {showFullscreenPrompt && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[9999] bg-white rounded-t-3xl p-6 pb-8 lg:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-1.5 bg-neutral-200 rounded-full mb-6" />
            <div className="w-16 h-16 bg-[#142030]/5 text-[#142030] rounded-full flex items-center justify-center mb-5 shrink-0">
              <Maximize className="w-8 h-8" />
            </div>
            <h3 className="text-[22px] font-bold tracking-tight text-[#142030] mb-3">
              Tela Cheia Recomendada
            </h3>
            <p className="text-[15px] text-[#142030]/70 mb-8 leading-relaxed max-w-[280px]">
              Deseja utilizar o sistema em modo de tela cheia para uma melhor navegação pelo seu celular?
            </p>
            
            <div className="flex flex-col sm:flex-row w-full gap-3">
              <button
                onClick={handleFullscreenAccept}
                className="w-full flex items-center justify-center h-14 rounded-2xl font-bold text-white bg-[#142030] hover:bg-[#1a2a3a] shadow-lg shadow-[#142030]/20 active:scale-95 transition-all text-[15px]"
              >
                Sim, ativar Tela Cheia
              </button>
              <button
                onClick={handleFullscreenDecline}
                className="w-full flex items-center justify-center h-14 rounded-2xl font-bold text-[#142030] bg-[#142030]/5 hover:bg-[#142030]/10 active:scale-95 transition-all text-[15px]"
              >
                Não, navegar normal
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
