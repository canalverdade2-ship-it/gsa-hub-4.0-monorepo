import { useEffect, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  InstitutionalAccessHero,
  InstitutionalAccessLayout,
} from '../components/public/InstitutionalAccessLayout';
import { logService } from '../lib/logService';
import { sessionService } from '../lib/sessionService';

export type RestrictedAccessRole = 'gestao' | 'colaborador';

interface RestrictedAccessHubPageProps {
  initialRole?: RestrictedAccessRole;
  onBack: () => void;
  presentation?: 'page' | 'modal';
  onLoginAdmin: (details: {
    type: 'admin' | 'colaborador';
    id?: string;
    nome?: string;
    modulos?: string[];
  }) => void;
}

const roleContent = {
  gestao: {
    eyebrow: 'Administração',
    title: 'Gestão GSA',
    description: 'Acesso Master ao ambiente de gestão, supervisão e administração do ecossistema.',
    label: 'Código Master',
    button: 'Entrar na gestão',
    icon: UserCog,
  },
  colaborador: {
    eyebrow: 'Equipe interna',
    title: 'Colaborador GSA',
    description: 'Acesse os módulos liberados para sua rotina de atendimento e operação.',
    label: 'Código do colaborador',
    button: 'Entrar como colaborador',
    icon: ShieldCheck,
  },
} as const;

