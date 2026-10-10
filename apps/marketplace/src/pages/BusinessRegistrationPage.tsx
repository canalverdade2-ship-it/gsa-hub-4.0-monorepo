import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Headphones,
  Landmark,
  Loader2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { LogoGSA } from '../components/ui/LogoGSA';
import { HomeLogoLink } from '../components/ui/HomeLogoLink';
import { WhatsAppPinVerification } from '../components/auth/WhatsAppPinVerification';
import { SetupAccessPin } from '../components/auth/SetupAccessPin';
import { usePublicRegistrationSettings } from '../hooks/usePublicRegistrationSettings';
import { supabase } from '../lib/supabase';
import { copyToClipboard, formatCurrency, maskCNPJ, maskPhone, maskCEP } from '../lib/utils';
import { validarCNPJ, validarEmail } from '../utils/cpfValidator';
import { consultarCEP } from '../utils/viaCep';

type RegistrationStage = 'authorization' | 'company' | 'whatsapp' | 'setup_pin' | 'success';
type VoucherTab = 'com-indicacao' | 'sem-indicacao';
type SubmissionStatus = 'pendente' | 'ativo';

interface BusinessRegistrationPageProps {
  onBack: () => void;
  onLogin: () => void;
}

interface RegistrationData {
  nome: string;
  email: string;
  telefone: string;
  cep: string;
  numero: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  observacoes: string;
  data_cadastro: string;
}

type RegistrationErrors = Partial<Record<
  'cnpj' | 'nome' | 'email' | 'telefone' | 'cep' | 'numero' | 'endereco' | 'bairro' | 'cidade' | 'estado' | 'confirmation',
  string
>>;

const createEmptyRegistration = (): RegistrationData => ({
  nome: '',
  email: '',
  telefone: '',
  cep: '',
  numero: '',
  endereco: '',
  bairro: '',
  cidade: '',
  estado: '',
  observacoes: '',
  data_cadastro: new Date().toISOString().split('T')[0],
});

const benefits = [
  {
    icon: FileCheck2,
    title: 'Cadastro empresarial centralizado',
    text: 'Os dados da organização ficam vinculados ao ambiente exclusivo GSA HUB Empresas.',
  },
  {
    icon: Landmark,
    title: 'Estrutura financeira corporativa',
    text: 'Acesso preparado para faturas, documentos fiscais, crédito e movimentações.',
  },
  {
    icon: Headphones,
    title: 'Relacionamento executivo',
    text: 'Um canal profissional para acompanhar solicitações e falar com a equipe GSA.',
  },
] as const;

const progressSteps = [
  { number: 1, label: 'Autorização' },
  { number: 2, label: 'Empresa' },
  { number: 3, label: 'Conclusão' },
] as const;

const inputBaseClass = 'min-h-12 w-full rounded-xl border bg-white px-4 text-sm font-semibold text-[#172235] outline-none transition placeholder:font-medium placeholder:text-[#9aa5b1] focus:ring-4 disabled:cursor-not-allowed disabled:bg-[#f3f5f7]';

