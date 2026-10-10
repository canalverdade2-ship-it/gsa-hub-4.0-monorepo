import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Eye,
  EyeOff,
  Globe2,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  Gift,
  Ticket,
  Link2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { listAdminPartners, savePartner, setPartnerStatus } from '../../features/partners/service';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import {
  PARTNER_MODE_LABELS,
  PARTNER_STATUS_LABELS,
  type Partner,
  type PartnerFormData,
  type PartnerServiceMode,
  type PartnerStatus,
} from '../../features/partners/types';
import { maskCEP, maskPhone } from '../../lib/utils';
import { consultarCEP } from '../../utils/viaCep';
import { Modal } from '../ui/Modal';

const EMPTY_FORM: PartnerFormData = {
  slug: '',
  name: '',
  legal_name: '',
  category: '',
  short_description: '',
  description: '',
  logo_url: '',
  cover_url: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  instagram: '',
  facebook: '',
  linkedin: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  zip_code: '',
  maps_url: '',
  business_hours: '',
  service_mode: 'hibrido',
  service_regions: [],
  services: [],
  products: [],
  benefits: '',
  contact_person: '',
  internal_notes: '',
  featured: false,
  display_order: 0,
  status: 'em_analise',
  redemption_has_coupon: false,
  redemption_coupon_code: '',
  redemption_has_voucher: false,
  redemption_has_link: true,
  redemption_link: '',
  redemption_auto_redirect: false,
  redemption_instructions: '',
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function listToText(items: string[]) {
  return items.join('\n');
}

function textToList(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function partnerToForm(partner: Partner): PartnerFormData {
  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...form } = partner;
  return form;
}

const STATUS_TABS: Array<{ value: 'todos' | PartnerStatus; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'ativo', label: 'Ativos' },
  { value: 'inativo', label: 'Inativos' },
  { value: 'encerrado', label: 'Encerrados' },
  { value: 'excluido', label: 'Excluídos' },
];

