import { useCallback, useEffect, useState } from 'react';
import { BriefcaseBusiness, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';

const AREAS = ['Comercial & Vendas','Tecnologia & Desenvolvimento','Operações & Logística','Suporte & Relacionamento','Financeiro & Administração'];

interface Vacancy {
  id: string; code: string; title: string; area: string;
  employment_type: 'clt' | 'estagio'; work_mode: 'presencial' | 'hibrido' | 'remoto';
  location: string; description: string; requirements: string[];
  salary_min?: number | null; salary_max?: number | null;
  status: 'draft' | 'published' | 'closed'; closes_at?: string | null;
}

type VacancyForm = {
  code: string; title: string; area: string;
  employment_type: Vacancy['employment_type']; work_mode: Vacancy['work_mode'];
  location: string; description: string; requirements: string;
  salary_min: string; salary_max: string; status: Vacancy['status']; closes_at: string;
};
const emptyForm: VacancyForm = {
  code: '', title: '', area: AREAS[0], employment_type: 'clt',
  work_mode: 'presencial', location: '', description: '', requirements: '',
  salary_min: '', salary_max: '', status: 'draft', closes_at: '',
};

export function CareerVacanciesManager() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Vacancy | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callAdminRpc<Vacancy[]>('gsa_admin_list_career_vacancies');
      setVacancies(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error(error); toast.error('Não foi possível carregar as vagas.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const startNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const startEdit = (vacancy: Vacancy) => {
    setEditing(vacancy);
    setForm({
      code: vacancy.code, title: vacancy.title, area: vacancy.area,
      employment_type: vacancy.employment_type, work_mode: vacancy.work_mode,
      location: vacancy.location, description: vacancy.description,
      requirements: (vacancy.requirements || []).join('\n'),
      salary_min: vacancy.salary_min?.toString() || '', salary_max: vacancy.salary_max?.toString() || '',
      status: vacancy.status, closes_at: vacancy.closes_at ? vacancy.closes_at.slice(0, 16) : '',
    });
    setOpen(true);
  };
  const save = async () => {
    if (form.title.trim().length < 3 || form.description.trim().length < 20 || !form.location.trim()) {
      toast.error('Preencha título, localização e uma descrição completa.'); return;
    }
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_upsert_career_vacancy', {
        p_vacancy_id: editing?.id || null,
        p_payload: {
          ...form,
          requirements: form.requirements.split('\n').map((item) => item.trim()).filter(Boolean),
          salary_min: form.salary_min || null, salary_max: form.salary_max || null,
          closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
        },
      });
      toast.success(form.status === 'published' ? 'Vaga salva e publicada.' : 'Vaga salva.');
      setOpen(false); await load();
    } catch (error) { console.error(error); toast.error('Não foi possível salvar a vaga.'); }
    finally { setSaving(false); }
  };

  return <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">Vagas estruturadas</p><h2 className="mt-1 text-lg font-black text-neutral-900">Publicação de oportunidades</h2></div>
      <div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl bg-neutral-100 p-2.5" title="Atualizar"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white"><Plus className="h-4 w-4" /> Nova vaga</button></div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {vacancies.map((vacancy) => <button key={vacancy.id} onClick={() => startEdit(vacancy)} className="rounded-xl border border-neutral-200 p-4 text-left hover:border-emerald-400">
        <div className="flex items-start justify-between gap-2"><BriefcaseBusiness className="h-5 w-5 text-emerald-600" /><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${vacancy.status === 'published' ? 'bg-emerald-100 text-emerald-700' : vacancy.status === 'closed' ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}>{vacancy.status === 'published' ? 'Publicada' : vacancy.status === 'closed' ? 'Encerrada' : 'Rascunho'}</span></div>
        <p className="mt-3 text-sm font-black text-neutral-900">{vacancy.title}</p><p className="mt-1 text-[11px] text-neutral-500">{vacancy.code} • {vacancy.area}</p><p className="mt-2 text-[11px] font-semibold text-neutral-600">{vacancy.location} • {vacancy.work_mode}</p><span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><Pencil className="h-3 w-3" /> Editar</span>
      </button>)}
      {!loading && vacancies.length === 0 && <p className="col-span-full py-6 text-center text-xs text-neutral-500">Nenhuma vaga cadastrada. O banco de talentos continua ativo.</p>}
    </div>
    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6">
      <div className="flex items-center justify-between"><h3 className="text-xl font-black">{editing ? 'Editar vaga' : 'Nova vaga'}</h3><button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input label="Código (automático se vazio)" value={form.code} onChange={(value) => setForm({ ...form, code: value })} />
        <Input label="Título" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
        <Select label="Área" value={form.area} options={AREAS.map((v) => [v,v])} onChange={(value) => setForm({ ...form, area: value })} />
        <Select label="Modalidade" value={form.employment_type} options={[["clt","CLT"],["estagio","Estágio"]]} onChange={(value) => setForm({ ...form, employment_type: value as 'clt'|'estagio' })} />
        <Select label="Modelo" value={form.work_mode} options={[["presencial","Presencial"],["hibrido","Híbrido"],["remoto","Remoto"]]} onChange={(value) => setForm({ ...form, work_mode: value as 'presencial'|'hibrido'|'remoto' })} />
        <Input label="Localização" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
        <Input  label="Salário mínimo" type="number" value={form.salary_min} inputMode="numeric" onChange={(value) => setForm({ ...form, salary_min: value })} />
        <Input  label="Salário máximo" type="number" value={form.salary_max} inputMode="numeric" onChange={(value) => setForm({ ...form, salary_max: value })} />
        <div className="sm:col-span-2"><TextArea label="Descrição" value={form.description} onChange={(value) => setForm({ ...form, description: value })} /></div>
        <div className="sm:col-span-2"><TextArea label="Requisitos (um por linha)" value={form.requirements} onChange={(value) => setForm({ ...form, requirements: value })} /></div>
        <Select label="Status" value={form.status} options={[["draft","Rascunho"],["published","Publicada"],["closed","Encerrada"]]} onChange={(value) => setForm({ ...form, status: value as 'draft'|'published'|'closed' })} />
        <Input label="Receber candidaturas até" type="datetime-local" value={form.closes_at} onChange={(value) => setForm({ ...form, closes_at: value })} />
      </div>
      <div className="mt-6 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-xl bg-neutral-100 px-4 py-2.5 text-xs font-bold">Cancelar</button><button disabled={saving} onClick={() => void save()} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar vaga'}</button></div>
    </div></div>}
  </section>;
}

function Input({ label, value, onChange, type='text' }: { label:string; value:string; onChange:(v:string)=>void; type?:string; inputMode?:string }) { return <label><span className="mb-1 block text-[11px] font-bold text-neutral-600">{label}</span><input type={type} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-500" /></label>; }
function TextArea({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) { return <label><span className="mb-1 block text-[11px] font-bold text-neutral-600">{label}</span><textarea rows={4} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-neutral-200 p-3 text-xs outline-none focus:border-emerald-500" /></label>; }
function Select({ label, value, options, onChange }: { label:string; value:string; options:string[][]; onChange:(v:string)=>void }) { return <label><span className="mb-1 block text-[11px] font-bold text-neutral-600">{label}</span><select value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-500">{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>; }
