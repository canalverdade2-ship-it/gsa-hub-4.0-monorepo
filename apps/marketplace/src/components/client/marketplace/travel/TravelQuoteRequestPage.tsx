import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Loader2,
  Mail,
  MapPin,
  Minus,
  Phone,
  Plane,
  Plus,
  Route,
  Send,
  UserRound,
  Users,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { toast } from 'react-hot-toast';
import { maskPhone } from '../../../../lib/utils';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

interface TravelQuoteRequestPageProps {
  clientId?: string;
  onBack: () => void;
  onRequireAuth?: () => void;
}

type TravelerField = 'adultos' | 'criancas' | 'bebes';

type SelectedPackage = {
  id: string;
  titulo: string;
  origem: string | null;
  destino: string | null;
  data_ida: string | null;
  data_volta: string | null;
  preco_venda: number;
  status: string;
};

const fieldClassName =
  'h-12 w-full rounded-xl border border-[#0c2340]/15 bg-[#fbfbfa] px-4 text-sm font-medium text-[#172033] outline-none transition focus:border-[#168ac1] focus:bg-white focus:ring-4 focus:ring-[#38bdf8]/10';
const iconFieldClassName = `${fieldClassName} pl-11`;
const labelClassName =
  'mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#5f6875]';

const accommodationLabels: Record<string, string> = {
  economico: 'Econômico',
  '4_estrelas': 'Conforto',
  '5_estrelas': 'Luxo',
  resort_all_inclusive: 'All inclusive',
  indiferente: 'Melhor oportunidade',
};

