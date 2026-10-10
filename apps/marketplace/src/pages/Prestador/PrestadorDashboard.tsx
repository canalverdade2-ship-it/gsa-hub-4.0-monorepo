import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  DollarSign,
  FileText,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  LogOut,
  Menu,
  Tag,
  Ticket,
  User,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { providerOperations } from '../../lib/providerOperations';
import { isProviderBlocked, isProviderPending, providerStatusLabel } from '../../lib/providerStatus';
import { logService } from '../../lib/logService';
import { maskCEP } from '../../lib/utils';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { useAppLocation } from '../../routing/useAppLocation';
import { navigate } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';
import { UniversalNotificationBell } from '../../components/ui/UniversalNotificationBell';
import { Modal } from '../../components/ui/Modal';
import { PrestadorDemandas } from '../../components/prestador/PrestadorDemandas';
import { PrestadorFinanceiro } from '../../components/prestador/PrestadorFinanceiro';
import { PrestadorAgenda } from '../../components/prestador/PrestadorAgenda';
import { PrestadorDocumentos } from '../../components/prestador/PrestadorDocumentos';
import { PrestadorVouchers } from '../../components/prestador/PrestadorVouchers';
import { PrestadorPremios } from '../../components/prestador/PrestadorPremios';
import { PrestadorPromocoes } from '../../components/prestador/PrestadorPromocoes';
import { PrestadorSuporte } from '../../components/prestador/PrestadorSuporte';

interface PrestadorDashboardProps {
  prestadorId: string;
  onLogout: () => void;
}

type ProviderTab =
  | 'dashboard'
  | 'demandas'
  | 'agenda'
  | 'financeiro'
  | 'vouchers'
  | 'premios'
  | 'promocoes'
  | 'perfil'
  | 'documentos'
  | 'suporte';

type MenuItem = {
  id: ProviderTab;
  label: string;
  icon: typeof LayoutDashboard;
  count: number;
  locked: boolean;
  path: string;
  accent: string;
};

const normalizeTab = (value?: string): ProviderTab => {
  if (value === 'documents') return 'documentos';
  if (value === 'support') return 'suporte';
  const allowed: ProviderTab[] = ['dashboard', 'demandas', 'agenda', 'financeiro', 'vouchers', 'premios', 'promocoes', 'perfil', 'documentos', 'suporte'];
  return allowed.includes(value as ProviderTab) ? value as ProviderTab : 'dashboard';
};

