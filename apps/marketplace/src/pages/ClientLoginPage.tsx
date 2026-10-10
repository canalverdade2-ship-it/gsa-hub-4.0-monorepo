import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { LogoGSA } from '../components/ui/LogoGSA';
import { HomeLogoLink } from '../components/ui/HomeLogoLink';
import { PinInput } from '../components/ui/PinInput';
import { sessionService, type ClientPersonType } from '../lib/sessionService';
import { logService } from '../lib/logService';
import { supabase } from '../lib/supabase';
import { maskCNPJ, maskCPF } from '../lib/utils';
import { validarCNPJ, validarCPF, validarEmail } from '../utils/cpfValidator';
import {
  buildFreeToolsProLoginReturnUrl,
  consumeFreeToolsProLoginReturn,
} from '../lib/freeToolsProLoginReturn';

type AccessMode = 'login' | 'recovery' | 'first_access';
type LoginStage = 'document' | 'pin';
type RecoveryStage = 'request' | 'code';
type FirstAccessStage = 'request' | 'code';

interface ClientLoginPageProps {
  personType: ClientPersonType;
  initialMode?: AccessMode;
  onLoginClient: (
    id: string,
    isRecovery?: boolean,
    personType?: ClientPersonType,
  ) => void | Promise<void>;
  onBack: () => void;
  onRegister: () => void;
}