export function RestrictedAccessHubPage({
  initialRole = 'gestao',
  onBack,
  onLoginAdmin,
  presentation = 'page',
}: RestrictedAccessHubPageProps) {
  const reduceMotion = useReducedMotion();
  const [role, setRole] = useState<RestrictedAccessRole>(initialRole);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    setRole(initialRole);
    setCode('');
    setShowCode(false);
  }, [initialRole]);

  useEffect(() => {
    if (presentation === 'modal') return;
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;

    document.title = 'Área Restrita | GSA HUB';
    if (description) {
      description.content = 'Acesso administrativo exclusivo da GSA HUB.';
    }

    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, [presentation]);

  const selectRole = (nextRole: RestrictedAccessRole) => {
    setRole(nextRole);
    setCode('');
    setShowCode(false);
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || loading) {
      toast.error('Informe sua credencial de acesso.');
      return;
    }

    setLoading(true);
    try {
      const data = role === 'gestao'
        ? await sessionService.loginAdmin(code.trim())
        : await sessionService.loginColaborador(code.trim());
      if (!data?.valid) throw new Error(role === 'gestao' ? 'Código Master inválido.' : 'Código de colaborador inválido.');
      await logService.logAction({
        ator_tipo: role === 'gestao' ? 'admin' : 'colaborador',
        acao: 'LOGIN',
        detalhes: role === 'gestao' ? 'Acesso Master pela página exclusiva da Área Restrita' : 'Acesso de colaborador pela página exclusiva da Área Restrita',
      });
      toast.success(role === 'gestao' ? 'Acesso à Gestão autorizado.' : 'Acesso de colaborador autorizado.');
      onLoginAdmin({ type: role === 'gestao' ? 'admin' : 'colaborador', id: role === 'colaborador' ? data.id : undefined, nome: role === 'colaborador' ? data.nome : undefined, modulos: role === 'colaborador' ? data.modulos : undefined });
    } catch (error: any) {
      setCode('');
      toast.error(error?.message || 'Não foi possível autorizar o acesso.');
    } finally {
      setLoading(false);
    }
  };

  const selected = roleContent[role];
  const SelectedIcon = selected.icon;

  if (presentation === 'modal') {
    return (
      <section className="max-h-[min(88dvh,720px)] overflow-y-auto bg-white px-6 py-7 sm:px-9 sm:py-9">
        <div className="pr-9">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Acesso restrito · GSA HUB</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Entrar na administração</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Informe sua credencial Master para acessar o painel administrativo.</p>
        </div>
        <form onSubmit={handleLogin} className="mt-7">
          <label htmlFor="restricted-code-modal" className="grid gap-2 text-sm font-bold text-slate-700">
            {selected.label}
            <span className="text-xs font-normal text-slate-500">A credencial é pessoal e não deve ser compartilhada.</span>
          </label>
          <div className="relative mt-3">
            <input
              id="restricted-code-modal"
              name="access-code"
              type={showCode ? 'text' : 'password'}
              autoComplete="current-password"
              inputMode="numeric"
              required
              data-dialog-autofocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Digite sua credencial"
              className="min-h-14 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 font-mono text-lg tracking-[0.18em] text-slate-900 outline-none transition placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            <button type="button" onClick={() => setShowCode((current) => !current)} aria-label={showCode ? 'Ocultar credencial' : 'Mostrar credencial'} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <button type="submit" disabled={loading || !code.trim()} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {loading ? 'Autorizando acesso...' : selected.button}
          </button>
          <div className="mt-5 flex items-start gap-2.5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <span>Acesso protegido. O painel só será aberto após a validação da credencial.</span>
          </div>
        </form>
      </section>
    );
  }

  return (
    <InstitutionalAccessLayout
      onBack={onBack}
      backLabel="Voltar aos acessos"
      skipTarget="restricted-login"
      footerNote="Uso exclusivo da estrutura interna"
    >
      <InstitutionalAccessHero
        eyebrow="GSA HUB · Equipe interna"
        title="Área Restrita GSA"
        description="Acesso exclusivo à administração da GSA HUB. Informe sua credencial Master para continuar."
        aside={(
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#d5b86b]" />
            <p>
              <strong className="font-semibold text-white">Acesso protegido.</strong>{' '}
              A credencial é validada antes da abertura do painel.
            </p>
          </div>
        )}
      />

      <section
        id="restricted-login"
        tabIndex={-1}
        className="px-5 py-12 focus:outline-none sm:px-8 lg:px-10 lg:py-16"
      >
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-5 border-b border-[#cbc2b2] pb-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#806329]">Identificação de acesso</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#0b1825] sm:text-4xl">
                Acesso administrativo
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[#60666b] lg:justify-self-end">
              Este acesso é reservado à administração principal da GSA HUB.
            </p>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:gap-12">
            <div>
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                {([
                  ['gestao', roleContent.gestao],
                  ['colaborador', roleContent.colaborador],
                ] as const).map(([roleId, content]) => {
                  const Icon = content.icon;
                  const isActive = role === roleId;

                  return (
                    <button
                      key={roleId}
                      type="button"
                      aria-pressed={isActive}
                      aria-controls="restricted-credential-form"
                      onClick={() => selectRole(roleId)}
                      className={`group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] sm:p-6 ${
                        isActive
                          ? 'border-transparent bg-[#0b1522] text-white shadow-xl shadow-[#0b1522]/10 scale-[1.02]'
                          : 'border-[#e2e7eb] bg-white text-[#344154] hover:border-[#d8bd73]/50 hover:bg-[#fffcf5] hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-5">
                        <span className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-colors ${
                          isActive
                            ? 'border-[#d8bd73]/30 bg-[#d8bd73]/10 text-[#edcf83]'
                            : 'border-[#e2e7eb] bg-[#f8f9fa] text-[#71808e] group-hover:border-[#d8bd73]/30 group-hover:bg-[#d8bd73]/10 group-hover:text-[#8a651f]'
                        }`}>
                          <Icon className="h-6 w-6" />
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                          isActive ? 'text-[#d5b86b]' : 'text-[#9aa4af] group-hover:text-[#8a651f]'
                        }`}>
                          {isActive ? 'Selecionado' : content.eyebrow}
                        </span>
                      </div>
                      <div>
                        <h3 className={`mt-5 text-lg font-black transition-colors ${isActive ? 'text-white' : 'text-[#0b1522]'}`}>{content.title}</h3>
                        <p className={`mt-2 text-xs leading-5 transition-colors ${isActive ? 'text-white/60' : 'text-[#71808e]'}`}>
                          {content.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex items-start gap-3 border-l-2 border-[#a9873c] pl-4 text-xs leading-6 text-[#60666b]">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#806329]" />
                <span>A credencial é pessoal e não deve ser compartilhada.</span>
              </div>
            </div>

            <motion.section
              key={role} // forçar re-render na animação quando trocar perfil
              initial={reduceMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col overflow-hidden rounded-[2rem] border border-[#e2e7eb] bg-[#fbfcfd] shadow-2xl shadow-black/5"
            >
              <div className="border-b border-[#e2e7eb] bg-white px-6 py-6 sm:px-10 sm:py-8">
                <div className="flex items-start gap-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#d8bd73]/35 bg-[#fff9ea] text-[#8a651f]">
                    <SelectedIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a651f]">{selected.eyebrow}</p>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-[#0b1522] sm:text-3xl">{selected.title}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#71808e]">{selected.description}</p>
                  </div>
                </div>
              </div>

              <form id="restricted-credential-form" onSubmit={handleLogin} className="flex flex-1 flex-col">
                <div className="flex-1 px-6 py-8 sm:px-10">
                  <label htmlFor={`restricted-code-${role}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                    {selected.label}
                    <p className="text-xs font-normal leading-5 text-[#71808e]">
                      Digite a credencial individual recebida da administração da GSA.
                    </p>
                  </label>

                  <div className="relative mt-5">
                    <input
                      key={role}
                      id={`restricted-code-${role}`}
                      name="access-code"
                      type={showCode ? 'text' : 'password'}
                      autoComplete="current-password"
                      inputMode="numeric"
                      required
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Digite sua credencial"
                      className="min-h-16 w-full rounded-xl border border-[#d7dde3] bg-white px-5 pr-14 text-center font-mono text-xl tracking-[0.24em] text-[#0b1522] outline-none transition placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#9aa4af] focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCode((current) => !current)}
                      aria-label={showCode ? 'Ocultar credencial' : 'Mostrar credencial'}
                      className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-lg text-[#9aa4af] transition hover:bg-[#f1f3f5] hover:text-[#0b1522] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                    >
                      {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !code.trim()}
                    className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-5 text-sm font-black text-white transition hover:bg-[#14263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 text-[#d5b86b]" />}
                    {loading ? 'Autorizando acesso...' : selected.button}
                  </button>
                </div>

                <div className="flex items-start gap-3 border-t border-[#e2e7eb] bg-[#f4f6f8] px-6 py-5 text-xs leading-5 text-[#71808e] sm:px-10">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#8a651f]" />
                  <span>Nenhuma informação administrativa é exibida antes da autenticação. Sessão criptografada ponta a ponta.</span>
                </div>
              </form>
            </motion.section>
          </div>
        </div>
      </section>
    </InstitutionalAccessLayout>
  );
}
