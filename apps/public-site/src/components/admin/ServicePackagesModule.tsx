import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Boxes, Check, Edit3, Loader2, PackagePlus, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { servicePackages as defaultPackages } from '../../data/publicServiceCatalog';
import {
  CatalogPackage,
  CatalogService,
  deleteAdminServicePackage,
  fetchAdminServiceCatalog,
  importDefaultServiceCatalog,
  saveAdminServicePackage,
} from '../../lib/serviceCatalog';
import { logService } from '../../lib/logService';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

type PackageFormValue = {
  title: string;
  subtitle: string;
  description: string;
  audience: 'pf' | 'pj' | 'ambos';
  serviceIds: string[];
  status: 'ativo' | 'inativo';
  publicVisible: boolean;
  quoteAvailable: boolean;
  order: number;
};

const emptyForm: PackageFormValue = {
  title: '',
  subtitle: '',
  description: '',
  audience: 'pf',
  serviceIds: [],
  status: 'ativo',
  publicVisible: true,
  quoteAvailable: true,
  order: 0,
};

export function ServicePackagesModule({
  activeSubTab,
  colaboradorId,
  colaboradorNome,
}: {
  activeSubTab?: 'ativos' | 'inativos';
  colaboradorId?: string;
  colaboradorNome?: string;
}) {
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CatalogPackage | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PackageFormValue>(emptyForm);
  const confirmHook = useConfirm();
  const { confirm } = confirmHook;
  const status = activeSubTab === 'inativos' ? 'inativo' : 'ativo';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await fetchAdminServiceCatalog();
      setPackages(snapshot.packages);
      setServices(snapshot.services);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar os pacotes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useRealtimeSubscription([
    { table: 'servicos', onChange: load, debounceMs: 300 },
    { table: 'servicos_pacotes', onChange: load, debounceMs: 300 },
  ], [load]);

  const visiblePackages = useMemo(() => packages.filter((item) => {
    const matchesStatus = item.status === status;
    const term = search.trim().toLowerCase();
    return matchesStatus && (!term || `${item.title} ${item.subtitle} ${item.code || ''}`.toLowerCase().includes(term));
  }), [packages, search, status]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, status, order: packages.length });
    setModalOpen(true);
  };

  const openEdit = (item: CatalogPackage) => {
    setEditing(item);
    setForm({
      title: item.title,
      subtitle: item.subtitle || '',
      description: item.description || '',
      audience: item.audience === 'PJ' ? 'pj' : item.audience === 'AMBOS' ? 'ambos' : 'pf',
      serviceIds: item.serviceIds || item.services.map((service) => service.id),
      status: item.status,
      publicVisible: item.publicVisible,
      quoteAvailable: item.quoteAvailable,
      order: item.order || 0,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Informe o nome do pacote.');
    if (!form.description.trim()) return toast.error('Informe a descrição do pacote.');
    if (form.serviceIds.length === 0) return toast.error('Selecione ao menos um serviço.');

    setSaving(true);
    try {
      await saveAdminServicePackage(editing?.id || null, form);
      await logService.logAction({
        acao: editing ? 'EDITAR_PACOTE_SERVICOS' : 'CRIAR_PACOTE_SERVICOS',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `${editing ? 'Editou' : 'Cadastrou'} o pacote de serviços: ${form.title}`,
      });
      toast.success(editing ? 'Pacote atualizado.' : 'Pacote cadastrado.');
      setModalOpen(false);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar o pacote.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: CatalogPackage) => {
    if (!await confirm({ title: 'Atenção', message: `Excluir o pacote “${item.title}”?` })) return;
    try {
      await deleteAdminServicePackage(item.id);
      toast.success('Pacote excluído.');
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível excluir o pacote.');
    }
  };

  const importDefaults = async () => {
    setImporting(true);
    try {
      const payload = defaultPackages.map((item) => ({
        audience: item.audience.toLowerCase(),
        title: item.title,
        subtitle: item.subtitle,
        description: item.description,
        services: item.services,
      }));
      const result = await importDefaultServiceCatalog(payload);
      toast.success(`${result.importedPackages} pacotes do catálogo atual foram importados.`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível importar o catálogo atual.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pacote..." className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-indigo-500" />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={importDefaults} disabled={importing} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-indigo-700 disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Importar catálogo atual
          </button>
          <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-6 py-3 text-xs font-black uppercase tracking-wider text-white">
            <PackagePlus className="h-4 w-4" /> Novo pacote
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div>
      ) : visiblePackages.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center">
          <Boxes className="mx-auto h-10 w-10 text-neutral-300" />
          <h2 className="mt-4 font-black text-neutral-900">Nenhum pacote {status === 'ativo' ? 'ativo' : 'inativo'}</h2>
          <p className="mt-2 text-sm text-neutral-500">Cadastre um pacote ou importe o catálogo exibido atualmente no site.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visiblePackages.map((item) => (
            <article key={item.id} className="flex flex-col rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700">{item.audience === 'PF' ? 'Pessoa física' : item.audience === 'PJ' ? 'Pessoa jurídica' : 'Todos'}</span>
                <span className="font-mono text-[10px] text-neutral-400">{item.code}</span>
              </div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">{item.subtitle}</p>
              <h2 className="mt-2 text-xl font-black text-neutral-950">{item.title}</h2>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-500">{item.description}</p>
              <div className="mt-5 space-y-2">
                {item.services.slice(0, 4).map((service) => <div key={service.id} className="flex items-center gap-2 text-xs text-neutral-600"><Check className="h-3.5 w-3.5 text-emerald-600" />{service.name}</div>)}
                {item.services.length > 4 && <p className="text-xs font-bold text-neutral-400">+ {item.services.length - 4} serviços</p>}
              </div>
              <div className="mt-auto flex gap-2 pt-6">
                <button type="button" onClick={() => openEdit(item)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-950 py-3 text-xs font-black text-white"><Edit3 className="h-4 w-4" /> Editar</button>
                <button type="button" onClick={() => void remove(item)} aria-label={`Excluir ${item.title}`} className="rounded-xl border border-red-200 bg-red-50 px-4 text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar pacote de serviços' : 'Novo pacote de serviços'} size="wide">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do pacote" value={form.title} onChange={(title) => setForm({ ...form, title })} />
            <Field label="Subtítulo / categoria" value={form.subtitle} onChange={(subtitle) => setForm({ ...form, subtitle })} />
          </div>
          <label className="grid gap-2 text-sm font-bold text-neutral-700">Descrição<textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none focus:border-indigo-500" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-neutral-700">Público<select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as PackageFormValue['audience'] })} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"><option value="pf">Pessoa física</option><option value="pj">Pessoa jurídica</option><option value="ambos">Ambos</option></select></label>
            <label className="grid gap-2 text-sm font-bold text-neutral-700">Ordem<input  type="number" value={form.order} inputMode="numeric" onChange={(event) => setForm({ ...form, order: Number(event.target.value) || 0 })} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3" /></label>
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-neutral-700">Serviços incluídos</p><span className="text-xs font-bold text-indigo-600">{form.serviceIds.length} selecionados</span></div>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              {services.filter((service) => service.status === 'ativo').map((service) => {
                const selected = form.serviceIds.includes(service.id);
                return <label key={service.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selected ? 'border-indigo-300 bg-indigo-50' : 'border-neutral-200 bg-white'}`}><input type="checkbox" checked={selected} onChange={() => setForm({ ...form, serviceIds: selected ? form.serviceIds.filter((id) => id !== service.id) : [...form.serviceIds, service.id] })} /><span className="flex-1 text-sm font-bold text-neutral-800">{service.name}</span><Users className="h-4 w-4 text-neutral-400" /></label>;
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Toggle label="Ativo" checked={form.status === 'ativo'} onChange={(checked) => setForm({ ...form, status: checked ? 'ativo' : 'inativo' })} />
            <Toggle label="Exibir no site" checked={form.publicVisible} onChange={(publicVisible) => setForm({ ...form, publicVisible })} />
            <Toggle label="Aceitar orçamento" checked={form.quoteAvailable} onChange={(quoteAvailable) => setForm({ ...form, quoteAvailable })} />
          </div>
          <div className="flex gap-3 pt-3"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600">Cancelar</button><button type="button" onClick={() => void submit()} disabled={saving} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar pacote'}</button></div>
        </div>
      </Modal>
      <ConfirmDialog {...confirmHook} />
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-neutral-700">{label}<input required value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none focus:border-indigo-500" /></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-sm font-bold text-neutral-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
