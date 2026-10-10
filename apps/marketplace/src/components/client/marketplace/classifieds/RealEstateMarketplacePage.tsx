import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, MapPin, Building2, Bed, Bath, Car as CarIcon, Maximize, Filter, X } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface PropertyAd {
  id: string;
  slug: string;
  titulo: string;
  preco: number;
  cidade: string;
  estado: string;
  bairro: string;
  detalhes: {
    area?: number;
    quartos?: number;
    banheiros?: number;
    vagas?: number;
    tipo?: string;
  };
  midia_capa?: string;
}

export function RealEstateMarketplacePage({ onBack }: { onBack: () => void }) {
  const [ads, setAds] = useState<PropertyAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  
  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const { data: adsData, error } = await supabase
        .from('classificados_anuncios')
        .select(`
          id, slug, titulo, preco, cidade, estado, bairro, detalhes,
          classificados_midias(url, tipo, ordem)
        `)
        .eq('categoria', 'imoveis')
        .in('status', ['publicado', 'reservado', 'vendido']);
        
      if (error) throw error;
      
      const formattedAds = (adsData || []).map((ad: any) => {
        // Encontrar imagem principal
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
          bairro: ad.bairro,
          detalhes: ad.detalhes || {},
          midia_capa: cover
        };
      });
      
      setAds(formattedAds);
    } catch (err) {
      console.error('Error fetching real estate:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredAds = ads.filter(ad => {
    const matchesSearch = ad.titulo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCity = cityFilter ? ad.cidade.toLowerCase() === cityFilter.toLowerCase() : true;
    return matchesSearch && matchesCity;
  });

  const uniqueCities = Array.from(new Set(ads.map(ad => ad.cidade))).sort();

  return (
    <div className="bg-[#FAF9F6] min-h-screen">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#FAF9F6]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar ao Hub</span>
          </button>
          
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#e8a838]" />
            <span className="text-base font-black tracking-tight text-[#1a1a1a]">
              Imóveis Premium
            </span>
          </div>
          
          <div className="w-20" /> {/* Spacer */}
        </div>
      </nav>

      {/* HEADER / FILTERS */}
      <div className="bg-[#1a1a1a] text-white py-12 px-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4 text-[#e8a838]">
            Encontre seu novo espaço
          </h1>
          <p className="text-white/70 max-w-2xl mb-8">
            Casas de alto padrão, apartamentos modernos e terrenos bem localizados. Todos com a garantia de intermediação da GSA.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/10">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
              <input 
                type="text" 
                placeholder="Buscar por título ou característica..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none pl-12 pr-4 py-4 text-white placeholder:text-white/40 focus:ring-0 outline-none"
              />
            </div>
            <div className="w-px bg-white/20 hidden sm:block" />
            <div className="sm:w-64 relative flex items-center">
              <MapPin className="absolute left-4 h-5 w-5 text-white/40" />
              <select 
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
                className="w-full bg-transparent border-none pl-12 pr-4 py-4 text-white focus:ring-0 outline-none appearance-none cursor-pointer"
              >
                <option value="" className="text-black">Qualquer cidade</option>
                {uniqueCities.map(city => (
                  <option key={city} value={city} className="text-black">{city}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="max-w-7xl mx-auto px-5 py-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-[#e8a838] border-t-transparent rounded-full" />
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="h-16 w-16 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Nenhum imóvel encontrado</h3>
            <p className="text-neutral-500">Tente ajustar seus filtros ou termos de busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredAds.map((ad, i) => (
              <motion.div
                key={ad.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => navigate(routes.marketplace.classifieds.imovel(ad.slug))}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group border border-black/5"
              >
                <div className="relative aspect-[4/3] bg-neutral-200 overflow-hidden">
                  {ad.midia_capa ? (
                    <img 
                      src={ad.midia_capa} 
                      alt={ad.titulo} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-100">
                      <Building2 className="h-12 w-12 text-neutral-300" />
                    </div>
                  )}
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 bg-[#1a1a1a]/80 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider rounded-full">
                      {ad.detalhes?.tipo || 'Imóvel'}
                    </span>
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="flex items-center gap-2 text-sm text-neutral-500 mb-2 font-medium">
                    <MapPin className="h-4 w-4" />
                    {ad.bairro ? `${ad.bairro}, ` : ''}{ad.cidade} - {ad.estado}
                  </div>
                  
                  <h3 className="text-lg font-bold text-neutral-900 mb-4 line-clamp-2 leading-tight group-hover:text-[#e8a838] transition-colors">
                    {ad.titulo}
                  </h3>
                  
                  <div className="text-2xl font-black text-[#1a1a1a] mb-6">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.preco)}
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-neutral-100 pt-4 text-neutral-600">
                    {ad.detalhes?.area && (
                      <div className="flex items-center gap-1.5" title="Área">
                        <Maximize className="h-4 w-4" />
                        <span className="text-sm font-semibold">{ad.detalhes.area} m²</span>
                      </div>
                    )}
                    {ad.detalhes?.quartos && (
                      <div className="flex items-center gap-1.5" title="Quartos">
                        <Bed className="h-4 w-4" />
                        <span className="text-sm font-semibold">{ad.detalhes.quartos}</span>
                      </div>
                    )}
                    {ad.detalhes?.banheiros && (
                      <div className="flex items-center gap-1.5" title="Banheiros">
                        <Bath className="h-4 w-4" />
                        <span className="text-sm font-semibold">{ad.detalhes.banheiros}</span>
                      </div>
                    )}
                    {ad.detalhes?.vagas && (
                      <div className="flex items-center gap-1.5" title="Vagas">
                        <CarIcon className="h-4 w-4" />
                        <span className="text-sm font-semibold">{ad.detalhes.vagas}</span>
                      </div>
                    )}
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
