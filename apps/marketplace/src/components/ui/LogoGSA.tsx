import React from 'react';

/**
 * LogoGSA — Componente de Logo Vetorizado (GETSÊMANI - Versão Fundo Azul Marinho)
 */

interface LogoGSAProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark'; // light = fundo escuro (sidebar), dark = fundo claro (login)
  showText?: boolean;
  className?: string;
}

const sizes = {
  xs: { img: 'h-6 w-6',   mainSize: 'text-sm',    subSize: 'text-[7px]',  gap: 'gap-2' },
  sm: { img: 'h-9 w-9',   mainSize: 'text-xl',    subSize: 'text-[9px]',  gap: 'gap-2.5' },
  md: { img: 'h-12 w-12', mainSize: 'text-2xl',   subSize: 'text-[10px]', gap: 'gap-3' },
  lg: { img: 'h-16 w-16', mainSize: 'text-3xl',   subSize: 'text-xs',     gap: 'gap-4' },
  xl: { img: 'h-24 w-24', mainSize: 'text-5xl',   subSize: 'text-sm',     gap: 'gap-6' },
};

export function LogoGSA({ size = 'md', variant = 'light', showText = false, className = '' }: LogoGSAProps) {
  const s = sizes[size];
  const isDarkBg = variant === 'light'; // Textos devem ser brancos
  
  const subtextColor = isDarkBg ? 'text-white/70' : 'text-neutral-500';

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      
      {/* VETOR SVG - GETSÊMANI COM FUNDO AZUL */}
      <div className={`${s.img} shrink-0 relative flex items-center justify-center`}>
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* Gradiente Ouro Real - Base Escura */}
            <linearGradient id="getsGold" x1="10%" y1="100%" x2="90%" y2="0%">
              <stop offset="0%" stopColor="#A87C2B" />
              <stop offset="35%" stopColor="#EDCF83" />
              <stop offset="50%" stopColor="#FFF4D0" />
              <stop offset="65%" stopColor="#C19A43" />
              <stop offset="100%" stopColor="#F9DF9F" />
            </linearGradient>
            
            {/* Gradiente Ouro Claro - Destaque */}
            <linearGradient id="getsGoldLight" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#C19A43" />
              <stop offset="50%" stopColor="#FFF2BD" />
              <stop offset="100%" stopColor="#D7A94D" />
            </linearGradient>

            {/* Gradiente Azul Marinho Interno do Escudo */}
            <linearGradient id="shieldBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2A3847" />
              <stop offset="100%" stopColor="#121A24" />
            </linearGradient>
          </defs>

          {/* 1. Fundo Azul Marinho do Escudo */}
          <path 
            d="M 50 6 L 82 14 V 48 C 82 72 50 94 50 94 C 50 94 18 72 18 48 V 14 L 50 6 Z" 
            fill="url(#shieldBg)" 
          />

          {/* 2. Contorno do Escudo Dourado */}
          <path 
            d="M 50 6 L 82 14 V 48 C 82 72 50 94 50 94 C 50 94 18 72 18 48 V 14 L 50 6 Z" 
            stroke="url(#getsGold)" 
            strokeWidth="3.5" 
            strokeLinejoin="round" 
            fill="none"
          />
          
          {/* 3. Gráfico de Barras - Crescimento */}
          <path d="M 28 50 h 4.5 v 10 h -4.5 z" fill="url(#getsGoldLight)" />
          <path d="M 36.5 42 h 4.5 v 18 h -4.5 z" fill="url(#getsGold)" />
          <path d="M 45 30 h 4.5 v 30 h -4.5 z" fill="url(#getsGoldLight)" />

          {/* 4. Folhas Superiores */}
          <path d="M 53 35 C 58 20 63 10 46 5 C 56 10 53 25 53 35 Z" fill="url(#getsGoldLight)" />
          <path d="M 56 42 C 69 30 76 22 69 12 C 67 22 61 32 56 42 Z" fill="url(#getsGold)" />

          {/* 5. Arcos/Traços Dinâmicos */}
          <path d="M 17 56 C 45 82 65 65 85 28 C 72 58 48 72 17 56 Z" fill="url(#getsGoldLight)" />
          <path d="M 23 66 C 50 90 70 75 88 45 C 72 73 50 84 23 66 Z" fill="url(#getsGold)" />
          <path d="M 32 75 C 50 88 65 80 80 57 C 65 75 50 80 32 75 Z" fill="url(#getsGoldLight)" />

          {/* 6. Engrenagem vazada */}
          <g transform="translate(68, 67) scale(0.5)">
            <path 
              fillRule="evenodd" 
              clipRule="evenodd" 
              fill="url(#getsGold)" 
              d="M -9 -3 h -3.5 v 6 h 3.5 c 0.5 1.8 1.5 3.5 2.8 4.8 l -2.5 2.5 l 4.5 4.5 l 2.5 -2.5 c 1.3 1.3 3 2.3 4.8 2.8 v 3.5 h 6 v -3.5 c 1.8 -0.5 3.5 -1.5 4.8 -2.8 l 2.5 2.5 l 4.5 -4.5 l -2.5 -2.5 c 1.3 -1.3 2.3 -3 2.8 -4.8 h 3.5 v -6 h -3.5 c -0.5 -1.8 -1.5 -3.5 -2.8 -4.8 l 2.5 -2.5 l -4.5 -4.5 l -2.5 2.5 c -1.3 -1.3 -3 -2.3 -4.8 -2.8 v -3.5 h -6 v 3.5 c -1.8 0.5 -3.5 1.5 -4.8 2.8 l -2.5 -2.5 l -4.5 4.5 l 2.5 2.5 c -1.3 1.3 -2.3 3 -2.8 4.8 Z M 0 -5.5 A 5.5 5.5 0 1 0 0 5.5 A 5.5 5.5 0 1 0 0 -5.5 Z" 
            />
          </g>
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col justify-center translate-y-[-2px]">
          {/* Nome Principal Azul Marinho ou Branco */}
          <span 
            className={`font-serif tracking-widest leading-none ${s.mainSize}`}
            style={{ 
              fontFamily: '"Cinzel", serif',
              color: isDarkBg ? '#FFFFFF' : '#142030', // Azul marinho profundo idêntico à imagem quando o fundo é claro
            }}
          >
            GSA HUB
          </span>
          <span className={`font-semibold tracking-[0.28em] mt-1.5 uppercase ${s.subSize} ${subtextColor}`}>
            Soluções Digitais
          </span>
        </div>
      )}
    </div>
  );
}