export function ClientLoginPage({
  personType,
  initialMode = 'login',
  onLoginClient,
  onBack,
  onRegister,
}: ClientLoginPageProps) {
  const isBusiness = personType === 'pj';
  const documentLabel = isBusiness ? 'CNPJ' : 'CPF';
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [loginStage, setLoginStage] = useState<LoginStage>('document');
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage>('request');
  const [documentValue, setDocumentValue] = useState('');
  const [pin, setPin] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [firstAccessStage, setFirstAccessStage] = useState<FirstAccessStage>('request');
  const [firstAccessId, setFirstAccessId] = useState('');
  const [firstAccessCode, setFirstAccessCode] = useState('');
  const [firstAccessContact, setFirstAccessContact] = useState('');
  const [firstAccessPin, setFirstAccessPin] = useState('');
  const [firstAccessPinConfirm, setFirstAccessPinConfirm] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPasswordSuccessModal, setShowPasswordSuccessModal] = useState(false);
  const [registeredClientId, setRegisteredClientId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cnpjParam = params.get('cnpj') || params.get('document');
    const modeParam = params.get('mode');

    if (modeParam === 'first_access') {
      setMode('first_access');
    } else {
      setMode(initialMode);
    }

    if (cnpjParam) {
      const clean = cnpjParam.replace(/\D/g, '');
      setDocumentValue(isBusiness ? maskCNPJ(clean) : maskCPF(clean));
    } else {
      setDocumentValue('');
    }

    setLoginStage('document');
    setRecoveryStage('request');
    setPin('');
    setRecoveryEmail('');
    setRecoveryId('');
    setRecoveryCode('');
    setFirstAccessStage('request');
    setFirstAccessId('');
    setFirstAccessCode('');
    setFirstAccessContact('');
    setFirstAccessPin('');
    setFirstAccessPinConfirm('');
    setAttemptsLeft(null);
    setPinError(false);
  }, [initialMode, personType, isBusiness]);

  useEffect(() => {
    const previousTitle = document.title;
    const previousDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
    document.title = isBusiness
      ? 'Acesso Empresarial | GSA HUB Empresas'
      : 'Área do Cliente Pessoa Física | GSA HUB';
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      isBusiness
        ? 'Acesso seguro e exclusivo ao ambiente corporativo GSA HUB Empresas.'
        : 'Acesso seguro à Área do Cliente Pessoa Física da GSA HUB.',
    );

    return () => {
      document.title = previousTitle;
      if (previousDescription) {
        document.querySelector('meta[name="description"]')?.setAttribute('content', previousDescription);
      }
    };
  }, [isBusiness]);

  const cleanDocument = documentValue.replace(/\D/g, '');
  const isDocumentValid = isBusiness
    ? validarCNPJ(cleanDocument)
    : validarCPF(cleanDocument);

  const resetAccessState = (nextMode: AccessMode) => {
    setMode(nextMode);
    setLoginStage('document');
    setRecoveryStage('request');
    setPin('');
    setRecoveryId('');
    setRecoveryCode('');
    setFirstAccessStage('request');
    setFirstAccessId('');
    setFirstAccessCode('');
    setFirstAccessContact('');
    setFirstAccessPin('');
    setFirstAccessPinConfirm('');
    setAttemptsLeft(null);
    setPinError(false);
  };

  const handleDocumentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isDocumentValid) {
      toast.error(`Informe um ${documentLabel} válido.`);
      return;
    }

    setLoading(true);
    try {
      setLoginStage('pin');
    } finally {
      setLoading(false);
    }
  };

  const confirmExpectedAccountType = async (clientId: string) => {
    const resolvedType = await sessionService.resolveAuthenticatedClientPersonType(clientId);
    if (resolvedType && resolvedType !== personType) {
      await sessionService.endSession();
      throw new Error(
        resolvedType === 'pj'
          ? 'Este cadastro pertence a uma empresa. Use a Área do Cliente Empresa — PJ.'
          : 'Este cadastro pertence a uma pessoa física. Use a Área do Cliente Pessoa Física — PF.',
      );
    }
    sessionService.setClientPersonType(personType);
  };

  const completeLogin = async (clientId: string, isRecovery = false) => {
    const pendingTool = isRecovery ? null : consumeFreeToolsProLoginReturn();
    await onLoginClient(clientId, isRecovery, personType);
    if (pendingTool) {
      window.location.replace(buildFreeToolsProLoginReturnUrl(pendingTool));
    }
  };

  const handleLogin = async () => {
    if (pin.length !== 4 || loading) return;
    setLoading(true);
    setPinError(false);

    try {
      const data = await sessionService.loginWithPin(cleanDocument, pin, 'cliente');
      if (!data?.valid) {
        if (data?.error === 'primeiro_acesso') {
          setMode('first_access');
          toast.success('Primeiro acesso identificado! Confirme seus dados e cadastre sua senha.');
          return;
        }
        setPinError(true);
        setPin('');
        setAttemptsLeft(typeof data?.attempts_left === 'number' ? data.attempts_left : null);
        toast.error(
          data?.error === 'blocked'
            ? 'Acesso temporariamente bloqueado. Entre em contato com o suporte.'
            : `${documentLabel} ou senha inválidos.`,
        );
        return;
      }

      await confirmExpectedAccountType(data.id);
      await logService.logAction({
        ator_tipo: 'cliente',
        ator_id: data.id,
        ator_nome: data.nome,
        acao: 'LOGIN',
        detalhes: isBusiness
          ? 'Acesso via GSA HUB Empresas'
          : 'Acesso via portal Pessoa Física',
      });
      toast.success(isBusiness ? 'Bem-vindo ao GSA HUB Empresas.' : 'Login realizado com sucesso.');
      await completeLogin(data.id);
    } catch (error: any) {
      setPinError(true);
      setPin('');
      toast.error(error?.message || `${documentLabel} ou senha inválidos.`);
    } finally {
      setLoading(false);
    }
  };

  const handleFirstAccessRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!isDocumentValid) {
      toast.error(`Informe um ${documentLabel} válido.`);
      return;
    }
    if (!validarEmail(firstAccessContact)) {
      toast.error('Informe o e-mail cadastrado.');
      return;
    }
    if (firstAccessPin.length !== 4) {
      toast.error('Informe uma senha numérica de 4 dígitos.');
      return;
    }
    if (firstAccessPin !== firstAccessPinConfirm) {
      toast.error('As senhas informadas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const data = await sessionService.requestClientFirstAccess(
        cleanDocument,
        firstAccessContact.trim().toLowerCase(),
        firstAccessPin,
      );
      if (!data?.success || !data?.challenge_id) {
        throw new Error('Não foi possível iniciar a confirmação do primeiro acesso.');
      }
      setFirstAccessId(data.challenge_id);
      setFirstAccessCode('');
      setFirstAccessStage('code');
      toast.success('Se os dados conferirem, enviaremos um código ao e-mail cadastrado.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível iniciar o primeiro acesso.');
    } finally {
      setLoading(false);
    }
  };

  const handleFirstAccessComplete = async (event: FormEvent) => {
    event.preventDefault();
    if (!firstAccessId || firstAccessCode.length !== 6 || loading) {
      toast.error('Informe o código de seis dígitos enviado ao seu e-mail.');
      return;
    }

    setLoading(true);
    try {
      const email = firstAccessContact.trim().toLowerCase();
      const { error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: firstAccessCode,
        type: 'email',
      });
      if (otpError) throw new Error('Código inválido ou expirado.');

      const data = await sessionService.completeClientFirstAccess(firstAccessId, firstAccessPin);
      if (!data?.success || !data?.id) {
        throw new Error('Não foi possível concluir o primeiro acesso.');
      }
      await confirmExpectedAccountType(data.id);
      await logService.logAction({
        ator_tipo: 'cliente',
        ator_id: data.id,
        ator_nome: data.nome,
        acao: 'PRIMEIRO_ACESSO_SENHA',
        detalhes: isBusiness
          ? 'Senha cadastrada no Primeiro Acesso GSA HUB Empresas'
          : 'Senha cadastrada no Primeiro Acesso portal Pessoa Física',
      });
      toast.success(isBusiness ? 'Senha cadastrada com sucesso!' : 'Senha cadastrada com sucesso.');
      if (isBusiness) {
        setRegisteredClientId(data.id);
        setShowPasswordSuccessModal(true);
      } else {
        await completeLogin(data.id);
      }
    } catch (error: any) {
      await supabase.auth.signOut({ scope: 'local' });
      setFirstAccessCode('');
      toast.error(error?.message || 'Não foi possível concluir o primeiro acesso.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!isDocumentValid || !validarEmail(recoveryEmail)) {
      toast.error(`Informe ${documentLabel} e e-mail válidos.`);
      return;
    }

    setLoading(true);
    try {
      const data = await sessionService.requestClientRecovery(
        cleanDocument,
        recoveryEmail.trim().toLowerCase(),
      );
      if (!data?.success || !data?.recovery_id) {
        throw new Error('Não foi possível iniciar a recuperação.');
      }
      setRecoveryId(data.recovery_id);
      setRecoveryStage('code');
      setRecoveryCode('');
      toast.success('Enviamos um código de confirmação para o e-mail cadastrado.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível iniciar a recuperação.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!recoveryId || recoveryCode.length !== 6 || loading) {
      toast.error('Informe o código de seis dígitos enviado ao seu e-mail.');
      return;
    }

    setLoading(true);
    try {
      const email = recoveryEmail.trim().toLowerCase();
      const { error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: recoveryCode,
        type: 'email',
      });
      if (otpError) throw new Error('Código inválido ou expirado.');

      const data = await sessionService.completeClientRecovery(recoveryId);
      if (!data?.success || !data?.id) {
        throw new Error('Não foi possível concluir a recuperação.');
      }

      await confirmExpectedAccountType(data.id);
      toast.success('Identidade confirmada. Agora crie sua nova senha.');
      await completeLogin(data.id, true);
    } catch (error: any) {
      await supabase.auth.signOut({ scope: 'local' });
      setRecoveryCode('');
      toast.error(error?.message || 'Não foi possível confirmar o código.');
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentChange = (value: string) => {
    setDocumentValue(isBusiness ? maskCNPJ(value) : maskCPF(value));
  };

  const pageBackground = isBusiness
    ? 'bg-[#07111f] text-white'
    : 'bg-[radial-gradient(circle_at_top_left,#fff8e8_0%,#f8f7f4_42%,#eef1f4_100%)] text-[#142030]';

  return (
    <main className={`relative min-h-screen overflow-hidden ${pageBackground}`}>
      <a
        href="#access-form"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-white px-4 py-3 text-sm font-bold text-[#0b1522] shadow-xl focus:translate-y-0"
      >
        Ir para o formulário de acesso
      </a>

      {isBusiness && (
        <>
          <div className="pointer-events-none absolute -left-24 top-24 h-80 w-80 rounded-full bg-[#b88a35]/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-[#31577b]/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:64px_64px]" />
        </>
      )}

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
        <header className="flex min-h-14 items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 ${
              isBusiness
                ? 'border-white/15 bg-white/[0.04] text-white/80 hover:border-[#d8bd73]/55 hover:text-white focus-visible:ring-[#d8bd73]'
                : 'border-[#142030]/10 bg-white/80 text-[#142030] shadow-sm hover:border-[#d8bd73] focus-visible:ring-[#8a651f]'
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          <div className="flex items-center gap-3">
            {isBusiness && (
              <span className="hidden rounded-full border border-[#d8bd73]/30 bg-[#d8bd73]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#edcf83] sm:inline-flex">
                Ambiente empresarial
              </span>
            )}
            <HomeLogoLink><LogoGSA size="sm" variant={isBusiness ? 'light' : 'dark'} showText /></HomeLogoLink>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8 lg:py-12">
          <div className={`mx-auto w-full max-w-[560px] overflow-hidden border shadow-2xl ${
            isBusiness
              ? 'rounded-[2rem] border-white/10 bg-[#0b1726]/90 shadow-black/40'
              : 'rounded-[2rem] border-[#d8bd73]/30 bg-white shadow-[#142030]/15'
          }`}>
            <motion.section
              id="access-form"
              initial={reduceMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3 }}
              className={`p-6 text-[#0b1522] sm:p-10 lg:p-12 ${isBusiness ? 'bg-[#fbfcfd]' : 'bg-white'}`}
              aria-labelledby="access-title"
            >
              <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a651f]">
                      {mode === 'first_access'
                        ? 'Primeiro Acesso'
                        : mode === 'recovery'
                          ? 'Recuperação segura'
                          : 'Acesso protegido'}
                    </p>
                    <h2 id="access-title" className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0b1522] sm:text-3xl">
                      {mode === 'first_access'
                        ? 'Cadastre sua senha'
                        : mode === 'recovery'
                          ? 'Recupere seu acesso'
                          : isBusiness
                            ? 'Entre na conta da empresa'
                            : 'Entre na sua conta'}
                    </h2>
                  </div>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#d8bd73]/35 bg-[#fff9ea] text-[#8a651f]">
                    {mode === 'recovery' ? <KeyRound className="h-6 w-6" /> : <Fingerprint className="h-6 w-6" />}
                  </span>
                </div>

                {mode === 'login' && (
                  <div className="mt-7 flex items-center gap-3" aria-label={`Etapa ${loginStage === 'document' ? 1 : 2} de 2`}>
                    {[1, 2].map((step) => {
                      const active = step <= (loginStage === 'document' ? 1 : 2);
                      return (
                        <div key={step} className="flex flex-1 items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                            active ? 'bg-[#0b1522] text-white' : 'bg-[#e8ecf1] text-[#718096]'
                          }`}>{step}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            active ? 'text-[#0b1522]' : 'text-[#94a0ad]'
                          }`}>{step === 1 ? documentLabel : 'Senha'}</span>
                          {step === 1 && <span className="ml-auto h-px flex-1 bg-[#e0e5ea]" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {mode === 'login' && loginStage === 'document' && (
                  <form onSubmit={handleDocumentSubmit} className="mt-8 space-y-5">
                    <label htmlFor={`login-document-${personType}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                      {documentLabel}
                      <input
                        id={`login-document-${personType}`}
                        name="documento"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        autoFocus
                        value={documentValue}
                        onChange={(event) => handleDocumentChange(event.target.value)}
                        placeholder={isBusiness ? '00.000.000/0000-00' : '000.000.000-00'}
                        className="min-h-14 w-full rounded-xl border border-[#d7dde3] bg-white px-4 text-base text-[#0b1522] outline-none transition placeholder:text-[#9aa4af] focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-5 text-sm font-black text-white shadow-lg shadow-[#0b1522]/15 transition hover:bg-[#14263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] focus-visible:ring-offset-2 active:scale-[0.99] disabled:opacity-60"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Verificando...' : 'Continuar'}
                      {!loading && <ArrowRight className="h-4 w-4" />}
                    </button>

                    <div className="flex flex-col gap-1.5 pt-2">
                      <button
                        type="button"
                        onClick={() => resetAccessState('recovery')}
                        className="min-h-9 w-full text-center text-xs font-bold text-[#718096] transition hover:text-[#0b1522] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                  </form>
                )}

                {mode === 'login' && loginStage === 'pin' && (
                  <div className="mt-8 space-y-6">
                    <div className="rounded-xl border border-[#dfe5ea] bg-white p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#81909e]">{documentLabel} informado</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <strong className="text-sm text-[#0b1522]">{documentValue}</strong>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginStage('document');
                            setPin('');
                            setPinError(false);
                          }}
                          className="min-h-10 rounded-lg px-3 text-xs font-black text-[#8a651f] hover:bg-[#fff9ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                        >
                          Alterar
                        </button>
                      </div>
                    </div>

                    <PinInput
                      value={pin}
                      onChange={(value) => {
                        setPin(value);
                        setPinError(false);
                      }}
                      error={pinError}
                      disabled={loading}
                      label="Senha numérica de quatro dígitos"
                      onEnter={() => void handleLogin()}
                      onComplete={() => void handleLogin()}
                    />

                    {attemptsLeft !== null && attemptsLeft <= 2 && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700" role="alert">
                        {attemptsLeft} tentativa(s) restante(s).
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleLogin()}
                      disabled={loading || pin.length !== 4}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-5 text-sm font-black text-white shadow-lg shadow-[#0b1522]/15 transition hover:bg-[#14263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                      {loading ? 'Verificando...' : isBusiness ? 'Acessar GSA HUB Empresas' : 'Acessar minha área'}
                    </button>

                    <div className="flex flex-col gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => resetAccessState('recovery')}
                        className="min-h-9 w-full text-center text-xs font-bold text-[#718096] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                  </div>
                )}

                {mode === 'first_access' && firstAccessStage === 'request' && (
                  <form onSubmit={handleFirstAccessRequest} className="mt-6 space-y-5">
                    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-950">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <div>
                        <strong className="block font-bold text-emerald-950">Primeiro Acesso — Definir Senha</strong>
                        Confirme o código enviado ao e-mail cadastrado antes de criar sua senha numérica de 4 dígitos.
                      </div>
                    </div>

                    <label htmlFor={`first-access-document-${personType}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                      {documentLabel}
                      <input
                        id={`first-access-document-${personType}`}
                        name="documento-primeiro-acesso"
                        type="text"
                        inputMode="numeric"
                        required
                        value={documentValue}
                        onChange={(event) => handleDocumentChange(event.target.value)}
                        placeholder={isBusiness ? '00.000.000/0000-00' : '000.000.000-00'}
                        className="min-h-14 w-full rounded-xl border border-[#d7dde3] bg-white px-4 text-base outline-none transition focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                      />
                    </label>

                    <label htmlFor={`first-access-contact-${personType}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                      E-mail cadastrado
                      <input
                        id={`first-access-contact-${personType}`}
                        name="email-primeiro-acesso"
                        type="email"
                        autoComplete="email"
                        required
                        value={firstAccessContact}
                        onChange={(event) => setFirstAccessContact(event.target.value)}
                        placeholder={isBusiness ? 'contato@empresa.com.br' : 'email@exemplo.com'}
                        className="min-h-14 w-full rounded-xl border border-[#d7dde3] bg-white px-4 text-base outline-none transition placeholder:text-[#9aa4af] focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                      />
                    </label>

                    <div className="space-y-4 pt-2">
                      <PinInput
                        value={firstAccessPin}
                        onChange={(val) => setFirstAccessPin(val)}
                        disabled={loading}
                        label="Nova senha de 4 dígitos"
                      />

                      <PinInput
                        value={firstAccessPinConfirm}
                        onChange={(val) => setFirstAccessPinConfirm(val)}
                        disabled={loading}
                        label="Confirme a nova senha de 4 dígitos"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || firstAccessPin.length !== 4 || firstAccessPinConfirm.length !== 4}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-5 text-sm font-black text-white transition hover:bg-[#14263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] disabled:opacity-55"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Enviando...' : 'Enviar código de confirmação'}
                    </button>

                    <button
                      type="button"
                      onClick={() => resetAccessState('login')}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm font-bold text-[#344154] hover:text-[#0b1522] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar ao login
                    </button>
                  </form>
                )}

                {mode === 'first_access' && firstAccessStage === 'code' && (
                  <form onSubmit={handleFirstAccessComplete} className="mt-8 space-y-5">
                    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                      Digite o código enviado para <strong className="break-all">{firstAccessContact}</strong>. A senha só será criada depois dessa confirmação.
                    </div>

                    <label htmlFor={`first-access-code-${personType}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                      Código de seis dígitos
                      <input
                        id={`first-access-code-${personType}`}
                        name="codigo-primeiro-acesso"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        value={firstAccessCode}
                        onChange={(event) => setFirstAccessCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="min-h-16 w-full rounded-xl border border-[#d7dde3] bg-white px-4 text-center font-mono text-2xl tracking-[0.45em] outline-none transition focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={loading || firstAccessCode.length !== 6}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-5 text-sm font-black text-white transition hover:bg-[#14263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] disabled:opacity-55"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Confirmando...' : isBusiness ? 'Confirmar e acessar GSA HUB Empresas' : 'Confirmar e acessar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFirstAccessStage('request');
                        setFirstAccessCode('');
                      }}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm font-bold text-[#344154] hover:text-[#0b1522] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Reenviar código
                    </button>
                  </form>
                )}

                {mode === 'recovery' && recoveryStage === 'request' && (
                  <form onSubmit={handleRecoveryRequest} className="mt-8 space-y-5">
                    <div className="flex items-start gap-3 rounded-xl border border-[#d8bd73]/35 bg-[#fff9ea] p-4 text-xs leading-5 text-[#634a1e]">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#8a651f]" />
                      A redefinição só será liberada após confirmar o código enviado ao e-mail cadastrado.
                    </div>

                    <label htmlFor={`recovery-document-${personType}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                      {documentLabel}
                      <input
                        id={`recovery-document-${personType}`}
                        name="documento-recuperacao"
                        type="text"
                        inputMode="numeric"
                        required
                        value={documentValue}
                        onChange={(event) => handleDocumentChange(event.target.value)}
                        placeholder={isBusiness ? '00.000.000/0000-00' : '000.000.000-00'}
                        className="min-h-14 w-full rounded-xl border border-[#d7dde3] bg-white px-4 text-base outline-none transition focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                      />
                    </label>

                    <label htmlFor={`recovery-email-${personType}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                      E-mail cadastrado
                      <input
                        id={`recovery-email-${personType}`}
                        name="email-recuperacao"
                        type="email"
                        autoComplete="email"
                        required
                        value={recoveryEmail}
                        onChange={(event) => setRecoveryEmail(event.target.value)}
                        placeholder={isBusiness ? 'financeiro@suaempresa.com.br' : 'voce@exemplo.com'}
                        className="min-h-14 w-full rounded-xl border border-[#d7dde3] bg-white px-4 text-base outline-none transition placeholder:text-[#9aa4af] focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-5 text-sm font-black text-white transition hover:bg-[#14263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] disabled:opacity-55"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Enviando...' : 'Enviar código de confirmação'}
                    </button>
                  </form>
                )}

                {mode === 'recovery' && recoveryStage === 'code' && (
                  <form onSubmit={handleRecoveryCode} className="mt-8 space-y-5">
                    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                      Código enviado para <strong className="break-all">{recoveryEmail}</strong>.
                    </div>

                    <label htmlFor={`recovery-code-${personType}`} className="grid gap-2 text-sm font-bold text-[#344154]">
                      Código de seis dígitos
                      <input
                        id={`recovery-code-${personType}`}
                        name="codigo-recuperacao"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        value={recoveryCode}
                        onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="min-h-16 w-full rounded-xl border border-[#d7dde3] bg-white px-4 text-center font-mono text-2xl tracking-[0.45em] outline-none transition focus:border-[#8a651f] focus:ring-4 focus:ring-[#d8bd73]/15"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={loading || recoveryCode.length !== 6}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-5 text-sm font-black text-white transition hover:bg-[#14263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] disabled:opacity-55"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Confirmando...' : 'Confirmar identidade'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryStage('request');
                        setRecoveryCode('');
                      }}
                      className="min-h-11 w-full text-sm font-bold text-[#8a651f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                    >
                      Reenviar código
                    </button>
                  </form>
                )}

                {mode === 'recovery' && (
                  <button
                    type="button"
                    onClick={() => resetAccessState('login')}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm font-bold text-[#344154] hover:text-[#0b1522] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar ao login
                  </button>
                )}

                <div className="mt-8 border-t border-[#e2e7eb] pt-6">
                  <p className="text-center text-xs leading-5 text-[#71808e]">
                    Ainda não possui cadastro?
                  </p>
                  <button
                    type="button"
                    onClick={onRegister}
                    className="mt-2 min-h-11 w-full text-center text-sm font-black text-[#0b1522] hover:text-[#8a651f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                  >
                    {isBusiness ? 'Solicitar acesso empresarial' : 'Criar meu cadastro'}
                  </button>
                </div>
              </div>
            </motion.section>
          </div>
        </div>

        <footer className={`flex flex-col items-center justify-between gap-3 border-t py-5 text-center text-[11px] sm:flex-row sm:text-left ${
          isBusiness ? 'border-white/10 text-white/38' : 'border-[#142030]/10 text-[#65717c]'
        }`}>
          <span>© {new Date().getFullYear()} GSA HUB. Ambiente seguro e de uso exclusivo.</span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#b88a35]" />
            Seus dados não são exibidos antes da autenticação.
          </span>
        </footer>
      </div>

      {showPasswordSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white p-6 shadow-2xl">
            <div className="text-center py-4 px-2">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <h3 className="mt-5 text-xl font-black text-neutral-900 sm:text-2xl">
                Senha cadastrada com sucesso!
              </h3>

              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Senha criada e ativada com segurança
              </div>

              <p className="mt-4 text-sm leading-6 text-neutral-600">
                Sua conta está preparada. Ao acessar o portal, o módulo <strong>Dashboard</strong> estará visível e o módulo <strong>Meu Cadastro</strong> estará disponível para acompanhamento da liberação dos demais serviços.
              </p>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordSuccessModal(false);
                    if (registeredClientId) completeLogin(registeredClientId);
                  }}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1522] px-6 text-sm font-black text-white shadow-lg shadow-[#0b1522]/20 transition hover:bg-[#15273c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f]"
                >
                  Acessar portal empresa
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