export function PartnersAdminModule() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'todos' | PartnerStatus>('todos');
  const [editing, setEditing] = useState<Partner | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setPartners(await listAdminPartners());
    } catch (error) {
      console.error('Erro ao carregar parceiros:', error);
      toast.error('Não foi possível carregar os parceiros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useRealtimeSubscription({
    table: 'parceiros',
    onChange: () => void load(),
    debounceMs: 300,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return partners.filter((partner) => {
      const statusMatches = statusTab === 'todos' || partner.status === statusTab;
      const termMatches = !term || [partner.name, partner.category, partner.city, partner.state, partner.short_description]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(term);
      return statusMatches && termMatches;
    });
  }, [partners, search, statusTab]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (partner: Partner) => {
    setEditing(partner);
    setModalOpen(true);
  };

  const changeStatus = async (partner: Partner, status: PartnerStatus) => {
    if (status === 'excluido') {
      const ok = window.confirm(`Deseja realmente excluir ${partner.name} da operação?`);
      if (!ok) return;
    }
    try {
      await setPartnerStatus(partner.id, status);
      toast.success(`Parceiro alterado para ${PARTNER_STATUS_LABELS[status]}.`);
      await load();
    } catch (error) {
      console.error('Erro ao alterar parceiro:', error);
      toast.error('Não foi possível alterar o status.');
    }
  };

  return (
    <div className="space-y-6 p-2 sm:p-3">
      <header className="flex flex-col gap-4 rounded-3xl bg-neutral-950 p-6 text-white md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#d8bd73]">Rede institucional</p>
          <h1 className="mt-2 text-3xl font-black">Parceiros</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Cadastre empresas e profissionais, controle a publicação e organize as informações exibidas na página pública.</p>
        </div>
        <button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d8bd73] px-5 py-3 text-sm font-black text-neutral-950 shadow-lg"><Plus className="h-5 w-5" /> Novo parceiro</button>
      </header>

      <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]">
        <label className="relative">
          <span className="sr-only">Pesquisar parceiros</span>
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por nome, categoria ou localização" className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" />
        </label>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => <button key={tab.value} type="button" onClick={() => setStatusTab(tab.value)} className={`whitespace-nowrap rounded-xl px-4 py-3 text-xs font-black transition ${statusTab === tab.value ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{tab.label}</button>)}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-300 bg-white py-20 text-center"><Building2 className="mx-auto h-12 w-12 text-neutral-300" /><h2 className="mt-4 text-lg font-black">Nenhum parceiro encontrado</h2><p className="mt-2 text-sm text-neutral-500">Cadastre um novo parceiro ou altere os filtros.</p></div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((partner) => (
            <article key={partner.id} className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
              <div className="relative h-40 bg-neutral-900">
                {partner.cover_url || partner.logo_url ? <img src={partner.cover_url || partner.logo_url || ''} alt="" className={`h-full w-full ${partner.cover_url ? 'object-cover' : 'object-contain p-8'}`} referrerPolicy="no-referrer" /> : <div className="flex h-full items-center justify-center text-[#d8bd73]"><Building2 className="h-16 w-16 opacity-70" /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${partner.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : partner.status === 'em_analise' ? 'bg-amber-100 text-amber-700' : partner.status === 'excluido' ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-700'}`}>{PARTNER_STATUS_LABELS[partner.status]}</span>
                {partner.featured && <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#d8bd73] px-3 py-1 text-[10px] font-black uppercase text-neutral-950"><ShieldCheck className="h-3 w-3" /> Destaque</span>}
              </div>
              <div className="p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">{partner.category}</p>
                <h2 className="mt-2 text-xl font-black">{partner.name}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-500">{partner.short_description}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-neutral-500">
                  {(partner.city || partner.state) && <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1.5"><MapPin className="h-3.5 w-3.5" />{[partner.city, partner.state].filter(Boolean).join(' - ')}</span>}
                  <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1.5"><Users className="h-3.5 w-3.5" />{PARTNER_MODE_LABELS[partner.service_mode]}</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                  <button type="button" onClick={() => openEdit(partner)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700"><Pencil className="h-4 w-4" /> Editar</button>
                  {partner.status !== 'ativo' && partner.status !== 'excluido' && <button type="button" onClick={() => changeStatus(partner, 'ativo')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><Eye className="h-4 w-4" /> Ativar</button>}
                  {partner.status === 'ativo' && <button type="button" onClick={() => changeStatus(partner, 'inativo')} className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-700"><EyeOff className="h-4 w-4" /> Desativar</button>}
                  {partner.status !== 'excluido' && <button type="button" onClick={() => changeStatus(partner, 'excluido')} className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700"><Trash2 className="h-4 w-4" /> Excluir</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <PartnerFormModal partner={editing} open={modalOpen} onClose={() => setModalOpen(false)} onSaved={async () => { setModalOpen(false); await load(); }} />
    </div>
  );
}

function PartnerFormModal({ partner, open, onClose, onSaved }: { partner: Partner | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<PartnerFormData>(EMPTY_FORM);
  const [servicesText, setServicesText] = useState('');
  const [productsText, setProductsText] = useState('');
  const [regionsText, setRegionsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const value = partner ? partnerToForm(partner) : EMPTY_FORM;
    setForm({ ...value });
    setServicesText(listToText(value.services));
    setProductsText(listToText(value.products));
    setRegionsText(listToText(value.service_regions));
  }, [partner, open]);

  const update = <K extends keyof PartnerFormData>(field: K, value: PartnerFormData[K]) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('Informe o nome do parceiro comercial.');
      return;
    }
    setSaving(true);
    try {
      await savePartner({
        ...form,
        slug: form.slug.trim() || slugify(form.name),
        services: textToList(servicesText),
        products: textToList(productsText),
        service_regions: textToList(regionsText),
      }, partner?.id);
      toast.success(partner ? 'Parceiro atualizado com sucesso.' : 'Parceiro cadastrado com sucesso.');
      onSaved();
    } catch (error: any) {
      console.error('Erro ao salvar parceiro:', error);
      toast.error(error?.message?.includes('parceiros_slug_key') ? 'Já existe um parceiro com este endereço de página.' : error?.message || 'Não foi possível salvar o parceiro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={partner ? 'Editar parceiro' : 'Novo parceiro'} size="wide">
      <form onSubmit={save} className="space-y-7">
        <FormSection title="Apresentação pública" icon={<Building2 className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Nome do parceiro" required value={form.name} onChange={(value) => { update('name', value); if (!partner && !form.slug) update('slug', slugify(value)); }} /><Field label="Categoria" required value={form.category} onChange={(value) => update('category', value)} /></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Endereço da página (slug)" required value={form.slug} onChange={(value) => update('slug', slugify(value))} /><Field label="Razão social" value={form.legal_name || ''} onChange={(value) => update('legal_name', value)} /></div>
          <Field label="Descrição curta (opcional)" value={form.short_description} onChange={(value) => update('short_description', value)} maxLength={280} />
          <Area label="Descrição completa" value={form.description || ''} onChange={(value) => update('description', value)} rows={4} />
          <div className="grid gap-4 md:grid-cols-2"><Field label="URL do logotipo" value={form.logo_url || ''} onChange={(value) => update('logo_url', value)} /><Field label="URL da foto de capa" value={form.cover_url || ''} onChange={(value) => update('cover_url', value)} /></div>
        </FormSection>

        <FormSection title="Contatos e presença digital" icon={<Globe2 className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-3"><Field label="Telefone" value={form.phone || ''} onChange={(value) => update('phone', maskPhone(value))} placeholder="(00) 0000-0000" /><Field label="WhatsApp" value={form.whatsapp || ''} onChange={(value) => update('whatsapp', maskPhone(value))} placeholder="(00) 00000-0000" /><Field label="E-mail" type="email" value={form.email || ''} onChange={(value) => update('email', value)} /></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Site" value={form.website || ''} onChange={(value) => update('website', value)} /><Field label="Instagram" value={form.instagram || ''} onChange={(value) => update('instagram', value)} /></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Facebook" value={form.facebook || ''} onChange={(value) => update('facebook', value)} /><Field label="LinkedIn" value={form.linkedin || ''} onChange={(value) => update('linkedin', value)} /></div>
        </FormSection>

        <FormSection title="Localização e atendimento" icon={<MapPin className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-[150px_1fr_140px]"><Field label="CEP" value={form.zip_code || ''} onChange={async (value) => { const masked = maskCEP(value); update('zip_code', masked); const clean = value.replace(/\D/g, ''); if (clean.length === 8) { const d = await consultarCEP(clean); if (d) { setForm((c) => ({ ...c, zip_code: masked, street: d.logradouro || c.street, neighborhood: d.bairro || c.neighborhood, city: d.localidade || c.city, state: d.uf || c.state })); toast.success('Endereço localizado via CEP.'); } } }} placeholder="00000-000" /><Field label="Endereço" value={form.street || ''} onChange={(value) => update('street', value)} /><Field label="Número" value={form.number || ''} onChange={(value) => update('number', value)} /></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Complemento" value={form.complement || ''} onChange={(value) => update('complement', value)} /><Field label="Bairro" value={form.neighborhood || ''} onChange={(value) => update('neighborhood', value)} /></div>
          <div className="grid gap-4 md:grid-cols-[1fr_120px]"><Field label="Cidade" value={form.city || ''} onChange={(value) => update('city', value)} /><Field label="Estado" value={form.state || ''} onChange={(value) => update('state', value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))} placeholder="SP" /></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Link do mapa" value={form.maps_url || ''} onChange={(value) => update('maps_url', value)} /><Field label="Horário de atendimento" value={form.business_hours || ''} onChange={(value) => update('business_hours', value)} /></div>
          <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-neutral-700">Modalidade<select value={form.service_mode} onChange={(event) => update('service_mode', event.target.value as PartnerServiceMode)} className="input-field"><option value="presencial">Presencial</option><option value="online">On-line</option><option value="hibrido">Presencial e on-line</option></select></label><Area label="Regiões atendidas (uma por linha)" value={regionsText} onChange={setRegionsText} rows={3} /></div>
        </FormSection>

        <FormSection title="Serviços, produtos e benefícios" icon={<ShieldCheck className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-2"><Area label="Serviços e especialidades (um por linha)" value={servicesText} onChange={setServicesText} rows={6} /><Area label="Produtos e soluções (um por linha)" value={productsText} onChange={setProductsText} rows={6} /></div>
          <Area label="Benefício exclusivo para clientes GSA" value={form.benefits || ''} onChange={(value) => update('benefits', value)} rows={3} />
        </FormSection>

        <FormSection title="Configuração de Resgate de Benefício (Clientes GSA)" icon={<Gift className="h-5 w-5" />}>
          {(() => {
            const hasImmediate = Boolean(form.redemption_has_coupon || form.redemption_has_voucher || form.redemption_has_link);

            return (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={`flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold text-neutral-700 ${form.redemption_delay_24h ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      disabled={form.redemption_delay_24h || false}
                      checked={form.redemption_has_coupon || false} 
                      onChange={(event) => {
                        update('redemption_has_coupon', event.target.checked);
                        if (event.target.checked) update('redemption_delay_24h', false);
                      }} 
                      className="h-4 w-4 rounded" 
                    />
                    <Ticket className="h-4 w-4 text-amber-600" />
                    Gerar cupom promocional
                  </label>
                  {form.redemption_has_coupon && !form.redemption_delay_24h && (
                    <Field label="Código do cupom (opcional)" value={form.redemption_coupon_code || ''} onChange={(value) => update('redemption_coupon_code', value.toUpperCase())} placeholder="Ex: GSA100 (vazio = gera código único)" />
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className={`flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold text-neutral-700 ${form.redemption_delay_24h ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      disabled={form.redemption_delay_24h || false}
                      checked={form.redemption_has_voucher || false} 
                      onChange={(event) => {
                        update('redemption_has_voucher', event.target.checked);
                        if (event.target.checked) update('redemption_delay_24h', false);
                      }} 
                      className="h-4 w-4 rounded" 
                    />
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Gerar voucher de convênio
                  </label>

                  <label className={`flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold text-neutral-700 ${form.redemption_delay_24h ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      disabled={form.redemption_delay_24h || false}
                      checked={form.redemption_has_link || false} 
                      onChange={(event) => {
                        update('redemption_has_link', event.target.checked);
                        if (event.target.checked) update('redemption_delay_24h', false);
                      }} 
                      className="h-4 w-4 rounded" 
                    />
                    <Link2 className="h-4 w-4 text-indigo-600" />
                    Disponibilizar link da parceria
                  </label>
                </div>

                {(form.redemption_has_link && !form.redemption_delay_24h) && (
                  <div className="space-y-3">
                    <Field label="Link de destino da parceria" value={form.redemption_link || ''} onChange={(value) => update('redemption_link', value)} placeholder="https://parceiro.com.br/promocao-gsa" />
                    <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm font-bold text-amber-950 cursor-pointer">
                      <input type="checkbox" checked={form.redemption_auto_redirect || false} onChange={(event) => update('redemption_auto_redirect', event.target.checked)} className="mt-0.5 h-4 w-4 rounded text-amber-600" />
                      <div>
                        <span>Redirecionar cliente automaticamente para o parceiro ao resgatar</span>
                        <p className="text-xs font-normal text-amber-800/80 mt-0.5">Se marcado, abre o link em nova aba automaticamente ao clicar em Resgatar Agora. Se desmarcado, exibe o link sem abrir sozinho.</p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Caixa de 24h Exclusiva */}
                <label className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm font-bold transition-all ${
                  hasImmediate 
                    ? 'border-neutral-200 bg-neutral-100/70 opacity-60 cursor-not-allowed text-neutral-500'
                    : form.redemption_delay_24h
                    ? 'border-amber-400 bg-amber-50 text-amber-950 cursor-pointer'
                    : 'border-neutral-200 bg-white text-neutral-800 cursor-pointer hover:border-amber-300'
                }`}>
                  <input 
                    type="checkbox" 
                    disabled={hasImmediate}
                    checked={hasImmediate ? false : (form.redemption_delay_24h || false)} 
                    onChange={(event) => {
                      if (!hasImmediate) {
                        update('redemption_delay_24h', event.target.checked);
                      }
                    }} 
                    className="mt-0.5 h-4 w-4 rounded text-amber-600 disabled:opacity-40" 
                  />
                  <div>
                    <span>Exibir pop-up informando prazo de 24 horas para ativação via WhatsApp</span>
                    <p className="text-xs font-normal mt-0.5">
                      {hasImmediate ? (
                        <span className="text-amber-800 font-semibold">
                          ⚠️ Bloqueado: Desmarque o cupom, voucher e link acima para ativar o modo 24h.
                        </span>
                      ) : form.redemption_delay_24h ? (
                        <span className="text-amber-900 font-medium">
                          • Ao resgatar, o cliente verá o pop-up de 24h e o resgate ficará pendente no painel para inserção do link.
                        </span>
                      ) : (
                        <span className="text-neutral-500">
                          • Marque para exigir cadastro manual e envio do link de ativação em até 24h por WhatsApp.
                        </span>
                      )}
                    </p>
                  </div>
                </label>

                <Area label="Instruções e regras de utilização do benefício" value={form.redemption_instructions || ''} onChange={(value) => update('redemption_instructions', value)} rows={2} />
              </div>
            );
          })()}
        </FormSection>

        <FormSection title="Controle interno" icon={<Users className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-neutral-700">Status<select value={form.status} onChange={(event) => update('status', event.target.value as PartnerStatus)} className="input-field">{Object.entries(PARTNER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Field label="Ordem de exibição" type="number" value={String(form.display_order)} onChange={(value) => update('display_order', Number(value) || 0)} /><label className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-700"><input type="checkbox" checked={form.featured} onChange={(event) => update('featured', event.target.checked)} className="h-4 w-4" /> Parceiro em destaque</label></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Responsável pelo contato" value={form.contact_person || ''} onChange={(value) => update('contact_person', value)} /><Area label="Observações internas" value={form.internal_notes || ''} onChange={(value) => update('internal_notes', value)} rows={3} /></div>
        </FormSection>

        <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-black text-neutral-700">Cancelar</button><button type="submit" disabled={saving} className="rounded-xl bg-neutral-950 px-6 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar parceiro'}</button></div>
      </form>
    </Modal>
  );
}

function FormSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-5"><h2 className="flex items-center gap-2 text-base font-black text-neutral-900">{icon}{title}</h2>{children}</section>;
}

function Field({ label, value, onChange, required = false, type = 'text', maxLength, placeholder }: { label: string; value: string; onChange: (value: string) => void | Promise<void>; required?: boolean; type?: string; maxLength?: number; placeholder?: string }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-bold text-neutral-800">{label}</span>
      <input required={required} type={type} value={value} onChange={(event) => { void onChange(event.target.value); }} maxLength={maxLength} placeholder={placeholder} className="input-field font-normal text-neutral-900" />
    </div>
  );
}

function Area({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-bold text-neutral-800">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="input-field font-normal text-neutral-900 resize-y" />
    </div>
  );
}
