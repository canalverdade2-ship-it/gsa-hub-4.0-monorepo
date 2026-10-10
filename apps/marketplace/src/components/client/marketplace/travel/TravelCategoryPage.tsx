import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plane, MapPin, Globe, Luggage, Search, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { formatCurrency } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';

interface TravelCategoryPageProps {
  category: 'nacional' | 'internacional' | 'excursao';
  onBack: () => void;
}

const CATEGORY_INFO = {
  nacional: {
    title: 'Destinos Nacionais',
    icon: MapPin,
    bg: 'bg-[#e6f4f1]',
    textColor: 'text-[#0c4a45]',
    accent: '#0d7a71',
    headerBg: 'bg-[#0d7a71]',
    headerImg: 'https://images.unsplash.com/photo-1596422846543-74c6fc1e0adb?auto=format&fit=crop&w=1200&q=80',
  },
  internacional: {
    title: 'Destinos Internacionais',
    icon: Globe,
    bg: 'bg-[#0c2340]',
    textColor: 'text-white',
    accent: '#38bdf8',
    headerBg: 'bg-[#0c2340]',
    headerImg: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80',
  },
  excursao: {
    title: 'Promoções Exclusivas',
    icon: Luggage,
    bg: 'bg-[#1b3a4b]',
    textColor: 'text-[#7dd3fc]',
    accent: '#065a82',
    headerBg: 'bg-[#1b3a4b]',
    headerImg: '/images/promocoes_exclusivas_cover.jpg',
  }
};

export function TravelCategoryPage({ category, onBack }: TravelCategoryPageProps) {
  const info = CATEGORY_INFO[category];
  const Icon = info.icon;

  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPackages() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('viagens_pacotes')
          .select(`
            id, titulo, slug, dias, noites, origem, destino, preco_venda,
            viagens_pacote_imagens(url, is_capa)
          `)
          .eq('categoria', category)
          .in('status', ['publicado', 'disponibilidade_sob_consulta']);

        if (error) throw error;
        setPackages(data || []);
      } catch (err) {
        console.error('Erro ao buscar pacotes:', err);
        toast.error('Não foi possível carregar os pacotes no momento.');
      } finally {
        setLoading(false);
      }
    }
    fetchPackages();
  }, [category]);

  return (
    <div className="bg-[#f4f1ea] min-h-screen flex flex-col font-sans">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/80 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar às Ofertas</span>
            </button>
            <div className="h-5 w-px bg-black/10" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: info.accent }}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-black tracking-tight" style={{ color: info.accent }}>
                {info.title}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden h-[30vh] min-h-[250px] shrink-0">
        <div className="absolute inset-0">
          <img src={info.headerImg} alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, ${info.accent}, transparent)` }} />
        </div>
        <div className="relative h-full max-w-7xl mx-auto px-5 flex flex-col justify-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-6xl font-black text-white tracking-tight"
            style={{ fontFamily: '"Cinzel", serif', fontWeight: 700 }}
          >
            {info.title}
          </motion.h1>
        </div>
      </section>

      <div className="flex-1 max-w-7xl mx-auto px-5 py-12 w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <Loader2 className="h-10 w-10 animate-spin mb-4" />
            <p className="font-medium text-sm">Buscando as melhores ofertas...</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-black/5 flex items-center justify-center mb-6">
              <Search className="h-10 w-10 text-neutral-400" />
            </div>
            <h3 className="text-2xl font-black text-[#1a1a1a] mb-2">Nenhuma oferta no momento</h3>
            <p className="text-neutral-500 mb-8">
              No momento não há pacotes publicados nesta categoria, mas você pode solicitar um orçamento personalizado!
            </p>
            <button 
              onClick={() => navigate(routes.marketplace.travelPackages.orcamento())}
              className="px-6 py-3 rounded-xl text-white font-bold transition-all shadow-lg hover:scale-105"
              style={{ backgroundColor: info.accent }}
            >
              Montar Minha Viagem
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg, i) => {
              const coverImg = pkg.viagens_pacote_imagens?.find((img: any) => img.is_capa)?.url || pkg.viagens_pacote_imagens?.[0]?.url || 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800';
              return (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => navigate(routes.marketplace.travelPackages.pacote(pkg.slug))}
                  className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col"
                >
                  <div className="relative h-56 w-full overflow-hidden">
                    <img src={coverImg} alt={pkg.titulo} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                      <div className="text-white">
                        <span className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1 block">
                          {pkg.dias} dias, {pkg.noites} noites
                        </span>
                        <h4 className="text-xl font-black leading-tight">{pkg.destino}</h4>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <p className="text-sm font-medium text-neutral-500 mb-6 line-clamp-2">
                      {pkg.titulo}
                    </p>
                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">A partir de</span>
                        <span className="text-xl font-black text-[#0c2340]">{formatCurrency(pkg.preco_venda)}</span>
                      </div>
                      <div className="h-10 w-10 rounded-full flex items-center justify-center bg-[#f4f1ea] group-hover:bg-[#0c2340] group-hover:text-white transition-colors">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
