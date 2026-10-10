import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, MapPin, Boxes, Package, Tag } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface GeneralAd {
  id: string;
  slug: string;
  titulo: string;
  preco: number;
  cidade: string;
  estado: string;
  detalhes: {
    condicao?: string; // 'novo', 'usado'
    tipo?: string; // 'equipamento', 'produto', 'servico'
  };
  midia_capa?: string;
}

export function GeneralClassifiedsPage({ onBack }: { onBack: () => void }) {
  const [ads, setAds] = useState<GeneralAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    fetchGeneralAds();
  }, []);

  const fetchGeneralAds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classificados_anuncios')
        .select(`
          id, slug, titulo, preco, cidade, estado, detalhes,
          classificados_midias(url, tipo, ordem)
        `)
        .eq('categoria', 'geral')
        .in('status', ['publicado', 'reservado', 'vendido']);
        
      if (error) throw error;
      
      const formatted = (data || []).map((ad: any) => {
        const midias = ad.classificados_midias || [];
        const cover = midias.find((m: any) => m.tipo === 'image' && m.ordem === 0)?.url 
                      || midias.find((m: any) => m.tipo === 'image')?.url;
                      
        return {
          id: ad.id,
          slug: ad.slug,
          titulo: ad.titulo,
          preco: ad.preco,
          cidade: ad.cidade,
          estado: ad.estado,
          detalhes: ad.detalhes || {},
          midia_capa: cover
        };
      });
      setAds(formatted);
    } catch (err) {
      console.error('Error fetching general ads:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredAds = ads.filter(ad => ad.titulo.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="bg-[#FAF9F6] min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#FAF9F6]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar ao Hub</span>
          </button>
          
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-[#fbbf24]" />
            <span className="text-base font-black tracking-tight text-[#1a1a1a]">
              Classificados Gerais
            </span>
          </div>
          <div className="w-20" />
        </div>
      </nav>

      <div className="bg-[#1a1a1a] text-white py-12 px-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4 text-[#fbbf24]">
            Encontre de tudo
          </h1>
          <p className="text-white/70 max-w-2xl mb-8">
            Equipamentos, produtos exclusivos e oportunidades diversas com a garantia GSA.
          </p>
          
          <div className="relative max-w-2xl bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/10">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
            <input 
              type="text" 
              placeholder="Buscar itens..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none pl-14 pr-4 py-4 text-white placeholder:text-white/40 focus:ring-0 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 py-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-[#fbbf24] border-t-transparent rounded-full" />
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-20">
            <Boxes className="h-16 w-16 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Nenhum anúncio encontrado</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAds.map((ad, i) => (
              <motion.div
                key={ad.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => navigate(routes.marketplace.classifieds.geralItem(ad.slug))}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group border border-black/5 flex flex-col"
              >
                <div className="relative aspect-square bg-neutral-200 overflow-hidden shrink-0">
                  {ad.midia_capa ? (
                    <img src={ad.midia_capa} alt={ad.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-100">
                      <Package className="h-12 w-12 text-neutral-300" />
                    </div>
                  )}
                  {ad.detalhes?.condicao && (
                    <div className="absolute top-3 left-3">
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${ad.detalhes.condicao === 'novo' ? 'bg-emerald-500 text-white' : 'bg-neutral-800 text-white'}`}>
                        {ad.detalhes.condicao}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="text-base font-bold text-neutral-900 mb-2 line-clamp-2 leading-tight group-hover:text-[#fbbf24] transition-colors">
                    {ad.titulo}
                  </h3>
                  
                  <div className="mt-auto">
                    <div className="text-xl font-black text-[#1a1a1a] mb-4">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.preco)}
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-neutral-600">
                       <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Tag className="h-3 w-3" />
                        <span>{ad.detalhes?.tipo || 'Produto'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
                        <MapPin className="h-3 w-3" />
                        <span>{ad.cidade} - {ad.estado}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
