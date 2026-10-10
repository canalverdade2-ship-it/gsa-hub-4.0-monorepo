import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, MapPin, Car, Settings, Calendar, Gauge } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface VehicleAd {
  id: string;
  slug: string;
  titulo: string;
  preco: number;
  cidade: string;
  estado: string;
  detalhes: {
    ano?: string;
    km?: number;
    cambio?: string;
    combustivel?: string;
    marca?: string;
  };
  midia_capa?: string;
}

export function VehiclesMarketplacePage({ onBack }: { onBack: () => void }) {
  const [ads, setAds] = useState<VehicleAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classificados_anuncios')
        .select(`
          id, slug, titulo, preco, cidade, estado, detalhes,
          classificados_midias(url, tipo, ordem)
        `)
        .eq('categoria', 'veiculos')
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
      console.error('Error fetching vehicles:', err);
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
            <Car className="h-5 w-5 text-[#f59e0b]" />
            <span className="text-base font-black tracking-tight text-[#1a1a1a]">
              Veículos
            </span>
          </div>
          <div className="w-20" />
        </div>
      </nav>

      <div className="bg-[#1a1a1a] text-white py-12 px-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4 text-[#f59e0b]">
            Acelere sua conquista
          </h1>
          <p className="text-white/70 max-w-2xl mb-8">
            Carros e motos com procedência garantida e a segurança da nossa intermediação.
          </p>
          
          <div className="relative max-w-2xl bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/10">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
            <input 
              type="text" 
              placeholder="Buscar por marca, modelo ou ano..." 
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
            <div className="animate-spin h-8 w-8 border-4 border-[#f59e0b] border-t-transparent rounded-full" />
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-20">
            <Car className="h-16 w-16 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Nenhum veículo encontrado</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredAds.map((ad, i) => (
              <motion.div
                key={ad.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => navigate(routes.marketplace.classifieds.veiculo(ad.slug))}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group border border-black/5"
              >
                <div className="relative aspect-[4/3] bg-neutral-200 overflow-hidden">
                  {ad.midia_capa ? (
                    <img src={ad.midia_capa} alt={ad.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-100">
                      <Car className="h-12 w-12 text-neutral-300" />
                    </div>
                  )}
                  {ad.detalhes?.marca && (
                    <div className="absolute top-4 left-4">
                      <span className="px-3 py-1 bg-[#1a1a1a]/80 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider rounded-full">
                        {ad.detalhes.marca}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="p-6">
                  <h3 className="text-lg font-bold text-neutral-900 mb-4 line-clamp-2 leading-tight group-hover:text-[#f59e0b] transition-colors">
                    {ad.titulo}
                  </h3>
                  
                  <div className="text-2xl font-black text-[#1a1a1a] mb-6">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.preco)}
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-neutral-100 pt-4 text-neutral-600">
                    {ad.detalhes?.ano && (
                      <div className="flex items-center gap-1.5" title="Ano">
                        <Calendar className="h-4 w-4" />
                        <span className="text-sm font-semibold">{ad.detalhes.ano}</span>
                      </div>
                    )}
                    {ad.detalhes?.km !== undefined && (
                      <div className="flex items-center gap-1.5" title="Quilometragem">
                        <Gauge className="h-4 w-4" />
                        <span className="text-sm font-semibold">{ad.detalhes.km} km</span>
                      </div>
                    )}
                    {ad.detalhes?.cambio && (
                      <div className="flex items-center gap-1.5" title="Câmbio">
                        <Settings className="h-4 w-4" />
                        <span className="text-sm font-semibold">{ad.detalhes.cambio}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400 mt-4 font-medium">
                    <MapPin className="h-3 w-3" />
                    {ad.cidade} - {ad.estado}
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
