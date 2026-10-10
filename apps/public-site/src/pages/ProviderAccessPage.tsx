import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Landmark,
  Loader2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { LogoGSA } from '../components/ui/LogoGSA';
import { PinInput } from '../components/ui/PinInput';
import { WhatsAppPinVerification } from '../components/auth/WhatsAppPinVerification';
import { SetupAccessPin } from '../components/auth/SetupAccessPin';
import { logService } from '../lib/logService';
import { sessionService } from '../lib/sessionService';
import { supabase } from '../lib/supabase';
import { maskCEP, maskCNPJ, maskCPF, maskPhone } from '../lib/utils';
import { validarCNPJ, validarCPF, validarEmail } from '../utils/cpfValidator';

export type ProviderAccessMode = 'login' | 'register';
type ProviderLoginStage = 'document' | 'pin' | 'first-access';
type ProviderType = 'cpf' | 'cnpj';

interface ProviderAccessPageProps {
  initialMode?: ProviderAccessMode;
  onBack: () => void;
  onLoginProvider: (id: string) => void;
  onModeChange: (mode: ProviderAccessMode) => void;
}

interface ProviderRegistrationData {
  tipo_cadastro: ProviderType;
  nome_razao: string;
  nome_responsavel: string;
  documento: string;
  email: string;
  telefone: string;
  cep: string;
  numero: string;
  area_servico: string;
  observacoes: string;
}

type ProviderErrors = Partial<Record<
  'nome_razao' | 'nome_responsavel' | 'documento' | 'email' | 'telefone' | 'cep' | 'numero' | 'area_servico' | 'confirmation',
  string
>>;

const createEmptyProvider = (): ProviderRegistrationData => ({
  tipo_cadastro: 'cpf',
  nome_razao: '',
  nome_responsavel: '',
  documento: '',
  email: '',
  telefone: '',
  cep: '',
  numero: '',
  area_servico: '',
  observacoes: '',
});

const providerBenefits = [
  {
    icon: ClipboardList,
    title: 'Demandas organizadas',
    text: 'Acompanhe serviços disponíveis, atividades em andamento e entregas.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda profissional',
    text: 'Consulte compromissos, prazos e solicitações vinculadas ao seu perfil.',
  },
  {
    icon: Landmark,
    title: 'Financeiro e benefícios',
    text: 'Visualize repasses, movimentações, documentos e benefícios liberados.',
  },
] as const;

const inputBaseClass = 'min-h-12 w-full rounded-xl border bg-white px-4 text-sm font-semibold text-[#172235] outline-none transition placeholder:font-medium placeholder:text-[#9aa5b1] focus:ring-4 disabled:cursor-not-allowed disabled:bg-[#f3f5f7]';