export function PrestadorDashboard({ prestadorId, onLogout }: PrestadorDashboardProps) {
  const route = useAppLocation();
  const activeTab = normalizeTab(route.module);
  const activeItemId = route.itemId;
  const {
    pendencies,
    notifications,
    unreadNotifications,
    prestador,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refreshCounts,
  } = useProviderNotifications();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [saldo, setSaldo] = useState(0);
  const [metrics, setMetrics] = useState({ demandasConcluidas: 0, agendamentosConcluidos: 0, documentosAprovados: 0 });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ telefone: '', cep: '', numero: '', area_servico: '' });
  const [requestField, setRequestField] = useState<{ label: string; value: string } | null>(null);
  const [requestValue, setRequestValue] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);

  const blocked = isProviderBlocked(prestador?.status);
  const pending = isProviderPending(prestador?.status);

  useEffect(() => {
    const container = document.getElementById('provider-main-scroll');
    container?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab, activeItemId]);

  useEffect(() => {
    if (!prestador) return;
    setProfileForm({
      telefone: prestador.telefone || '',
      cep: prestador.cep || '',
      numero: prestador.numero || '',
      area_servico: prestador.area_servico || '',
    });
  }, [prestador]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snapshot = await providerOperations.dashboardSnapshot();
        if (cancelled) return;
        setSaldo(Number(snapshot?.saldo || 0));
        setMetrics({
          demandasConcluidas: Number(snapshot?.demandas_concluidas || 0),
          agendamentosConcluidos: Number(snapshot?.agendamentos_concluidos || 0),
          documentosAprovados: Number(snapshot?.documentos_aprovados || 0),
        });
      } catch (loadError) {
        console.error('Erro ao carregar indicadores do prestador:', loadError);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [prestadorId, pendencies.moduleDemandas, pendencies.moduleFinanceiro, pendencies.moduleDocumentos, pendencies.moduleAgenda]);

  const menuItems = useMemo<MenuItem[]>(() => [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard, count: 0, locked: false, path: routes.provider.dashboard(), accent: 'text-neutral-700' },
    { id: 'demandas', label: 'Demandas', icon: Briefcase, count: pendencies.moduleDemandas, locked: blocked, path: routes.provider.demands(), accent: 'text-blue-600' },
    { id: 'agenda', label: 'Agenda', icon: Calendar, count: pendencies.moduleAgenda, locked: blocked, path: routes.provider.agenda(), accent: 'text-indigo-600' },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign, count: pendencies.moduleFinanceiro, locked: blocked, path: routes.provider.financeiro(), accent: 'text-emerald-600' },
    { id: 'vouchers', label: 'Vouchers', icon: Ticket, count: pendencies.moduleVouchers, locked: blocked, path: routes.provider.vouchers(), accent: 'text-pink-600' },
    { id: 'premios', label: 'Prêmios', icon: Gift, count: pendencies.modulePremios, locked: blocked, path: routes.provider.premios(), accent: 'text-rose-600' },
    { id: 'promocoes', label: 'Promoções', icon: Tag, count: pendencies.modulePromocoes, locked: blocked, path: routes.provider.promocoes(), accent: 'text-fuchsia-600' },
    { id: 'perfil', label: 'Perfil', icon: User, count: 0, locked: false, path: '/prestador/perfil', accent: 'text-violet-600' },
    { id: 'documentos', label: 'Documentos', icon: FileText, count: pendencies.moduleDocumentos, locked: false, path: routes.provider.documents(), accent: 'text-orange-600' },
    { id: 'suporte', label: 'Suporte', icon: LifeBuoy, count: pendencies.moduleSuporte, locked: false, path: routes.provider.support(), accent: 'text-sky-600' },
  ], [blocked, pendencies]);

  const currentMenu = menuItems.find((item) => item.id === activeTab) || menuItems[0];

  const openTab = (item: MenuItem) => {
    if (item.locked) {
      toast.error('Este módulo está bloqueado enquanto o cadastro não estiver ativo.');
      return;
    }
    navigate(item.path);
    setIsMobileMenuOpen(false);
  };

  const handleNotificationNavigation = (module?: string, _tab?: string, itemId?: string) => {
    const normalized = normalizeTab(module);
    const item = menuItems.find((entry) => entry.id === normalized) || menuItems[0];
    if (item.locked) {
      toast.error('A notificação pertence a um módulo temporariamente bloqueado.');
      return;
    }
    if (itemId) {
      if (normalized === 'demandas') navigate(routes.provider.demand(itemId));
      else if (normalized === 'agenda') navigate(routes.provider.agendamento(itemId));
      else if (normalized === 'documentos') navigate(routes.provider.document(itemId));
      else if (normalized === 'vouchers') navigate(routes.provider.voucher(itemId));
      else if (normalized === 'premios') navigate(routes.provider.premio(itemId));
      else if (normalized === 'promocoes') navigate(routes.provider.promocao(itemId));
      else if (normalized === 'suporte') navigate(routes.provider.ticket(itemId));
      else navigate(item.path);
    } else {
      navigate(item.path);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingProfile) return;
    setIsSavingProfile(true);
    try {
      await providerOperations.updateProfile(profileForm);
      await logService.logAction({
        ator_tipo: 'prestador',
        ator_id: prestadorId,
        ator_nome: prestador?.nome_razao,
        acao: 'EDITAR_PERFIL',
        detalhes: 'Atualizou telefone, CEP, número ou área de serviço pelo portal seguro.',
      });
      await refreshCounts();
      setIsEditingProfile(false);
      toast.success('Perfil atualizado com sucesso.');
    } catch (saveError: any) {
      toast.error(saveError?.message || 'Não foi possível atualizar o perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const submitChangeRequest = async () => {
    if (!requestField || !requestValue.trim() || !requestReason.trim() || requestSubmitting) return;
    const fieldMap: Record<string, 'nome_razao' | 'documento' | 'email'> = {
      'Nome / Razão Social': 'nome_razao',
      Documento: 'documento',
      'E-mail': 'email',
    };
    const field = fieldMap[requestField.label];
    if (!field) {
      toast.error('Campo cadastral inválido.');
      return;
    }
    setRequestSubmitting(true);
    try {
      await providerOperations.requestProfileChange(field, requestValue.trim(), requestReason.trim());
      toast.success('Solicitação enviada para análise.');
      setRequestField(null);
      setRequestValue('');
      setRequestReason('');
    } catch (submitError: any) {
      toast.error(submitError?.message || 'Não foi possível enviar a solicitação.');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const openPendingSupport = async () => {
    if (!prestador || supportSubmitting) return;
    setSupportSubmitting(true);
    try {
      await providerOperations.createTicket(
        'Análise de cadastro pendente',
        `Solicito informações sobre a análise do cadastro de ${prestador.nome_razao}.`,
        true,
      );
      navigate(routes.provider.support());
    } catch (supportError: any) {
      toast.error(supportError?.message || 'Não foi possível abrir o suporte.');
    } finally {
      setSupportSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f8f7f5]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent" /></div>;
  }

  if (!prestador) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f7f5] p-6">
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-xl font-black">Cadastro não encontrado</h1>
          <p className="mt-2 text-sm text-neutral-500">{error || 'A sessão não possui um cadastro de prestador válido.'}</p>
          <button onClick={onLogout} className="mt-6 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-bold text-white">Voltar ao login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-hidden bg-[#f8f7f5]">
      <AnimatePresence>
        {isMobileMenuOpen && <motion.button aria-label="Fechar menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />}
      </AnimatePresence>

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-black/5 bg-white transition-transform lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-20 items-center justify-between px-7">
          <div><p className="text-lg font-black">Grupo GSA</p><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400">Portal do Prestador</p></div>
          <button aria-label="Fechar menu" onClick={() => setIsMobileMenuOpen(false)} className="rounded-full p-2 hover:bg-neutral-100 lg:hidden"><X className="h-5 w-5" /></button>
        </div>

        <div className="mx-5 rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5">
          <p className="truncate font-bold">{prestador.nome_razao}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Prestador</span>
            <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${prestador.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : pending ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{providerStatusLabel(prestador.status)}</span>
          </div>
        </div>

        <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-4 pb-5" aria-label="Módulos do prestador">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => openTab(item)} aria-current={active ? 'page' : undefined} className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold transition ${active ? 'bg-neutral-900 text-white' : item.locked ? 'cursor-not-allowed text-neutral-300' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                <span className="flex items-center gap-3"><Icon className={`h-4 w-4 ${active ? 'text-white' : item.locked ? 'text-neutral-300' : item.accent}`} />{item.label}</span>
                <span className="flex items-center gap-2">{item.count > 0 && !item.locked && <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white text-neutral-900' : 'bg-red-500 text-white'}`}>{item.count}</span>}{item.locked && <Lock className="h-4 w-4" />}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-neutral-100 p-4"><button onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Sair do portal</button></div>
      </aside>

      <main id="provider-main-scroll" className="h-screen flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between bg-[#f8f7f5]/90 px-5 backdrop-blur lg:px-10">
          <div className="flex items-center gap-3">
            <button aria-label="Abrir menu" onClick={() => setIsMobileMenuOpen(true)} className="rounded-full bg-white p-2.5 shadow-sm ring-1 ring-black/5 lg:hidden"><Menu className="h-5 w-5" /></button>
            <div><h1 className="text-2xl font-black tracking-tight">{currentMenu.label}</h1><p className="hidden text-xs text-neutral-400 sm:block">Área segura do prestador</p></div>
          </div>
          <UniversalNotificationBell variant="provider" notifications={notifications} unreadCount={unreadNotifications} onMarkAsRead={markAsRead} onMarkAllAsRead={markAllAsRead} onNavigate={handleNotificationNavigation} />
        </header>

        <div className="p-5 lg:p-10">
          {activeTab !== 'dashboard' && <button onClick={() => navigate(routes.provider.dashboard())} className="mb-5 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm ring-1 ring-black/5"><ArrowLeft className="h-4 w-4" />Voltar ao início</button>}

          {pending && activeTab !== 'suporte' && (
            <div className="mb-6 flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
              <div className="flex-1"><h2 className="font-black text-amber-900">Cadastro em análise</h2><p className="mt-1 text-sm text-amber-800">Demandas, agenda, financeiro e benefícios serão liberados após a aprovação. Perfil, documentos e suporte continuam disponíveis.</p><button disabled={supportSubmitting} onClick={openPendingSupport} className="mt-3 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{supportSubmitting ? 'Abrindo...' : 'Falar com o suporte'}</button></div>
            </div>
          )}

          {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

          <motion.section key={`${activeTab}-${activeItemId || ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                <div><p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-500">Bem-vindo</p><h2 className="mt-2 text-3xl font-black">Olá, {prestador.nome_razao.split(' ')[0]}!</h2><p className="mt-2 text-neutral-500">Acompanhe seus serviços, pagamentos e pendências em um único lugar.</p></div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <MetricCard label="A receber" value={saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} icon={DollarSign} />
                  <MetricCard label="Demandas concluídas" value={String(metrics.demandasConcluidas)} icon={CheckCircle2} />
                  <MetricCard label="Agenda concluída" value={String(metrics.agendamentosConcluidos)} icon={Calendar} />
                  <MetricCard label="Documentos aprovados" value={String(metrics.documentosAprovados)} icon={FileText} />
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                  {menuItems.filter((item) => item.id !== 'dashboard').map((item) => {
                    const Icon = item.icon;
                    return <button key={item.id} onClick={() => openTab(item)} className={`relative flex min-h-32 flex-col items-start justify-between rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md ${item.locked ? 'cursor-not-allowed opacity-50 grayscale' : ''}`}><span className="flex w-full items-start justify-between"><span className="rounded-2xl bg-neutral-50 p-3"><Icon className={`h-6 w-6 ${item.accent}`} /></span>{item.locked ? <Lock className="h-4 w-4 text-neutral-400" /> : item.count > 0 ? <span className="rounded-full bg-red-500 px-2 py-1 text-[10px] font-black text-white">{item.count}</span> : null}</span><span className="font-black">{item.label}</span></button>;
                  })}
                </div>
              </div>
            )}

            {activeTab === 'perfil' && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 lg:p-8">
                <div className="mb-6 flex items-center justify-between"><div><h2 className="text-xl font-black">Informações cadastrais</h2><p className="text-sm text-neutral-500">Campos sensíveis são alterados mediante solicitação.</p></div>{!isEditingProfile && <button onClick={() => setIsEditingProfile(true)} className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white">Editar</button>}</div>
                {isEditingProfile ? (
                  <form onSubmit={saveProfile} className="grid gap-5 md:grid-cols-2">
                    <LockedField label="Nome / Razão Social" value={prestador.nome_razao} onRequest={() => setRequestField({ label: 'Nome / Razão Social', value: prestador.nome_razao })} />
                    <LockedField label="Documento" value={prestador.documento} onRequest={() => setRequestField({ label: 'Documento', value: prestador.documento })} />
                    <LockedField label="E-mail" value={prestador.email || '-'} onRequest={() => setRequestField({ label: 'E-mail', value: prestador.email || '' })} />
                    <InputField label="Telefone / WhatsApp" value={profileForm.telefone} onChange={(value) => setProfileForm((current) => ({ ...current, telefone: value }))} required />
                    <InputField label="CEP" value={profileForm.cep} onChange={(value) => setProfileForm((current) => ({ ...current, cep: maskCEP(value) }))} />
                    <InputField label="Número" value={profileForm.numero} onChange={(value) => setProfileForm((current) => ({ ...current, numero: value }))} />
                    <div className="md:col-span-2"><InputField label="Área de serviço / Especialidade" value={profileForm.area_servico} onChange={(value) => setProfileForm((current) => ({ ...current, area_servico: value }))} /></div>
                    <div className="flex justify-end gap-3 border-t border-neutral-100 pt-5 md:col-span-2"><button type="button" onClick={() => setIsEditingProfile(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-neutral-600 hover:bg-neutral-100">Cancelar</button><button disabled={isSavingProfile} className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isSavingProfile ? 'Salvando...' : 'Salvar alterações'}</button></div>
                  </form>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2"><ReadField label="Nome / Razão Social" value={prestador.nome_razao} /><ReadField label="Documento" value={prestador.documento} /><ReadField label="E-mail" value={prestador.email || '-'} /><ReadField label="Telefone" value={prestador.telefone || '-'} /><ReadField label="Área de serviço" value={prestador.area_servico || '-'} /><ReadField label="Endereço" value={`${prestador.cep ? maskCEP(prestador.cep) : 'CEP não informado'}${prestador.numero ? `, nº ${prestador.numero}` : ''}`} /></div>
                )}
              </div>
            )}

            {activeTab === 'demandas' && <PrestadorDemandas prestadorId={prestadorId} initialItemId={activeItemId} />}
            {activeTab === 'agenda' && <PrestadorAgenda prestadorId={prestadorId} initialItemId={activeItemId} />}
            {activeTab === 'financeiro' && <PrestadorFinanceiro prestadorId={prestadorId} initialItemId={activeItemId} />}
            {activeTab === 'vouchers' && <PrestadorVouchers prestadorId={prestadorId} initialItemId={activeItemId} />}
            {activeTab === 'premios' && <PrestadorPremios prestadorId={prestadorId} initialItemId={activeItemId} />}
            {activeTab === 'promocoes' && <PrestadorPromocoes prestadorId={prestadorId} initialItemId={activeItemId} />}
            {activeTab === 'documentos' && <PrestadorDocumentos prestadorId={prestadorId} initialItemId={activeItemId} />}
            {activeTab === 'suporte' && <PrestadorSuporte prestadorId={prestadorId} initialItemId={activeItemId} />}
          </motion.section>
        </div>
      </main>

      <Modal isOpen={!!requestField} onClose={() => !requestSubmitting && setRequestField(null)} title={`Solicitar alteração: ${requestField?.label || ''}`}>
        <div className="space-y-4"><div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Esta alteração será analisada pela administração antes de ser aplicada.</div><ReadField label="Valor atual" value={requestField?.value || '-'} /><InputField label="Novo valor" value={requestValue} onChange={setRequestValue} required /><div><label className="mb-1 block text-sm font-bold text-neutral-700">Motivo</label><textarea value={requestReason} onChange={(event) => setRequestReason(event.target.value)} className="h-24 w-full rounded-xl border border-neutral-200 p-3 outline-none focus:border-indigo-500" /></div><button disabled={requestSubmitting || !requestValue.trim() || !requestReason.trim()} onClick={submitChangeRequest} className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-black text-white disabled:opacity-50">{requestSubmitting ? 'Enviando...' : 'Enviar solicitação'}</button></div>
      </Modal>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof LayoutDashboard }) {
  return <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5"><div className="flex items-center gap-2 text-neutral-400"><Icon className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">{label}</span></div><p className="mt-3 truncate text-xl font-black text-neutral-900 sm:text-2xl">{value}</p></div>;
}

function ReadField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{label}</p><p className="mt-1 break-words text-base font-bold text-neutral-800">{value}</p></div>;
}

function InputField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <div><label className="mb-1 block text-sm font-bold text-neutral-700">{label}</label><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10" /></div>;
}

function LockedField({ label, value, onRequest }: { label: string; value: string; onRequest: () => void }) {
  return <div className="relative rounded-xl bg-neutral-50 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-400"><Lock className="h-3 w-3" />{label}</div><p className="mt-2 pr-10 font-bold text-neutral-800">{value}</p><button type="button" aria-label={`Solicitar alteração de ${label}`} onClick={onRequest} className="absolute right-3 top-3 rounded-lg bg-white p-2 text-indigo-600 shadow-sm ring-1 ring-black/5">Editar</button></div>;
}