function formatTravelDate(value: string) {
  if (!value) return 'A definir';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T12:00:00`));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

interface PassengerStepperProps {
  label: string;
  detail: string;
  value: number;
  minimum: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

function PassengerStepper({
  label,
  detail,
  value,
  minimum,
  onDecrease,
  onIncrease,
}: PassengerStepperProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-[#0c2340]/10 bg-[#fbfbfa] p-3 sm:block sm:p-4">
      <div className="min-w-0 sm:mb-3">
        <p className="truncate text-xs font-bold text-[#172033] sm:text-sm">{label}</p>
        <p className="truncate text-[10px] text-neutral-500 sm:text-xs">{detail}</p>
      </div>
      <div className="flex w-28 shrink-0 items-center justify-between gap-2 sm:w-auto">
        <button
          type="button"
          onClick={onDecrease}
          disabled={value <= minimum}
          aria-label={`Diminuir ${label.toLowerCase()}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#0c2340]/10 bg-white text-[#0c2340] transition hover:border-[#168ac1] hover:text-[#168ac1] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-6 text-center text-base font-black text-[#0c2340]">{value}</span>
        <button
          type="button"
          onClick={onIncrease}
          aria-label={`Aumentar ${label.toLowerCase()}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0c2340] text-white transition hover:bg-[#168ac1]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function TravelQuoteRequestPage({ clientId, onBack }: TravelQuoteRequestPageProps) {
  const [loading, setLoading] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<SelectedPackage | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    origem: '',
    destino: '',
    data_ida: '',
    data_volta: '',
    flexibilidade: '3_dias',
    adultos: 2,
    criancas: 0,
    bebes: 0,
    preferencia_hospedagem: '4_estrelas',
    observacoes: '',
  });

  const packageId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('pacote') : null;

  const loadPackage = async () => {
    if (!packageId) return;
    try {
      setPackageLoading(true);
      const { data, error } = await supabase
        .from('viagens_pacotes')
        .select('id, titulo, origem, destino, data_ida, data_volta, preco_venda, status')
        .eq('id', packageId)
        .in('status', ['publicado', 'disponibilidade_sob_consulta'])
        .single();

      if (error) throw error;
      setSelectedPackage(data as SelectedPackage);
      setFormData((previous) => ({
        ...previous,
        origem: data.origem || previous.origem,
        destino: data.destino || previous.destino,
        data_ida: data.data_ida || previous.data_ida,
        data_volta: data.data_volta || previous.data_volta,
        observacoes: previous.observacoes || `Tenho interesse no pacote: ${data.titulo}.`,
      }));
    } catch (error) {
      console.error('Erro ao carregar pacote selecionado:', error);
      toast.error('O pacote selecionado não está mais disponível. Você ainda pode solicitar uma viagem personalizada.');
    } finally {
      setPackageLoading(false);
    }
  };

  useEffect(() => {
    void loadPackage();
  }, [packageId]);

  useRealtimeSubscription(
    [
      {
        table: 'viagens_pacotes',
        filter: packageId ? `id=eq.${packageId}` : undefined,
        enabled: Boolean(packageId),
        debounceMs: 300,
        onChange: () => { void loadPackage(); },
      },
    ],
    [packageId]
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const totalTravelers =
    Number(formData.adultos) + Number(formData.criancas) + Number(formData.bebes);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const changeTravelerCount = (field: TravelerField, delta: number, minimum: number) => {
    setFormData((previous) => ({
      ...previous,
      [field]: Math.max(minimum, Number(previous[field]) + delta),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (formData.data_volta < formData.data_ida) {
      toast.error('A data de volta não pode ser anterior à data de ida.');
      return;
    }

    if (!clientId && (!formData.nome.trim() || !formData.email.trim() || !formData.telefone.trim())) {
      toast.error('Informe seus dados de contato para receber a proposta.');
      return;
    }

    setLoading(true);
    try {
      const protocolo = `VIAGEM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const { error } = await supabase.from('viagens_orcamentos').insert({
        cliente_id: clientId || null,
        pacote_id: selectedPackage?.id || null,
        protocolo,
        ...formData,
      });

      if (error) throw error;

      toast.success(`Solicitação enviada! Protocolo ${protocolo}`);
      navigate(routes.marketplace.travelPackages.root());
    } catch (error: any) {
      console.error('Erro ao solicitar orçamento:', error);
      toast.error(error?.message || 'Erro ao enviar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f3ee] pb-24 font-sans text-[#172033]">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f5f3ee]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white hover:text-[#0c2340]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="mx-3 h-6 w-px bg-black/10" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0c2340] shadow-sm">
              <Plane className="h-5 w-5 text-[#38bdf8]" />
            </div>
            <span className="text-base font-black tracking-tight text-[#0c2340]">Monte sua viagem</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="max-w-3xl border-b border-[#0c2340]/10 pb-7 sm:pb-9">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-[#168ac1]">
            {selectedPackage ? 'Pacote selecionado' : 'Roteiro personalizado'}
          </p>
          <h1 className="max-w-2xl text-3xl font-bold leading-[1.08] text-[#0c2340] sm:text-5xl" style={{ fontFamily: '"Cinzel", serif' }}>
            {selectedPackage ? 'Confirme os detalhes da sua viagem.' : 'Conte como quer viajar.'}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-600 sm:text-base">
            Destino, datas e viajantes. Nossa equipe confirma disponibilidade e envia a proposta final.
          </p>
        </header>

        {packageLoading && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#0c2340]/10 bg-white p-5 text-sm font-bold text-[#0c2340]">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando pacote selecionado...
          </div>
        )}

        {selectedPackage && (
          <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-[#38bdf8]/30 bg-[#eaf8fd] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#168ac1]">Pacote de referência</p>
              <h2 className="mt-1 text-xl font-black text-[#0c2340]">{selectedPackage.titulo}</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {selectedPackage.destino || 'Destino sob consulta'} · a partir de {formatCurrency(selectedPackage.preco_venda)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(routes.marketplace.travelPackages.ofertas())}
              className="rounded-xl border border-[#0c2340]/15 bg-white px-4 py-2 text-sm font-bold text-[#0c2340] hover:bg-[#f8fafb]"
            >
              Escolher outro pacote
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-hidden rounded-[28px] border border-[#0c2340]/10 bg-white shadow-[0_18px_50px_rgba(12,35,64,0.08)]">
            <section className="border-b border-[#0c2340]/10 p-5 sm:p-7">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f6fb] text-[#0f789d]"><Route className="h-5 w-5" /></div>
                <h2 className="text-lg font-black text-[#0c2340]">Rota e datas</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClassName}>Origem
                  <div className="relative mt-2"><MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#168ac1]" />
                    <input name="origem" value={formData.origem} onChange={handleChange} placeholder="Cidade de partida" required className={iconFieldClassName} />
                  </div>
                </label>
                <label className={labelClassName}>Destino
                  <div className="relative mt-2"><Plane className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#168ac1]" />
                    <input name="destino" value={formData.destino} onChange={handleChange} placeholder="Para onde deseja ir?" required className={iconFieldClassName} />
                  </div>
                </label>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className={labelClassName}>Ida
                  <input type="date" name="data_ida" min={today} value={formData.data_ida} onChange={handleChange} required className={`${fieldClassName} mt-2`} />
                </label>
                <label className={labelClassName}>Volta
                  <input type="date" name="data_volta" min={formData.data_ida || today} value={formData.data_volta} onChange={handleChange} required className={`${fieldClassName} mt-2`} />
                </label>
                <label className={labelClassName}>Flexibilidade
                  <select name="flexibilidade" value={formData.flexibilidade} onChange={handleChange} className={`${fieldClassName} mt-2`}>
                    <option value="exata">Datas exatas</option>
                    <option value="3_dias">± 3 dias</option>
                    <option value="mes_inteiro">Mês inteiro</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="border-b border-[#0c2340]/10 p-5 sm:p-7">
              <div className="mb-5 flex items-center gap-3"><Users className="h-5 w-5 text-[#4655d8]" /><h2 className="text-lg font-black text-[#0c2340]">Viajantes</h2></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                <PassengerStepper label="Adultos" detail="12+ anos" value={formData.adultos} minimum={1} onDecrease={() => changeTravelerCount('adultos', -1, 1)} onIncrease={() => changeTravelerCount('adultos', 1, 1)} />
                <PassengerStepper label="Crianças" detail="2 a 11 anos" value={formData.criancas} minimum={0} onDecrease={() => changeTravelerCount('criancas', -1, 0)} onIncrease={() => changeTravelerCount('criancas', 1, 0)} />
                <PassengerStepper label="Bebês" detail="0 a 23 meses" value={formData.bebes} minimum={0} onDecrease={() => changeTravelerCount('bebes', -1, 0)} onIncrease={() => changeTravelerCount('bebes', 1, 0)} />
              </div>
            </section>

            <section className="border-b border-[#0c2340]/10 p-5 sm:p-7">
              <div className="mb-5 flex items-center gap-3"><BedDouble className="h-5 w-5 text-[#7c3aed]" /><h2 className="text-lg font-black text-[#0c2340]">Preferências</h2></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClassName}>Hospedagem
                  <select name="preferencia_hospedagem" value={formData.preferencia_hospedagem} onChange={handleChange} className={`${fieldClassName} mt-2`}>
                    <option value="economico">Econômico / 3 estrelas</option>
                    <option value="4_estrelas">Conforto / 4 estrelas</option>
                    <option value="5_estrelas">Luxo / 5 estrelas</option>
                    <option value="resort_all_inclusive">Resort all inclusive</option>
                    <option value="indiferente">Melhor oportunidade</option>
                  </select>
                </label>
                <label className={labelClassName}>Pedido especial
                  <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} placeholder="Lua de mel, acessibilidade, bagagem..." rows={4} className="mt-2 w-full resize-y rounded-xl border border-[#0c2340]/15 bg-[#fbfbfa] px-4 py-3 text-sm font-medium outline-none focus:border-[#168ac1] focus:ring-4 focus:ring-[#38bdf8]/10" />
                </label>
              </div>
            </section>

            {!clientId && (
              <section className="border-b border-[#0c2340]/10 p-5 sm:p-7">
                <div className="mb-5 flex items-center gap-3"><UserRound className="h-5 w-5 text-[#128765]" /><div><h2 className="text-lg font-black text-[#0c2340]">Seus dados</h2><p className="text-xs text-neutral-500">Não é necessário criar conta para pedir o orçamento.</p></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={`${labelClassName} sm:col-span-2`}>Nome completo<input name="nome" value={formData.nome} onChange={handleChange} autoComplete="name" required className={`${fieldClassName} mt-2`} /></label>
                  <label className={labelClassName}>E-mail<div className="relative mt-2"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#128765]" /><input type="email" name="email" value={formData.email} onChange={handleChange} autoComplete="email" required className={iconFieldClassName} /></div></label>
                  <label className={labelClassName}>Telefone<div className="relative mt-2"><Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#128765]" /><input  type="tel" name="telefone" value={formData.telefone} inputMode="numeric"
onChange={(e) => setFormData(prev => ({ ...prev, telefone: maskPhone(e.target.value) }))} autoComplete="tel" placeholder="(00) 00000-0000" maxLength={15} required className={iconFieldClassName} /></div></label>
                </div>
              </section>
            )}

            <div className="bg-[#f8fafb] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-7">
              <p className="mb-4 text-xs leading-5 text-neutral-500 sm:mb-0">Retorno estimado em até 48 horas úteis.</p>
              <button type="submit" disabled={loading || packageLoading} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#0c2340] px-6 text-sm font-black text-white shadow-[0_10px_24px_rgba(12,35,64,0.2)] transition hover:bg-[#168ac1] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                {loading ? <><Loader2 className="h-5 w-5 animate-spin" />Processando...</> : <><Send className="h-4 w-4" />Solicitar orçamento</>}
              </button>
            </div>
          </div>

          <aside className="hidden rounded-[24px] bg-[#0c2340] p-6 text-white shadow-[0_18px_50px_rgba(12,35,64,0.16)] lg:sticky lg:top-24 lg:block">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#76d3f5]">Resumo da viagem</p>
            <div className="mt-6 border-b border-white/15 pb-5">
              <p className="truncate text-sm font-bold">{formData.origem || 'Origem'}</p>
              <p className="my-1 text-xs text-white/45">para</p>
              <p className="truncate text-sm font-bold">{formData.destino || 'Destino'}</p>
            </div>
            <dl className="divide-y divide-white/10 text-sm">
              <div className="flex items-center justify-between gap-3 py-4"><dt className="text-white/55">Datas</dt><dd className="text-right font-bold">{formatTravelDate(formData.data_ida)} · {formatTravelDate(formData.data_volta)}</dd></div>
              <div className="flex items-center justify-between gap-3 py-4"><dt className="text-white/55">Viajantes</dt><dd className="font-bold">{totalTravelers}</dd></div>
              <div className="flex items-center justify-between gap-3 py-4"><dt className="text-white/55">Hospedagem</dt><dd className="text-right font-bold">{accommodationLabels[formData.preferencia_hospedagem]}</dd></div>
              {selectedPackage && <div className="flex items-center justify-between gap-3 py-4"><dt className="text-white/55">Referência</dt><dd className="max-w-[9rem] text-right text-xs font-bold">{selectedPackage.titulo}</dd></div>}
            </dl>
          </aside>
        </form>
      </main>
    </div>
  );
}