export function ProviderAccessPage({
  initialMode = 'login',
  onBack,
  onLoginProvider,
  onModeChange,
}: ProviderAccessPageProps) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<ProviderAccessMode>(initialMode);
  const [loginStage, setLoginStage] = useState<ProviderLoginStage>('document');
  const [providerDocument, setProviderDocument] = useState('');
  const [providerPin, setProviderPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [providerData, setProviderData] = useState<ProviderRegistrationData>(createEmptyProvider);
  const [errors, setErrors] = useState<ProviderErrors>({});
  const [confirmed, setConfirmed] = useState(false);
  const [registrationStage, setRegistrationStage] = useState<'form' | 'whatsapp' | 'setup_pin' | 'success'>('form');
  const [registrationVerificationToken, setRegistrationVerificationToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setLoginStage('document');
    setProviderDocument('');
    setProviderPin('');
    setPinError(false);
    setAttemptsLeft(null);
    setRegistrationStage('form');
    setRegistrationVerificationToken('');
    setErrors({});
  }, [initialMode]);

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;

    document.title = 'Área do Prestador | GSA HUB';
    if (description) {
      description.content = 'Login e cadastro para prestadores de serviços da GSA HUB.';
    }

    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, []);

  const inputClass = (error?: string) => `${inputBaseClass} ${
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-[#d7dde3] focus:border-[#1f5a86] focus:ring-[#7fb0d4]/15'
  }`;

  const switchMode = (nextMode: ProviderAccessMode) => {
    setMode(nextMode);
    setLoginStage('document');
    setProviderDocument('');
    setProviderPin('');
    setPinError(false);
    setAttemptsLeft(null);
    setRegistrationStage('form');
    setRegistrationVerificationToken('');
    setErrors({});
    onModeChange(nextMode);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const updateProvider = <K extends keyof ProviderRegistrationData>(
    field: K,
    value: ProviderRegistrationData[K],
  ) => {
    setProviderData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleProviderDocument = (event: FormEvent) => {
    event.preventDefault();
    const clean = providerDocument.replace(/\D/g, '');
    const valid = clean.length === 11 ? validarCPF(clean) : clean.length === 14 ? validarCNPJ(clean) : false;
    if (!valid) {
      toast.error('Informe um CPF ou CNPJ válido.');
      return;
    }
    setLoginStage('pin');
  };

  const handleProviderLogin = async () => {
    if (providerPin.length !== 4 || loading) return;
    setLoading(true);
    setPinError(false);
    try {
      const data = await sessionService.loginWithPin(
        providerDocument.replace(/\D/g, ''),
        providerPin,
        'prestador',
      );
      if (!data?.valid) {
        setAttemptsLeft(typeof data?.attempts_left === 'number' ? data.attempts_left : null);
        throw new Error(
          data?.error === 'blocked'
            ? 'Acesso temporariamente bloqueado. Entre em contato com o suporte.'
            : 'Documento ou senha inválidos.',
        );
      }

      await logService.logAction({
        ator_tipo: 'prestador',
        ator_id: data.id,
        ator_nome: data.nome,
        acao: 'LOGIN',
        detalhes: 'Acesso pela página exclusiva da Área do Prestador',
      });
      toast.success('Acesso autorizado.');
      onLoginProvider(data.id);
    } catch (error: any) {
      setPinError(true);
      setProviderPin('');
      toast.error(error?.message || 'Documento ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  const validateRegistration = () => {
    const nextErrors: ProviderErrors = {};
    const cleanDocument = providerData.documento.replace(/\D/g, '');
    const validDocument = providerData.tipo_cadastro === 'cpf'
      ? validarCPF(cleanDocument)
      : validarCNPJ(cleanDocument);

    if (providerData.nome_razao.trim().length < 3) {
      nextErrors.nome_razao = providerData.tipo_cadastro === 'cpf'
        ? 'Informe seu nome completo.'
        : 'Informe a razão social.';
    }
    if (providerData.tipo_cadastro === 'cnpj' && providerData.nome_responsavel.trim().length < 3) {
      nextErrors.nome_responsavel = 'Informe o responsável pela empresa.';
    }
    if (!validDocument) nextErrors.documento = `Informe um ${providerData.tipo_cadastro.toUpperCase()} válido.`;
    if (!validarEmail(providerData.email.trim())) nextErrors.email = 'Informe um e-mail válido.';
    if (providerData.telefone.replace(/\D/g, '').length !== 11) nextErrors.telefone = 'Informe um celular com DDD.';
    if (providerData.cep.replace(/\D/g, '').length !== 8) nextErrors.cep = 'Informe um CEP válido.';
    if (!providerData.numero.trim()) nextErrors.numero = 'Informe o número.';
    if (providerData.area_servico.trim().length < 3) nextErrors.area_servico = 'Informe sua área de atuação.';
    if (!confirmed) nextErrors.confirmation = 'Confirme os dados e a autorização para continuar.';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleProviderRegister = (event: FormEvent) => {
    event.preventDefault();
    if (!validateRegistration()) {
      toast.error('Revise os campos destacados.');
      return;
    }
    
    // Inicia a verificação via WhatsApp
    setRegistrationStage('whatsapp');
  };

  const submitFinalRegistration = async (pin: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('gsa_public_register_provider', {
        p_payload: {
          ...providerData,
          nome_razao: providerData.nome_razao.trim(),
          nome_responsavel: providerData.nome_responsavel.trim(),
          documento: providerData.documento.replace(/\D/g, ''),
          email: providerData.email.trim().toLowerCase(),
          telefone: providerData.telefone.replace(/\D/g, ''),
          cep: providerData.cep.replace(/\D/g, ''),
          area_servico: providerData.area_servico.trim(),
          pin, // envia o PIN para ativação imediata
        },
        p_verification_token: registrationVerificationToken,
      });
      if (error) throw error;

      setProviderData(createEmptyProvider());
      setConfirmed(false);
      setRegistrationStage('success');
      toast.success('Cadastro enviado para análise com sucesso!');
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar o cadastro de prestador.');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#eaf1f6] text-[#0b1828]">
      <a
        href="#provider-access-content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-bold text-[#0b1828] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Ir para o acesso do prestador
      </a>

      <div aria-hidden="true" className="pointer-events-none absolute -left-36 top-32 h-96 w-96 rounded-full bg-[#2d6e9c]/12 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[#2d8b65]/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1420px] flex-col px-4 py-5 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1d3d55]/12 pb-5">
          <LogoGSA size="sm" variant="dark" showText />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#becbd5] bg-white/75 px-4 text-sm font-bold text-[#415363] transition hover:border-[#7e9aaf] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86]"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à Área do Prestador
          </button>
        </header>

        <div id="provider-access-content" className="grid flex-1 items-stretch gap-0 py-7 lg:grid-cols-[0.82fr_1.18fr] lg:py-10">
          <section className="relative overflow-hidden rounded-t-[2rem] bg-gradient-to-br from-[#0d2740] via-[#123d5d] to-[#0b1c2c] px-6 py-9 text-white sm:px-9 lg:rounded-l-[2rem] lg:rounded-tr-none lg:px-12 lg:py-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:42px_42px]"
            />
            <div className="relative z-10 flex h-full flex-col">
              <div>
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.26em] text-[#9bd8bb]">
                  <BriefcaseBusiness className="h-4 w-4" />
                  Rede de profissionais GSA
                </span>
                <h1 className="mt-6 max-w-xl text-4xl font-black leading-[1.06] tracking-[-0.04em] sm:text-5xl">
                  Área do Prestador.
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-white/65 sm:text-base">
                  Um ambiente profissional para prestar serviços, acompanhar demandas e manter seu relacionamento operacional com a GSA HUB.
                </p>
              </div>

              <div className="mt-9 grid gap-3">
                {providerBenefits.map(({ icon: Icon, title, text }) => (
                  <article key={title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-[#9bd8bb]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-sm font-black text-white">{title}</h2>
                      <p className="mt-1 text-xs leading-5 text-white/52">{text}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-auto pt-9">
                <div className="flex items-start gap-3 border-t border-white/10 pt-6 text-xs leading-5 text-white/45">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9bd8bb]" />
                  <span>O cadastro passa por análise antes da liberação de demandas e funcionalidades do portal.</span>
                </div>
              </div>
            </div>
          </section>

          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-b-[2rem] bg-[#f8fafc] px-5 py-8 shadow-[0_30px_90px_rgba(28,55,75,.2)] sm:px-9 lg:rounded-r-[2rem] lg:rounded-bl-none lg:px-12 lg:py-12 xl:px-16"
          >
            <div className="mx-auto w-full max-w-3xl">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#e6edf2] p-1.5" role="tablist" aria-label="Acesso ou cadastro de prestador">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => switchMode('login')}
                  className={`min-h-11 rounded-lg px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86] ${
                    mode === 'login' ? 'bg-white text-[#0d2740] shadow-sm' : 'text-[#667887] hover:text-[#0d2740]'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'register'}
                  onClick={() => switchMode('register')}
                  className={`min-h-11 rounded-lg px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86] ${
                    mode === 'register' ? 'bg-white text-[#0d2740] shadow-sm' : 'text-[#667887] hover:text-[#0d2740]'
                  }`}
                >
                  Quero ser prestador
                </button>
              </div>

              {mode === 'login' && (
                <div role="tabpanel" className="pt-9">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#267153]">Acesso seguro</p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#0d2740]">
                    Entre no portal do prestador
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#657786]">
                    Use o CPF ou CNPJ aprovado no cadastro e sua senha numérica de quatro dígitos.
                  </p>

                  {loginStage === 'document' && (
                    <form onSubmit={handleProviderDocument} className="mt-8 space-y-5">
                      <label htmlFor="provider-login-document" className="grid gap-2 text-sm font-black text-[#344b5d]">
                        CPF ou CNPJ
                        <input
                          id="provider-login-document"
                          name="provider-document"
                          type="text"
                          inputMode="numeric"
                          autoComplete="username"
                          required
                          autoFocus
                          value={providerDocument}
                          onChange={(event) => {
                            const clean = event.target.value.replace(/\D/g, '');
                            setProviderDocument(clean.length <= 11 ? maskCPF(event.target.value) : maskCNPJ(event.target.value));
                          }}
                          placeholder="000.000.000-00"
                          className={inputClass()}
                        />
                      </label>

                      <button
                        type="submit"
                        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0d2740] px-5 text-sm font-black text-white shadow-[0_12px_30px_rgba(13,39,64,.2)] transition hover:bg-[#164b70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86] focus-visible:ring-offset-2"
                      >
                        Continuar
                        <ArrowRight className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setLoginStage('first-access')}
                        className="min-h-11 w-full text-center text-sm font-black text-[#267153] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86]"
                      >
                        Primeiro acesso ou ainda não tenho senha
                      </button>
                    </form>
                  )}

                  {loginStage === 'pin' && (
                    <div className="mt-8 space-y-6">
                      <div className="text-center">
                        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e7f1f7] text-[#1f5a86]">
                          <LockKeyhole className="h-8 w-8" />
                        </span>
                        <p className="mt-4 text-sm text-[#657786]">Digite sua senha numérica de quatro dígitos.</p>
                      </div>

                      <PinInput
                        value={providerPin}
                        onChange={(value) => {
                          setProviderPin(value);
                          setPinError(false);
                        }}
                        error={pinError}
                        disabled={loading}
                        onEnter={handleProviderLogin}
                      />

                      {attemptsLeft !== null && attemptsLeft <= 2 && (
                        <p className="text-center text-xs font-bold text-red-600">
                          {attemptsLeft} tentativa(s) restante(s).
                        </p>
                      )}

                      <div className="flex flex-col-reverse gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => {
                            setLoginStage('document');
                            setProviderPin('');
                          }}
                          className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[#cbd6de] bg-white text-sm font-black text-[#415565] transition hover:border-[#8fa7b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86]"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Voltar
                        </button>
                        <button
                          type="button"
                          onClick={handleProviderLogin}
                          disabled={loading || providerPin.length !== 4}
                          className="inline-flex min-h-14 flex-[1.35] items-center justify-center gap-2 rounded-xl bg-[#0d2740] px-5 text-sm font-black text-white transition hover:bg-[#164b70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}
                          {loading ? 'Verificando...' : 'Acessar Área do Prestador'}
                        </button>
                      </div>
                    </div>
                  )}

                  {loginStage === 'first-access' && (
                    <div className="mt-8">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
                        <div className="flex items-start gap-3">
                          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
                          <div>
                            <h3 className="font-black">Liberação segura do primeiro acesso</h3>
                            <p className="mt-2 text-sm leading-6 text-amber-900/80">
                              A senha do prestador é liberada pelo suporte somente após a confirmação de identidade e a aprovação do cadastro. Documento e telefone, sozinhos, não criam uma senha.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => setLoginStage('document')}
                          className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[#cbd6de] bg-white text-sm font-black text-[#415565] transition hover:border-[#8fa7b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86]"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Voltar ao login
                        </button>
                        <button
                          type="button"
                          onClick={() => switchMode('register')}
                          className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-[#267153] px-5 text-sm font-black text-white transition hover:bg-[#1d5a41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#267153]"
                        >
                          Fazer meu cadastro
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mode === 'register' && registrationStage === 'form' && (
                <form role="tabpanel" onSubmit={handleProviderRegister} noValidate className="pt-9">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#267153]">Pré-cadastro profissional</p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#0d2740]">
                    Cadastre-se como prestador
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#657786]">
                    Envie seus dados para análise. A aprovação e a liberação do acesso são realizadas pela equipe GSA.
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-2 rounded-xl bg-[#e6edf2] p-1.5" role="group" aria-label="Tipo de cadastro">
                    <button
                      type="button"
                      aria-pressed={providerData.tipo_cadastro === 'cpf'}
                      onClick={() => {
                        setProviderData((current) => ({ ...current, tipo_cadastro: 'cpf', documento: '', nome_responsavel: '' }));
                        setErrors({});
                      }}
                      className={`min-h-11 rounded-lg text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86] ${
                        providerData.tipo_cadastro === 'cpf' ? 'bg-white text-[#0d2740] shadow-sm' : 'text-[#667887]'
                      }`}
                    >
                      Pessoa Física
                    </button>
                    <button
                      type="button"
                      aria-pressed={providerData.tipo_cadastro === 'cnpj'}
                      onClick={() => {
                        setProviderData((current) => ({ ...current, tipo_cadastro: 'cnpj', documento: '' }));
                        setErrors({});
                      }}
                      className={`min-h-11 rounded-lg text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86] ${
                        providerData.tipo_cadastro === 'cnpj' ? 'bg-white text-[#0d2740] shadow-sm' : 'text-[#667887]'
                      }`}
                    >
                      Pessoa Jurídica
                    </button>
                  </div>

                  <div className="mt-7 grid gap-5 sm:grid-cols-2">
                    <ProviderField
                      label={providerData.tipo_cadastro === 'cpf' ? 'Nome completo' : 'Razão social'}
                      htmlFor="provider-name"
                      error={errors.nome_razao}
                    >
                      <input
                        id="provider-name"
                        name="nome-razao"
                        type="text"
                        autoComplete={providerData.tipo_cadastro === 'cpf' ? 'name' : 'organization'}
                        required
                        maxLength={180}
                        value={providerData.nome_razao}
                        onChange={(event) => updateProvider('nome_razao', event.target.value)}
                        aria-invalid={Boolean(errors.nome_razao)}
                        className={inputClass(errors.nome_razao)}
                      />
                    </ProviderField>

                    <ProviderField
                      label={providerData.tipo_cadastro.toUpperCase()}
                      htmlFor="provider-document"
                      error={errors.documento}
                    >
                      <input
                        id="provider-document"
                        name="documento"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        value={providerData.documento}
                        onChange={(event) => updateProvider(
                          'documento',
                          providerData.tipo_cadastro === 'cpf'
                            ? maskCPF(event.target.value)
                            : maskCNPJ(event.target.value),
                        )}
                        aria-invalid={Boolean(errors.documento)}
                        placeholder={providerData.tipo_cadastro === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                        className={inputClass(errors.documento)}
                      />
                    </ProviderField>
                  </div>

                  {providerData.tipo_cadastro === 'cnpj' && (
                    <div className="mt-5">
                      <ProviderField label="Responsável pela empresa" htmlFor="provider-responsible" error={errors.nome_responsavel}>
                        <input
                          id="provider-responsible"
                          name="nome-responsavel"
                          type="text"
                          autoComplete="name"
                          required
                          maxLength={180}
                          value={providerData.nome_responsavel}
                          onChange={(event) => updateProvider('nome_responsavel', event.target.value)}
                          aria-invalid={Boolean(errors.nome_responsavel)}
                          className={inputClass(errors.nome_responsavel)}
                        />
                      </ProviderField>
                    </div>
                  )}

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <ProviderField label="E-mail" htmlFor="provider-email" error={errors.email}>
                      <input
                        id="provider-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={providerData.email}
                        onChange={(event) => updateProvider('email', event.target.value)}
                        aria-invalid={Boolean(errors.email)}
                        placeholder="voce@exemplo.com"
                        className={inputClass(errors.email)}
                      />
                    </ProviderField>

                    <ProviderField label="Celular / WhatsApp" htmlFor="provider-phone" error={errors.telefone}>
                      <input
                        id="provider-phone"
                        name="telefone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        maxLength={15}
                        value={providerData.telefone}
                        onChange={(event) => updateProvider('telefone', maskPhone(event.target.value))}
                        aria-invalid={Boolean(errors.telefone)}
                        placeholder="(00) 00000-0000"
                        className={inputClass(errors.telefone)}
                      />
                    </ProviderField>
                  </div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_150px]">
                    <ProviderField label="CEP" htmlFor="provider-cep" error={errors.cep}>
                      <input
                        id="provider-cep"
                        name="cep"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        required
                        maxLength={9}
                        value={providerData.cep}
                        onChange={(event) => updateProvider('cep', maskCEP(event.target.value))}
                        aria-invalid={Boolean(errors.cep)}
                        placeholder="00000-000"
                        className={inputClass(errors.cep)}
                      />
                    </ProviderField>

                    <ProviderField label="Número" htmlFor="provider-number" error={errors.numero}>
                      <input
                        id="provider-number"
                        name="numero"
                        type="text"
                        autoComplete="address-line2"
                        required
                        maxLength={20}
                        value={providerData.numero}
                        onChange={(event) => updateProvider('numero', event.target.value)}
                        aria-invalid={Boolean(errors.numero)}
                        className={inputClass(errors.numero)}
                      />
                    </ProviderField>
                  </div>

                  <div className="mt-5">
                    <ProviderField label="Área de prestação de serviço" htmlFor="provider-service-area" error={errors.area_servico}>
                      <input
                        id="provider-service-area"
                        name="area-servico"
                        type="text"
                        required
                        maxLength={180}
                        value={providerData.area_servico}
                        onChange={(event) => updateProvider('area_servico', event.target.value)}
                        aria-invalid={Boolean(errors.area_servico)}
                        placeholder="Ex.: tecnologia, manutenção, design, consultoria"
                        className={inputClass(errors.area_servico)}
                      />
                    </ProviderField>
                  </div>

                  <div className="mt-5">
                    <ProviderField label="Experiência e observações (opcional)" htmlFor="provider-notes">
                      <textarea
                        id="provider-notes"
                        name="observacoes"
                        rows={3}
                        maxLength={2000}
                        value={providerData.observacoes}
                        onChange={(event) => updateProvider('observacoes', event.target.value)}
                        placeholder="Conte brevemente sobre sua experiência, região de atendimento ou especialidades."
                        className={`${inputClass()} min-h-24 resize-y py-3`}
                      />
                    </ProviderField>
                  </div>

                  <label className={`mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                    errors.confirmation ? 'border-red-300 bg-red-50' : 'border-[#d8e1e7] bg-white hover:border-[#93aebe]'
                  }`}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => {
                        setConfirmed(event.target.checked);
                        setErrors((current) => ({ ...current, confirmation: undefined }));
                      }}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#aeb8c2] accent-[#267153]"
                    />
                    <span className="text-xs leading-5 text-[#586b7a]">
                      Confirmo que os dados são verdadeiros e autorizo a GSA a utilizá-los para análise cadastral, contato e gestão da relação de prestação de serviços.
                      {errors.confirmation && <span className="mt-1 block font-bold text-red-600">{errors.confirmation}</span>}
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#267153] px-5 text-sm font-black text-white shadow-[0_12px_30px_rgba(38,113,83,.2)] transition hover:bg-[#1d5a41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#267153] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}
                    {loading ? 'Enviando...' : 'Continuar para ativação'}
                  </button>
                </form>
              )}

              {mode === 'register' && registrationStage === 'whatsapp' && (
                <div role="tabpanel" className="pt-9">
                  <WhatsAppPinVerification
                    initialPhone={providerData.telefone}
                    documento={providerData.documento.replace(/\D/g, '')}
                    secureProviderRegistration
                    onVerified={(verifiedPhone, verificationToken) => {
                      updateProvider('telefone', verifiedPhone);
                      if (verificationToken) {
                        setRegistrationVerificationToken(verificationToken);
                      }
                      setRegistrationStage('setup_pin');
                    }}
                    onCancel={() => setRegistrationStage('form')}
                  />
                </div>
              )}

              {mode === 'register' && registrationStage === 'setup_pin' && (
                <div role="tabpanel" className="pt-9">
                  <SetupAccessPin onComplete={submitFinalRegistration} loading={loading} />
                </div>
              )}

              {mode === 'register' && registrationStage === 'success' && (
                <div role="tabpanel" className="pt-9 text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#267153]">
                    Cadastro Concluído
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#0d2740]">
                    Cadastro enviado para análise
                  </h2>
                  <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#657786]">
                    Seus dados e credenciais foram registrados com sucesso. Nossa equipe entrará em contato após a análise cadastral para liberação dos serviços na Área do Prestador.
                  </p>
                  <div className="mt-8">
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="inline-flex min-h-14 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[#0d2740] px-5 text-sm font-black text-white shadow-lg transition hover:bg-[#164b70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a86]"
                    >
                      Ir para o Login
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}


            </div>
          </motion.section>
        </div>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#1d3d55]/12 py-5 text-center text-[11px] text-[#657786] sm:flex-row sm:text-left">
          <span>© {new Date().getFullYear()} GSA HUB. Área profissional do prestador.</span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#267153]" />
            Login e cadastro protegidos por validação de perfil.
          </span>
        </footer>
      </div>
    </main>
  );
}

function ProviderField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-black text-[#344b5d]">{label}</label>
      {children}
      {error && <p role="alert" className="mt-2 text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}