export function BusinessRegistrationPage({ onBack, onLogin }: BusinessRegistrationPageProps) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<RegistrationStage>('authorization');
  const [voucherTab, setVoucherTab] = useState<VoucherTab>('com-indicacao');
  const [voucherInput, setVoucherInput] = useState('');
  const [referralInfo, setReferralInfo] = useState<{ kind: string; isDefaultCode: boolean } | null>(null);
  const [cnpj, setCnpj] = useState('');
  const [registrationData, setRegistrationData] = useState<RegistrationData>(createEmptyRegistration);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('pendente');
  const { settings, loading: settingsLoading } = usePublicRegistrationSettings(true);

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;

    document.title = 'Cadastro Empresarial | GSA HUB Empresas';
    if (description) {
      description.content = 'Solicite o acesso da sua empresa ao ambiente corporativo e exclusivo GSA HUB Empresas.';
    }

    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, []);

  useEffect(() => {
    if (voucherTab === 'sem-indicacao' && settings.ativo && settings.codigo) {
      setVoucherInput(settings.codigo);
    }
  }, [voucherTab, settings.ativo, settings.codigo]);

  const activeStep = stage === 'authorization' ? 1 : stage === 'company' ? 2 : 3;

  const updateField = <K extends keyof RegistrationData>(field: K, value: RegistrationData[K]) => {
    setRegistrationData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const inputClass = (error?: string) => `${inputBaseClass} ${
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-[#d7dde3] focus:border-[#9a742b] focus:ring-[#d8bd73]/15'
  }`;

  const changeVoucherTab = (nextTab: VoucherTab) => {
    setVoucherTab(nextTab);
    setVoucherInput(nextTab === 'sem-indicacao' && settings.ativo ? settings.codigo : '');
    setReferralInfo(null);
  };

  const handleValidateVoucher = async () => {
    if (!voucherInput.trim()) {
      toast.error(voucherTab === 'com-indicacao'
        ? 'Informe o celular usado na indicação.'
        : 'Informe o código de cadastro.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('gsa_public_lookup_referral', {
        p_token: voucherInput.trim(),
      });
      if (error || !data?.valid) {
        throw new Error(data?.error || 'Não foi possível validar a autorização.');
      }

      const validatedReferral = {
        kind: String(data.kind || 'referral'),
        isDefaultCode: data.kind === 'default',
      };
      setReferralInfo(validatedReferral);
      if (data.kind === 'referral') {
        updateField('telefone', maskPhone(voucherInput));
      }
      toast.success(validatedReferral.isDefaultCode
        ? 'Código público validado.'
        : 'Indicação empresarial validada.');
    } catch (error: any) {
      setReferralInfo(null);
      toast.error(error?.message || 'Não foi possível validar a autorização.');
    } finally {
      setLoading(false);
    }
  };

  const handleCepChange = async (value: string) => {
    const masked = maskCEP(value);
    updateField('cep', masked);
    const rawCep = masked.replace(/\D/g, '');
    if (rawCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const address = await consultarCEP(rawCep);
      if (!address) {
        setErrors((current) => ({ ...current, cep: 'CEP não localizado. Revise o número informado.' }));
        return;
      }

      setRegistrationData((current) => ({
        ...current,
        endereco: address.logradouro || current.endereco,
        bairro: address.bairro || current.bairro,
        cidade: address.localidade || current.cidade,
        estado: address.uf || current.estado,
      }));
      setErrors((current) => ({
        ...current,
        cep: undefined,
        endereco: undefined,
        bairro: undefined,
        cidade: undefined,
        estado: undefined,
      }));
    } catch {
      setErrors((current) => ({ ...current, cep: 'Não foi possível consultar o CEP agora.' }));
    } finally {
      setLoadingCep(false);
    }
  };

  const validateRegistration = () => {
    const nextErrors: RegistrationErrors = {};
    const cleanCnpj = cnpj.replace(/\D/g, '');
    const cleanPhone = registrationData.telefone.replace(/\D/g, '');
    const cleanCep = registrationData.cep.replace(/\D/g, '');

    if (!validarCNPJ(cleanCnpj)) nextErrors.cnpj = 'Informe um CNPJ válido.';
    if (registrationData.nome.trim().length < 3) nextErrors.nome = 'Informe a razão social da empresa.';
    if (!validarEmail(registrationData.email.trim())) nextErrors.email = 'Informe um e-mail válido.';
    if (cleanPhone.length !== 11) nextErrors.telefone = 'Informe um celular com DDD.';
    if (cleanCep.length !== 8) nextErrors.cep = 'Informe um CEP válido.';
    if (!registrationData.numero.trim()) nextErrors.numero = 'Informe o número.';
    if (!registrationData.endereco.trim()) nextErrors.endereco = 'Informe o endereço.';
    if (!registrationData.bairro.trim()) nextErrors.bairro = 'Informe o bairro.';
    if (!registrationData.cidade.trim()) nextErrors.cidade = 'Informe a cidade.';
    if (registrationData.estado.trim().length !== 2) nextErrors.estado = 'Informe a UF.';
    if (!confirmed) nextErrors.confirmation = 'Confirme a veracidade dos dados para continuar.';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegister = (event: FormEvent) => {
    event.preventDefault();
    if (!referralInfo) {
      setStage('authorization');
      toast.error('Valide a autorização empresarial antes de continuar.');
      return;
    }
    if (!validateRegistration()) {
      toast.error('Revise os campos destacados.');
      return;
    }
    
    // Inicia verificação via WhatsApp
    setStage('whatsapp');
  };

  const submitFinalRegistration = async (pin: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('gsa_public_register_client', {
        p_referral_token: voucherInput.trim(),
        p_payload: {
          ...registrationData,
          nome: registrationData.nome.trim(),
          email: registrationData.email.trim().toLowerCase(),
          telefone: registrationData.telefone.replace(/\D/g, ''),
          cep: registrationData.cep.replace(/\D/g, ''),
          estado: registrationData.estado.trim().toUpperCase(),
          tipo_pessoa: 'pj',
          cnpj: cnpj.replace(/\D/g, ''),
          pin, // Passa o PIN para ativar o cadastro
        },
      });
      if (error) throw error;

      setSubmissionStatus(data?.status === 'pendente' ? 'pendente' : 'ativo');
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir o cadastro empresarial.');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const goToCompanyData = () => {
    if (!referralInfo) {
      toast.error('Valide a autorização para continuar.');
      return;
    }
    setStage('company');
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-[#0b1522]">
      <a
        href="#business-registration-content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-bold text-[#0b1522] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Ir para o cadastro
      </a>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(201,160,77,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(201,160,77,.09)_1px,transparent_1px)] [background-size:40px_40px]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-36 top-28 h-96 w-96 rounded-full bg-[#9a742b]/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 bottom-0 h-[28rem] w-[28rem] rounded-full bg-[#24466c]/25 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-5 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <HomeLogoLink><LogoGSA size="sm" variant="light" showText /></HomeLogoLink>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-[#c9a04d]/30 bg-[#c9a04d]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#e4c36f] sm:inline-flex">
              Cadastro empresarial
            </span>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold text-white/80 transition hover:border-white/30 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </button>
          </div>
        </header>

        <div id="business-registration-content" className="grid flex-1 items-stretch gap-0 py-7 lg:grid-cols-[0.82fr_1.18fr] lg:py-10">
          <section className="relative overflow-hidden rounded-t-[2rem] border border-b-0 border-white/10 bg-[#0b1828]/88 px-6 py-9 text-white sm:px-9 lg:rounded-l-[2rem] lg:rounded-tr-none lg:border-b lg:border-r-0 lg:px-12 lg:py-14">
            <div className="relative z-10 flex h-full flex-col">
              <div>
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#d8bd73]">
                  <Building2 className="h-4 w-4" />
                  GSA HUB Empresas
                </span>
                <h1 className="mt-6 max-w-xl text-3xl font-black leading-[1.08] tracking-[-0.04em] sm:text-4xl xl:text-5xl">
                  Uma estrutura profissional desde o primeiro cadastro.
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-white/66 sm:text-base">
                  Solicite o acesso da sua organização ao ambiente corporativo da GSA. O processo é seguro, orientado e preparado para validar os dados empresariais.
                </p>
              </div>

              <div className="mt-9 grid gap-3">
                {benefits.map(({ icon: Icon, title, text }) => (
                  <article key={title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d8bd73]/25 bg-[#d8bd73]/10 text-[#e1bf64]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-sm font-black text-white">{title}</h2>
                      <p className="mt-1 text-xs leading-5 text-white/55">{text}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-auto pt-9">
                <div className="flex items-start gap-3 border-t border-white/10 pt-6 text-xs leading-5 text-white/48">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#d8bd73]" />
                  <span>Dados transmitidos com segurança e submetidos às regras de validação cadastral da GSA.</span>
                </div>
              </div>
            </div>
          </section>

          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-b-[2rem] bg-[#f8fafc] px-5 py-8 shadow-[0_30px_90px_rgba(0,0,0,.32)] sm:px-9 lg:rounded-r-[2rem] lg:rounded-bl-none lg:px-12 lg:py-12 xl:px-16"
          >
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-9">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#9a742b]">Solicitação de acesso PJ</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-black tracking-[-0.03em] text-[#0b1522] sm:text-3xl">
                      {stage === 'authorization'
                        ? 'Autorize o cadastro'
                        : stage === 'company'
                          ? 'Dados da empresa'
                          : 'Solicitação recebida'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#65717e]">
                      {stage === 'authorization'
                        ? 'Comece pela indicação ou pelo código público de cadastro.'
                        : stage === 'company'
                          ? 'Informe os dados oficiais que representarão a organização no portal.'
                          : 'A empresa concluiu a primeira etapa para entrar no GSA HUB Empresas.'}
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dbe1e7] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#526171]">
                    <LockKeyhole className="h-3.5 w-3.5 text-[#9a742b]" />
                    Ambiente seguro
                  </span>
                </div>
              </div>

              <ol className="mb-10 grid grid-cols-3 gap-2" aria-label="Progresso do cadastro">
                {progressSteps.map((item) => {
                  const isCurrent = item.number === activeStep;
                  const isComplete = item.number < activeStep;
                  return (
                    <li
                      key={item.number}
                      aria-current={isCurrent ? 'step' : undefined}
                      className="relative flex flex-col gap-2"
                    >
                      <div className="flex items-center">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black transition ${
                          isComplete
                            ? 'bg-emerald-600 text-white'
                            : isCurrent
                              ? 'bg-[#0b1828] text-white ring-4 ring-[#d8bd73]/20'
                              : 'bg-[#e8edf2] text-[#7b8794]'
                        }`}>
                          {isComplete ? <Check className="h-4 w-4" /> : item.number}
                        </span>
                        {item.number < progressSteps.length && (
                          <span className={`mx-2 h-px flex-1 ${isComplete ? 'bg-emerald-500' : 'bg-[#d8dee5]'}`} />
                        )}
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${
                        isCurrent ? 'text-[#0b1828]' : 'text-[#8994a0]'
                      }`}>
                        {item.label}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {stage === 'authorization' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#e9edf1] p-1.5" role="group" aria-label="Forma de autorização">
                    <button
                      type="button"
                      aria-pressed={voucherTab === 'com-indicacao'}
                      onClick={() => changeVoucherTab('com-indicacao')}
                      className={`min-h-11 rounded-lg px-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a742b] ${
                        voucherTab === 'com-indicacao'
                          ? 'bg-white text-[#0b1828] shadow-sm'
                          : 'text-[#687684] hover:text-[#0b1828]'
                      }`}
                    >
                      Com indicação
                    </button>
                    <button
                      type="button"
                      aria-pressed={voucherTab === 'sem-indicacao'}
                      onClick={() => changeVoucherTab('sem-indicacao')}
                      className={`min-h-11 rounded-lg px-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a742b] ${
                        voucherTab === 'sem-indicacao'
                          ? 'bg-white text-[#0b1828] shadow-sm'
                          : 'text-[#687684] hover:text-[#0b1828]'
                      }`}
                    >
                      Sem indicação
                    </button>
                  </div>

                  {voucherTab === 'sem-indicacao' && (
                    <div className="rounded-2xl border border-[#d9c38c] bg-[#fbf7ea] p-5 text-sm text-[#5c4920]">
                      {settingsLoading ? (
                        <span className="flex items-center gap-2 font-bold">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Consultando disponibilidade...
                        </span>
                      ) : settings.ativo ? (
                        <>
                          <div className="flex items-start gap-3">
                            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9a742b]" />
                            <div>
                              <p className="font-black">Cadastro público empresarial disponível</p>
                              <p className="mt-1 text-xs leading-5 text-[#776331]">
                                Use o código abaixo. A autorização será confirmada pelo servidor antes do envio dos dados.
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eadcb9] bg-white px-4 py-3">
                            <strong className="font-mono text-base tracking-wider text-[#0b1828]">{settings.codigo}</strong>
                            <button
                              type="button"
                              onClick={async () => {
                                setVoucherInput(settings.codigo);
                                if (await copyToClipboard(settings.codigo)) toast.success('Código copiado.');
                              }}
                              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-black text-[#795b1d] transition hover:bg-[#fbf7ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a742b]"
                            >
                              <Copy className="h-4 w-4" />
                              Copiar código
                            </button>
                          </div>
                          <p className="mt-3 text-xs">
                            Benefício após aprovação: {settings.tipo === 'pontos'
                              ? `${settings.valor} pontos`
                              : formatCurrency(settings.valor)}.
                          </p>
                        </>
                      ) : (
                        <div className="flex items-start gap-3">
                          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                          <div>
                            <p className="font-black">Cadastro sem indicação indisponível</p>
                            <p className="mt-1 text-xs leading-5">Utilize uma indicação válida ou tente novamente mais tarde.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!referralInfo ? (
                    <>
                      <label htmlFor="business-referral-token" className="grid gap-2 text-sm font-black text-[#344154]">
                        {voucherTab === 'com-indicacao' ? 'Celular usado na indicação' : 'Código público de cadastro'}
                        <input
                          id="business-referral-token"
                          name="referral-token"
                          type="text"
                          autoComplete="off"
                          inputMode={voucherTab === 'com-indicacao' ? 'numeric' : 'text'}
                          value={voucherInput}
                          onChange={(event) => setVoucherInput(
                            voucherTab === 'com-indicacao'
                              ? maskPhone(event.target.value)
                              : event.target.value.toUpperCase(),
                          )}
                          placeholder={voucherTab === 'com-indicacao' ? '(00) 00000-0000' : 'Digite o código'}
                          disabled={voucherTab === 'sem-indicacao' && !settings.ativo}
                          className={inputClass()}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handleValidateVoucher}
                        disabled={loading || settingsLoading || (voucherTab === 'sem-indicacao' && !settings.ativo)}
                        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1828] px-5 text-sm font-black text-white shadow-[0_12px_30px_rgba(11,24,40,.18)] transition hover:bg-[#142a43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a742b] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {loading ? 'Validando autorização...' : 'Validar e continuar'}
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                        <div>
                          <h3 className="font-black text-emerald-950">
                            {referralInfo.isDefaultCode
                              ? 'Cadastro público autorizado'
                              : 'Indicação empresarial confirmada'}
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-emerald-800">
                            A autorização foi validada com segurança. Agora informe os dados oficiais da empresa.
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => setReferralInfo(null)}
                          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-emerald-300 px-4 text-sm font-black text-emerald-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                          Alterar autorização
                        </button>
                        <button
                          type="button"
                          onClick={goToCompanyData}
                          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b1828] px-4 text-sm font-black text-white transition hover:bg-[#142a43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a742b]"
                        >
                          Continuar
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="flex items-start gap-2 text-xs leading-5 text-[#71808e]">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#9a742b]" />
                    A validação da autorização não cria o cadastro e nenhum dado empresarial é enviado nesta etapa.
                  </p>
                </div>
              )}

              {stage === 'company' && (
                <form onSubmit={handleRegister} noValidate className="space-y-6">
                  <div className="flex items-start gap-3 rounded-2xl border border-[#d9c38c] bg-[#fbf7ea] p-4 text-sm text-[#5c4920]">
                    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-[#9a742b]" />
                    <div>
                      <p className="font-black">Conta exclusiva para Pessoa Jurídica</p>
                      <p className="mt-1 text-xs leading-5">O acesso será criado como empresa e ficará separado do portal Pessoa Física.</p>
                    </div>
                  </div>

                  <fieldset className="space-y-5">
                    <legend className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-[#0b1828]">Identificação empresarial</legend>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="CNPJ" error={errors.cnpj} htmlFor="business-cnpj">
                        <input
                          id="business-cnpj"
                          name="cnpj"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          required
                          value={cnpj}
                          onChange={(event) => {
                            setCnpj(maskCNPJ(event.target.value));
                            setErrors((current) => ({ ...current, cnpj: undefined }));
                          }}
                          onBlur={() => {
                            if (cnpj && !validarCNPJ(cnpj.replace(/\D/g, ''))) {
                              setErrors((current) => ({ ...current, cnpj: 'Informe um CNPJ válido.' }));
                            }
                          }}
                          aria-invalid={Boolean(errors.cnpj)}
                          aria-describedby={errors.cnpj ? 'business-cnpj-error' : undefined}
                          placeholder="00.000.000/0000-00"
                          className={inputClass(errors.cnpj)}
                        />
                      </Field>

                      <Field label="Razão social" error={errors.nome} htmlFor="business-company-name">
                        <input
                          id="business-company-name"
                          name="nome"
                          type="text"
                          autoComplete="organization"
                          required
                          maxLength={180}
                          value={registrationData.nome}
                          onChange={(event) => updateField('nome', event.target.value)}
                          aria-invalid={Boolean(errors.nome)}
                          aria-describedby={errors.nome ? 'business-company-name-error' : undefined}
                          placeholder="Nome empresarial registrado"
                          className={inputClass(errors.nome)}
                        />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-5 border-t border-[#e0e5ea] pt-6">
                    <legend className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-[#0b1828]">Contato corporativo</legend>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="E-mail corporativo" error={errors.email} htmlFor="business-email">
                        <input
                          id="business-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          maxLength={254}
                          value={registrationData.email}
                          onChange={(event) => updateField('email', event.target.value)}
                          onBlur={() => {
                            if (registrationData.email && !validarEmail(registrationData.email.trim())) {
                              setErrors((current) => ({ ...current, email: 'Informe um e-mail válido.' }));
                            }
                          }}
                          aria-invalid={Boolean(errors.email)}
                          aria-describedby={errors.email ? 'business-email-error' : undefined}
                          placeholder="contato@empresa.com.br"
                          className={inputClass(errors.email)}
                        />
                      </Field>

                      <Field label="Celular / WhatsApp" error={errors.telefone} htmlFor="business-phone">
                        <input
                          id="business-phone"
                          name="telefone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                          maxLength={15}
                          value={registrationData.telefone}
                          onChange={(event) => updateField('telefone', maskPhone(event.target.value))}
                          aria-invalid={Boolean(errors.telefone)}
                          aria-describedby={errors.telefone ? 'business-phone-error' : undefined}
                          placeholder="(00) 00000-0000"
                          className={inputClass(errors.telefone)}
                        />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-5 border-t border-[#e0e5ea] pt-6">
                    <legend className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-[#0b1828]">Endereço da empresa</legend>
                    <div className="grid gap-5 sm:grid-cols-[1fr_150px]">
                      <Field label="CEP" error={errors.cep} htmlFor="business-cep">
                        <div className="relative">
                          <input
                            id="business-cep"
                            name="cep"
                            type="text"
                            inputMode="numeric"
                            autoComplete="postal-code"
                            required
                            maxLength={9}
                            value={registrationData.cep}
                            onChange={(event) => void handleCepChange(event.target.value)}
                            aria-invalid={Boolean(errors.cep)}
                            aria-describedby={errors.cep ? 'business-cep-error' : undefined}
                            placeholder="00000-000"
                            className={`${inputClass(errors.cep)} pr-11`}
                          />
                          {loadingCep
                            ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#9a742b]" />
                            : <MapPin className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a96a2]" />}
                        </div>
                      </Field>

                      <Field label="Número" error={errors.numero} htmlFor="business-number">
                        <input 
                          id="business-number"
                          name="numero"
                          type="text"
                          autoComplete="address-line2"
                          required
                          maxLength={20}
                          value={registrationData.numero}
                          inputMode="numeric" onChange={(event) => updateField('numero', event.target.value)}
                          aria-invalid={Boolean(errors.numero)}
                          aria-describedby={errors.numero ? 'business-number-error' : undefined}
                          className={inputClass(errors.numero)}
                        />
                      </Field>
                    </div>

                    <Field label="Endereço" error={errors.endereco} htmlFor="business-address">
                      <input
                        id="business-address"
                        name="endereco"
                        type="text"
                        autoComplete="street-address"
                        required
                        maxLength={220}
                        value={registrationData.endereco}
                        onChange={(event) => updateField('endereco', event.target.value)}
                        aria-invalid={Boolean(errors.endereco)}
                        aria-describedby={errors.endereco ? 'business-address-error' : undefined}
                        placeholder="Rua, avenida ou logradouro"
                        className={inputClass(errors.endereco)}
                      />
                    </Field>

                    <div className="grid gap-5 sm:grid-cols-[1fr_1fr_100px]">
                      <Field label="Bairro" error={errors.bairro} htmlFor="business-neighborhood">
                        <input
                          id="business-neighborhood"
                          name="bairro"
                          type="text"
                          required
                          maxLength={120}
                          value={registrationData.bairro}
                          onChange={(event) => updateField('bairro', event.target.value)}
                          aria-invalid={Boolean(errors.bairro)}
                          aria-describedby={errors.bairro ? 'business-neighborhood-error' : undefined}
                          className={inputClass(errors.bairro)}
                        />
                      </Field>

                      <Field label="Cidade" error={errors.cidade} htmlFor="business-city">
                        <input
                          id="business-city"
                          name="cidade"
                          type="text"
                          autoComplete="address-level2"
                          required
                          maxLength={120}
                          value={registrationData.cidade}
                          onChange={(event) => updateField('cidade', event.target.value)}
                          aria-invalid={Boolean(errors.cidade)}
                          aria-describedby={errors.cidade ? 'business-city-error' : undefined}
                          className={inputClass(errors.cidade)}
                        />
                      </Field>

                      <Field label="UF" error={errors.estado} htmlFor="business-state">
                        <input
                          id="business-state"
                          name="estado"
                          type="text"
                          autoComplete="address-level1"
                          required
                          maxLength={2}
                          value={registrationData.estado}
                          onChange={(event) => updateField('estado', event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                          aria-invalid={Boolean(errors.estado)}
                          aria-describedby={errors.estado ? 'business-state-error' : undefined}
                          className={inputClass(errors.estado)}
                        />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-5 border-t border-[#e0e5ea] pt-6">
                    <legend className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-[#0b1828]">Informações complementares</legend>
                    <Field label="Observações para análise (opcional)" htmlFor="business-notes">
                      <textarea
                        id="business-notes"
                        name="observacoes"
                        rows={3}
                        maxLength={2000}
                        value={registrationData.observacoes}
                        onChange={(event) => updateField('observacoes', event.target.value)}
                        placeholder="Inclua alguma informação importante para a análise da empresa."
                        className={`${inputClass()} min-h-24 resize-y py-3`}
                      />
                    </Field>

                    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                      errors.confirmation
                        ? 'border-red-300 bg-red-50'
                        : 'border-[#dbe1e7] bg-white hover:border-[#c8b06f]'
                    }`}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => {
                          setConfirmed(event.target.checked);
                          setErrors((current) => ({ ...current, confirmation: undefined }));
                        }}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#aeb8c2] accent-[#0b1828]"
                        aria-invalid={Boolean(errors.confirmation)}
                        aria-describedby={errors.confirmation ? 'business-confirmation-error' : undefined}
                      />
                      <span className="text-xs leading-5 text-[#586675]">
                        Confirmo que os dados informados representam a empresa e autorizo a GSA a utilizá-los para análise cadastral, contato e prestação dos serviços solicitados.
                        {errors.confirmation && (
                          <span id="business-confirmation-error" className="mt-1 block font-bold text-red-600">
                            {errors.confirmation}
                          </span>
                        )}
                      </span>
                    </label>
                  </fieldset>

                  <div className="flex flex-col-reverse gap-3 border-t border-[#e0e5ea] pt-6 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setStage('authorization')}
                      disabled={loading}
                      className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[#cfd6dd] bg-white px-5 text-sm font-black text-[#344154] transition hover:border-[#9da8b3] hover:text-[#0b1828] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a742b] disabled:opacity-55"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar
                    </button>
                    <button
                      type="submit"
                      disabled={loading || loadingCep}
                      className="inline-flex min-h-14 flex-[1.45] items-center justify-center gap-2 rounded-xl bg-[#0b1828] px-5 text-sm font-black text-white shadow-[0_12px_30px_rgba(11,24,40,.18)] transition hover:bg-[#142a43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a742b] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                      {loading ? 'Enviando...' : 'Continuar para ativação'}
                    </button>
                  </div>
                </form>
              )}

              {stage === 'whatsapp' && (
                <div className="pt-9">
                  <WhatsAppPinVerification
                    initialPhone={registrationData.telefone}
                    onVerified={(verifiedPhone) => {
                      updateField('telefone', verifiedPhone);
                      setStage('setup_pin');
                    }}
                    onCancel={() => setStage('company')}
                  />
                </div>
              )}

              {stage === 'setup_pin' && (
                <div className="pt-9">
                  <SetupAccessPin 
                    onComplete={submitFinalRegistration} 
                    loading={loading} 
                    onSuccess={onLogin}
                  />
                </div>
              )}
            </div>
          </motion.section>
        </div>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-5 text-center text-[11px] text-white/38 sm:flex-row sm:text-left">
          <span>© {new Date().getFullYear()} GSA HUB. Cadastro corporativo seguro.</span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#b88a35]" />
            Ambiente exclusivo para empresas.
          </span>
        </footer>
      </div>
    </main>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-black text-[#344154]">{label}</label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-2 text-xs font-bold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
