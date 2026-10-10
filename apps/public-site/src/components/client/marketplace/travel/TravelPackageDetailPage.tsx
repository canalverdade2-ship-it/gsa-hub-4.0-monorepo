import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Check, Clock, Image as ImageIcon, Info, Loader2, MapPin } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { formatCurrency } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';

interface TravelPackageDetailPageProps {
  slug: string;
  onBack: () => void;
  clientId?: string;
  onRequireAuth?: () => void;
}

export function TravelPackageDetailPage({ slug, onBack }: TravelPackageDetailPageProps) {
  const [pkg, setPkg] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPackage() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('viagens_pacotes')
          .select(`
            *,
            viagens_pacote_imagens(url, is_capa, ordem)
          `)
          .eq('slug', slug)
          .in('status', ['publicado', 'disponibilidade_sob_consulta'])
          .single();

        if (error) throw error;
        if (data?.viagens_pacote_imagens) {
          data.viagens_pacote_imagens.sort((a: any, b: any) => {
            if (a.is_capa) return -1;
            if (b.is_capa) return 1;
            return Number(a.ordem || 0) - Number(b.ordem || 0);
          });
        }
        setPkg(data);
      } catch (error) {
        console.error('Erro ao buscar pacote:', error);
        toast.error('Pacote não encontrado ou indisponível.');
        onBack();
      } finally {
        setLoading(false);
      }
    }

    fetchPackage();
  }, [slug, onBack]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f1ea]">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#0c2340]" />
        <p className="font-bold text-[#0c2340]">Carregando pacote...</p>
      </div>
    );
  }

  if (!pkg) return null;

  const coverImage =
    pkg.viagens_pacote_imagens?.[0]?.url ||
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200';
  const gallery = pkg.viagens_pacote_imagens?.slice(1) || [];
  const inclusions = Array.isArray(pkg.inclusoes) ? pkg.inclusoes : [];
  const exclusions = Array.isArray(pkg.exclusoes) ? pkg.exclusoes : [];
  const itinerary = Array.isArray(pkg.itinerario) ? pkg.itinerario : [];

  const requestQuote = () => {
    navigate(`${routes.marketplace.travelPackages.orcamento()}?pacote=${encodeURIComponent(pkg.id)}`);
  };

  return (
    <div className="min-h-screen bg-[#f4f1ea] pb-32 font-sans">
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#0c2340]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-5">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
        </div>
      </nav>

      <header className="relative h-[60vh] min-h-[400px] w-full bg-[#0c2340]">
        <img src={coverImage} alt={pkg.titulo} className="h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c2340] via-[#0c2340]/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 pb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#38bdf8]/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-[#38bdf8] backdrop-blur-md">
                {pkg.categoria}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                <Clock className="h-3 w-3" /> {pkg.dias || '—'} dias · {pkg.noites || '—'} noites
              </span>
              {pkg.status === 'disponibilidade_sob_consulta' && (
                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-black uppercase text-amber-200">Sob consulta</span>
              )}
            </div>
            <h1 className="max-w-4xl text-4xl font-black leading-tight text-white sm:text-6xl" style={{ fontFamily: '"Cinzel", serif' }}>
              {pkg.titulo}
            </h1>
            <div className="mt-4 flex items-center gap-2 text-white/75">
              <MapPin className="h-4 w-4" /> {pkg.origem || 'Origem flexível'} → {pkg.destino}
            </div>
          </motion.div>
        </div>
      </header>

      <main className="mx-auto mt-8 max-w-7xl px-5">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-10 lg:col-span-2">
            <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
              <h2 className="mb-6 text-2xl font-black text-[#0c2340]">O que está incluso</h2>
              {inclusions.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {inclusions.map((item: string, index: number) => (
                    <div key={`${item}-${index}`} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e6f4f1]">
                        <Check className="h-3.5 w-3.5 text-[#0d7a71]" />
                      </span>
                      <span className="font-medium text-neutral-700">{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500">As inclusões serão confirmadas na proposta final.</p>
              )}
            </section>

            {exclusions.length > 0 && (
              <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="mb-5 text-2xl font-black text-[#0c2340]">Não incluso</h2>
                <ul className="grid gap-3 text-sm text-neutral-600 sm:grid-cols-2">
                  {exclusions.map((item: string, index: number) => <li key={`${item}-${index}`}>• {item}</li>)}
                </ul>
              </section>
            )}

            {itinerary.length > 0 && (
              <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
                <h2 className="mb-6 text-2xl font-black text-[#0c2340]">Itinerário previsto</h2>
                <div className="space-y-6">
                  {itinerary.map((day: any, index: number) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0c2340] font-black text-white">{day.dia || index + 1}</span>
                        {index < itinerary.length - 1 && <div className="my-2 h-full w-0.5 bg-neutral-100" />}
                      </div>
                      <div className="flex-1 pb-6 pt-2">
                        <h3 className="mb-2 text-lg font-bold text-[#1a1a1a]">{day.titulo}</h3>
                        <p className="text-sm leading-relaxed text-neutral-600">{day.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {gallery.length > 0 && (
              <section>
                <h2 className="mb-6 flex items-center gap-2 text-2xl font-black text-[#0c2340]"><ImageIcon className="h-6 w-6" /> Galeria</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {gallery.map((image: any, index: number) => (
                    <div key={`${image.url}-${index}`} className="aspect-square overflow-hidden rounded-2xl bg-neutral-100">
                      <img src={image.url} alt={`${pkg.titulo} ${index + 2}`} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside>
            <div className="sticky top-24 rounded-3xl border border-black/5 bg-white p-6 shadow-xl sm:p-8">
              <div className="mb-6">
                <span className="text-sm font-bold uppercase tracking-wider text-neutral-500">A partir de</span>
                <div className="my-2 text-4xl font-black text-[#0c2340]">{formatCurrency(pkg.preco_venda)}</div>
                <p className="text-sm text-neutral-500">Por pessoa, conforme acomodação e disponibilidade.</p>
              </div>
              <div className="mb-8 space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3 text-sm font-medium text-neutral-700">
                  <Calendar className="h-5 w-5 text-[#38bdf8]" />
                  <span>{pkg.data_ida && pkg.data_volta ? `${new Date(`${pkg.data_ida}T12:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${pkg.data_volta}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Datas confirmadas na proposta'}</span>
                </div>
                {Number(pkg.parcelamento_maximo) > 1 && (
                  <div className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3 text-sm font-medium text-neutral-700">
                    <Info className="h-5 w-5 text-[#38bdf8]" /> Em até {pkg.parcelamento_maximo}x, sujeito às condições finais
                  </div>
                )}
              </div>
              <button onClick={requestQuote} className="w-full rounded-xl bg-[#0c2340] py-4 font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#134e78]">
                Consultar disponibilidade
              </button>
              <p className="mt-4 text-center text-xs text-neutral-400">
                Você pode solicitar sem criar uma conta. O preço final será confirmado pela equipe GSA.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
