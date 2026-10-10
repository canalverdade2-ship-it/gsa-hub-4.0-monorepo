import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, ShoppingBag, Plane, Tags } from 'lucide-react';

interface MarketplaceLandingProps {
  onEnter: () => void;
  onBackToSite?: () => void;
  isPublic?: boolean;
}

export function MarketplaceLanding({ onEnter, onBackToSite, isPublic = false }: MarketplaceLandingProps) {
  return (
    <div className="min-h-screen bg-[#f8f7f5] flex flex-col justify-between">
      {/* Topo / Header minimalista */}
      <header className="max-w-6xl w-full mx-auto px-5 py-6 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-[#1a1a1a]">
          GSA STORE
        </span>
        {isPublic && onBackToSite && (
          <button
            onClick={onBackToSite}
            className="text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Voltar ao site
          </button>
        )}
      </header>

      {/* Corpo principal */}
      <main className="max-w-3xl mx-auto px-5 text-center flex-1 flex flex-col items-center justify-center py-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-xs font-bold text-indigo-700 mb-6"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Bem-vindo ao novo ecossistema
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black text-[#111] tracking-tight leading-none mb-6"
        >
          O Marketplace da<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600">
            GSA Store
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg text-neutral-500 leading-relaxed max-w-lg mb-10"
        >
          Explore nosso catálogo exclusivo de produtos, planos de assinatura, oportunidades de viagens e classificados em uma experiência fluida e integrada.
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          onClick={onEnter}
          className="group relative inline-flex items-center gap-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-4 text-sm shadow-xl shadow-indigo-100 hover:shadow-indigo-200 transition-all duration-300"
        >
          Começar a explorar
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </motion.button>
      </main>

      {/* Ícones de módulos */}
      <footer className="max-w-md w-full mx-auto px-5 pb-12">
        <div className="flex items-center justify-around text-neutral-400 border-t border-black/5 pt-8">
          <div className="flex flex-col items-center gap-1">
            <ShoppingBag className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Produtos</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Plane className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Viagens</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Tags className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Classificados</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
