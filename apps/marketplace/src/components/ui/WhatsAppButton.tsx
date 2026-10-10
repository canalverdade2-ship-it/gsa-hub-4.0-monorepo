import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAppLocation } from '../../routing/useAppLocation';

// Helper global para sinalizar ao botão quando modais críticos estão abertos
export function notifyWhatsAppModal(open: boolean) {
  window.dispatchEvent(new CustomEvent('whatsapp-modal-state', { detail: { open } }));
}

export function WhatsAppButton() {
  const route = useAppLocation();
  const [settings, setSettings] = useState({
    ativo: true,
    telefone: '11920857756',
    mensagem: 'Olá, preciso de ajuda com a plataforma!',
    tamanho: 'M',
    posicao: 'direita',
    tooltip: 'Falar no WhatsApp'
  });

  const [movedToTop, setMovedToTop] = useState(false);
  const [isCheckoutMobile, setIsCheckoutMobile] = useState(false);
  const [hasOpenModalInDom, setHasOpenModalInDom] = useState(false);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.from('system_settings').select('*').like('key', 'whatsapp_float_%');
      if (data && data.length > 0) {
        setSettings(prev => ({
          ...prev,
          ativo: data.find(s => s.key === 'whatsapp_float_ativo')?.value !== 'false',
          telefone: data.find(s => s.key === 'whatsapp_float_telefone')?.value || prev.telefone,
          mensagem: data.find(s => s.key === 'whatsapp_float_mensagem')?.value || prev.mensagem,
          tamanho: data.find(s => s.key === 'whatsapp_float_tamanho')?.value || prev.tamanho,
          posicao: data.find(s => s.key === 'whatsapp_float_posicao')?.value || prev.posicao,
          tooltip: data.find(s => s.key === 'whatsapp_float_tooltip')?.value || prev.tooltip,
        }));
      }
    } catch (err) {
      console.warn('[WhatsAppButton] Usando configurações padrão do WhatsApp (modo local/offline)');
    }
  };

  useEffect(() => {
    fetchSettings();
    const settingsInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchSettings();
    }, 60_000);

    const handleModalState = (e: Event) => {
      const { open } = (e as CustomEvent).detail;
      setMovedToTop(Boolean(open));
    };
    window.addEventListener('whatsapp-modal-state', handleModalState);

    const checkCheckoutMobile = () => {
      const isCheckout = typeof window !== 'undefined' && (window.location.pathname.includes('/checkout') || window.location.pathname.includes('/carrinho'));
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      setIsCheckoutMobile(isCheckout && isMobile);
    };

    // Observador do DOM para detectar quando o carrinho ou modais estão abertos
    const checkDomModals = () => {
      if (typeof document === 'undefined') return;
      const cartOpen = Boolean(
        document.querySelector('[aria-labelledby="gsa-cart-title"]') ||
        document.querySelector('[data-cart-drawer]') ||
        (document.body && document.body.style.overflow === 'hidden' && !document.querySelector('.admin-panel'))
      );
      setHasOpenModalInDom(cartOpen);
    };

    checkCheckoutMobile();
    checkDomModals();

    const observer = new MutationObserver(() => {
      checkDomModals();
    });

    if (typeof document !== 'undefined' && document.body) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }

    window.addEventListener('resize', checkCheckoutMobile);
    window.addEventListener('popstate', checkCheckoutMobile);

    return () => {
      window.clearInterval(settingsInterval);
      window.removeEventListener('whatsapp-modal-state', handleModalState);
      window.removeEventListener('resize', checkCheckoutMobile);
      window.removeEventListener('popstate', checkCheckoutMobile);
      observer.disconnect();
    };
  }, []);

  // Oculta imediatamente se:
  // 1. O carrinho estiver aberto (via URL ?modal=carrinho ou ?modal=checkout ou qualquer ?modal=)
  // 2. Rota for checkout
  // 3. Sinal de modal aberto (movedToTop)
  // 4. Carrinho aberto detectado no DOM (hasOpenModalInDom)
  // 5. Versão mobile do checkout
  const isUrlModalOpen = Boolean(route.query?.modal) || Boolean(route.itemId);
  const isCheckoutRoute = route.pathname.includes('/checkout') || route.pathname.includes('/loja/checkout');

  if (!settings.ativo || movedToTop || isCheckoutMobile || isUrlModalOpen || isCheckoutRoute || hasOpenModalInDom) {
    return null;
  }


  // Cleanup phone
  const cleanPhone = settings.telefone.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(settings.mensagem);
  const waLink = `https://wa.me/55${cleanPhone}?text=${encodedMessage}`;

  // Configurar Estilos Dinâmicos
  let sizeClass = 'h-[50px] w-[50px]'; // M (Padrão)
  let iconSize = '24';
  if (settings.tamanho === 'P') { sizeClass = 'h-[40px] w-[40px]'; iconSize = '20'; }
  if (settings.tamanho === 'G') { sizeClass = 'h-[60px] w-[60px]'; iconSize = '28'; }

  const positionClass = settings.posicao === 'esquerda' ? 'left-6' : 'right-6';

  return (
    <AnimatePresence>
      <motion.a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        drag
        dragConstraints={{ top: -500, bottom: 0, left: -300, right: 0 }}
        dragElastic={0.1}
        dragMomentum={false}
        whileDrag={{ cursor: 'grabbing', scale: 1.1, zIndex: 10000 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={`gsa-floating-whatsapp fixed bottom-[100px] z-[9999] flex items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-4 ring-white transition-shadow hover:shadow-[0_8px_25px_rgba(37,211,102,0.5)] cursor-pointer ${positionClass} ${sizeClass}`}
        title={settings.tooltip}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
        </svg>
        <div className="absolute top-0 right-0 h-4 w-4 rounded-full bg-red-500 border-2 border-white animate-pulse" />
      </motion.a>
    </AnimatePresence>
  );
}
