import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BadgeDollarSign,
  Check,
  ChevronRight,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { LogoGSA } from '../../components/ui/LogoGSA';
import { HomeLogoLink } from '../../components/ui/HomeLogoLink';
import { PinInput } from '../../components/ui/PinInput';
import { logService } from '../../lib/logService';
import { sessionService } from '../../lib/sessionService';
import { maskCNPJ, maskCPF, maskPhone } from '../../lib/utils';
import { validarCNPJ, validarCPF, validarEmail } from '../../utils/cpfValidator';
import '../../affiliates.css';

type AccessMode = 'login' | 'register';
type LoginStage = 'document' | 'pin';
type PixType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

interface AffiliateAccessPageProps {
  onLogin: (clientId?: string) => void;
  onBack: () => void;
  initialMode?: AccessMode;
}

const EMPTY_REGISTRATION = {
  documento: '',
  nome: '',
  email: '',
  telefone: '',
  nome_divulgacao: '',
  pix_tipo: 'cpf' as PixType,
  pix_chave: '',
  pin: '',
  pin_confirmacao: '',
  termos_aceitos: false,
};

const PIX_LABELS: Record<PixType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
};

function formatTaxDocument(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 11 ? maskCPF(digits) : maskCNPJ(digits.slice(0, 14));
}

function validateDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? validarCPF(digits) : digits.length === 14 && validarCNPJ(digits);
}

function formatPixKey(type: PixType, value: string) {
  if (type === 'cpf') return maskCPF(value.replace(/\D/g, '').slice(0, 11));
  if (type === 'cnpj') return maskCNPJ(value.replace(/\D/g, '').slice(0, 14));
  if (type === 'telefone') return maskPhone(value);
  return value;
}

function validatePixKey(type: PixType, value: string) {
  const clean = value.trim();
  if (type === 'cpf') return validarCPF(clean.replace(/\D/g, ''));
  if (type === 'cnpj') return validarCNPJ(clean.replace(/\D/g, ''));
  if (type === 'email') return validarEmail(clean);
  if (type === 'telefone') return clean.replace(/\D/g, '').length >= 10;
  return clean.length >= 20;
}

export function AffiliateAccessPage({ onLogin, onBack, initialMode = 'login' }: AffiliateAccessPageProps) {
  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [stage, setStage] = useState<LoginStage>('document');
  const [documentInput, setDocumentInput] = useState('');
  const [pin, setPin] = useState('');
  const [form, setForm] = useState(EMPTY_REGISTRATION);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: AccessMode) => {
    setMode(next);
    setStage('document');
    setPin('');
  };

  const updateForm = <K extends keyof typeof EMPTY_REGISTRATION>(field: K, value: (typeof EMPTY_REGISTRATION)[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const continueLogin = (event: FormEvent) => {
    event.preventDefault();
    if (!validateDocument(documentInput)) {
      toast.error('Informe o CPF ou CNPJ cadastrado na sua conta GSA.');
      return;
    }
    setStage('pin');
  };

  const authenticate = async (document: string, accessPin: string) => {
    const cleanDocument = document.replace(/\D/g, '');
    const data = await sessionService.loginWithPin(cleanDocument, accessPin, 'cliente');
    const currentSession = sessionService.getCurrentSession();
    if (!data?.valid && !data?.success && !currentSession?.atorId) {
      throw new Error(data?.error === 'blocked' ? 'Acesso temporariamente bloqueado.' : 'Documento ou PIN incorreto.');
    }
    return {
      ...data,
      clientId: data?.id || data?.atorId || data?.ator_id || data?.session?.ator_id || currentSession?.atorId || '',
      clientName: data?.nome || data?.atorNome || data?.ator_nome || currentSession?.atorNome || 'Afiliado',
    };
  };

  const login = async () => {
    if (pin.length !== 4 || loading) return;
    setLoading(true);
    try {
      const data = await authenticate(documentInput, pin);
      await logService.logAction({
        ator_tipo: 'cliente',
        ator_id: data.clientId,
        ator_nome: data.clientName,
        acao: 'LOGIN_AFILIADO',
        detalhes: 'Acesso efetuado pelo Portal do Afiliado',
      });
      toast.success('Acesso confirmado. Bem-vindo ao Portal do Afiliado.');
      onLogin(data.clientId);
    } catch (error: any) {
      setPin('');
      toast.error(error?.message || 'Não foi possível entrar no portal.');
    } finally {
      setLoading(false);
    }
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateDocument(form.documento)) return toast.error('Informe um CPF ou CNPJ válido.');
    if (form.nome.trim().length < 3) return toast.error('Informe seu nome completo ou razão social.');
    if (!validarEmail(form.email.trim())) return toast.error('Informe um e-mail válido.');
    if (form.telefone.replace(/\D/g, '').length < 10) return toast.error('Informe um telefone válido.');
    if (form.nome_divulgacao.trim().length < 3) return toast.error('Informe um nome de divulgação com pelo menos 3 caracteres.');
    if (!validatePixKey(form.pix_tipo, form.pix_chave)) return toast.error(`Informe uma chave PIX do tipo ${PIX_LABELS[form.pix_tipo]} válida.`);
    if (!/^\d{4}$/.test(form.pin)) return toast.error('Informe o PIN de 4 dígitos da sua conta GSA.');
    if (form.pin_confirmacao !== form.pin) return toast.error('A confirmação do PIN não corresponde ao PIN informado.');
    if (!form.termos_aceitos) return toast.error('É necessário concordar com os termos do programa.');

    setLoading(true);
    try {
      const data = await sessionService.registerAffiliate({
        documento: form.documento.replace(/\D/g, ''),
        nome: form.nome.trim(),
        nome_divulgacao: form.nome_divulgacao.trim(),
        email: form.email.trim().toLowerCase(),
        telefone: form.telefone.replace(/\D/g, ''),
        pin: form.pin,
        pix_tipo: form.pix_tipo,
        pix_chave: form.pix_chave.trim(),
        termos_versao: '2026-08-29',
        termos_aceitos: form.termos_aceitos,
      });
      await logService.logAction({
        ator_tipo: 'cliente',
        ator_id: data?.id || data?.session?.ator_id || '',
        ator_nome: data?.nome || data?.session?.ator_nome || form.nome.trim(),
        acao: 'ATIVAR_AFILIADO',
        detalhes: 'Perfil ativado após autenticação pelo Portal do Afiliado',
      });
      toast.success('Perfil de afiliado ativado com segurança.');
      onLogin(data?.id || data?.session?.ator_id);
    } catch (error: any) {
      await sessionService.endSession().catch(() => undefined);
      toast.error(error?.message || 'Não foi possível ativar o perfil de afiliado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="affiliate-page min-h-screen bg-[#f2efe7] text-[#142033]">
      <header className="border-b border-white/10 bg-[#0b1522] text-white">
        <div className="mx-auto flex h-[78px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <HomeLogoLink><LogoGSA size="sm" variant="light" showText /></HomeLogoLink>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/65 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ddc28d] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1522]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Voltar ao programa</span>
            <span className="sm:hidden">Voltar</span>
          </button>
        </div>
      </header>

      <div className={`mx-auto flex min-h-[calc(100vh-78px)] justify-center px-5 py-8 sm:px-8 sm:py-12 lg:px-12 ${mode === 'login' ? 'items-center' : 'items-start'}`}>
        <section className={`h-fit w-full rounded-[2rem] border border-[#d8c9aa] bg-white p-5 shadow-[0_24px_70px_rgba(11,21,34,0.12)] sm:p-8 ${mode === 'register' ? 'max-w-3xl' : 'max-w-[560px]'}`}>
          <div className="w-full">
            <div className="border-b border-[#c9c2b6] pb-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8d6829]">Acesso seguro</p>
              <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#0b1522] sm:text-4xl">
                    {mode === 'login' ? 'Entrar no Portal do Afiliado' : 'Ativar perfil de afiliado'}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#626a74]">
                    {mode === 'login'
                      ? 'Confirme seu documento e o PIN de acesso da conta GSA.'
                      : 'Autentique sua conta, defina o nome de divulgação e cadastre a chave PIX de recebimento.'}
                  </p>
                </div>
                <BadgeCheck className="hidden h-10 w-10 shrink-0 text-[#8d6829] sm:block" aria-hidden="true" />
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 border border-[#bcb4a8] bg-[#e8e1d5] p-1">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`min-h-12 px-4 text-sm font-bold transition-colors ${mode === 'login' ? 'bg-[#0b1522] text-white' : 'text-[#59616c] hover:bg-white/60 hover:text-[#0b1522]'}`}
              >
                Já sou afiliado
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`min-h-12 px-4 text-sm font-bold transition-colors ${mode === 'register' ? 'bg-[#0b1522] text-white' : 'text-[#59616c] hover:bg-white/60 hover:text-[#0b1522]'}`}
              >
                Ativar meu perfil
              </button>
            </div>

            {mode === 'login' && (
              <div className="mt-8 border-t-4 border-[#c59a4a] pt-6">
                {stage === 'document' ? (
                  <form onSubmit={continueLogin} className="space-y-6">
                    <div className="flex items-start gap-4 border-b border-[#e0dacf] pb-6">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#0b1522] text-[#ddc28d]"><KeyRound className="h-5 w-5" /></span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Etapa 1 de 2</p>
                        <h3 className="mt-1 text-xl font-semibold text-[#0b1522]">Identifique sua conta</h3>
                      </div>
                    </div>

                    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                      CPF ou CNPJ cadastrado na GSA
                      <input
                        required
                        autoComplete="username"
                        inputMode="numeric"
                        value={documentInput}
                        onChange={(event) => setDocumentInput(formatTaxDocument(event.target.value))}
                        placeholder="000.000.000-00"
                        className="affiliate-input mt-2"
                      />
                    </label>

                    <p className="text-xs leading-5 text-[#777f89]">Use o mesmo documento utilizado para acessar sua conta de cliente GSA.</p>

                    <button type="submit" className="inline-flex min-h-13 w-full items-center justify-center gap-2 bg-[#0b1522] px-5 text-sm font-bold text-white transition-colors hover:bg-[#24364b]">
                      Continuar para o PIN <ChevronRight className="h-4 w-4" />
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (pin.length === 4 && !loading) {
                        void login();
                      }
                    }}
                    className="space-y-7"
                  >
                    <div className="flex items-start gap-4 border-b border-[#e0dacf] pb-6">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#0b1522] text-[#ddc28d]"><LockKeyhole className="h-5 w-5" /></span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Etapa 2 de 2</p>
                        <h3 className="mt-1 text-xl font-semibold text-[#0b1522]">Confirme o PIN de acesso</h3>
                        <p className="mt-2 text-sm text-[#626a74]">Documento: <strong className="text-[#0b1522]">{documentInput}</strong></p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-4 text-center text-sm font-semibold text-[#4f5864]">Informe seu PIN de 4 dígitos</p>
                      <div className="flex justify-center">
                        <PinInput
                          value={pin}
                          onChange={setPin}
                          disabled={loading}
                          onEnter={() => {
                            if (pin.length === 4 && !loading) {
                              void login();
                            }
                          }}
                          onComplete={() => {
                            if (!loading) {
                              void login();
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t border-[#e0dacf] pt-6 sm:flex-row sm:items-center sm:justify-between">
                      <button type="button" onClick={() => { setStage('document'); setPin(''); }} className="text-sm font-semibold text-[#626a74] underline underline-offset-4 hover:text-[#0b1522]">
                        Alterar documento
                      </button>
                      <button
                        type="submit"
                        disabled={pin.length !== 4 || loading}
                        className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#0b1522] px-6 text-sm font-bold text-white transition-colors hover:bg-[#24364b] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {loading ? 'Confirmando acesso...' : 'Entrar no portal'} <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {mode === 'register' && (
              <form onSubmit={register} className="mt-8 border-t-4 border-[#c59a4a] pt-6">
                <div className="flex items-start gap-4 border-b border-[#e0dacf] pb-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#0b1522] text-[#ddc28d]"><BadgeDollarSign className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Cadastro aberto</p>
                    <h3 className="mt-1 text-xl font-semibold text-[#0b1522]">Crie seu perfil de afiliado</h3>
                    <p className="mt-2 text-sm leading-6 text-[#626a74]">Você não precisa ter um perfil de cliente. Se já possuir uma conta GSA, os perfis serão vinculados automaticamente pelo documento.</p>
                  </div>
                </div>

                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                    CPF ou CNPJ
                    <input
                      required
                      autoComplete="username"
                      inputMode="numeric"
                      value={form.documento}
                      onChange={(event) => updateForm('documento', formatTaxDocument(event.target.value))}
                      placeholder="000.000.000-00"
                      className="affiliate-input mt-2"
                    />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                    Nome completo ou razão social
                    <input
                      required
                      autoComplete="name"
                      maxLength={180}
                      value={form.nome}
                      onChange={(event) => updateForm('nome', event.target.value)}
                      placeholder="Seu nome completo"
                      className="affiliate-input mt-2"
                    />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                    E-mail
                    <input required type="email" autoComplete="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="seu@email.com" className="affiliate-input mt-2" />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                    Telefone ou WhatsApp
                    <input required inputMode="tel" autoComplete="tel" value={form.telefone} onChange={(event) => updateForm('telefone', maskPhone(event.target.value))} placeholder="(00) 00000-0000" className="affiliate-input mt-2" />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                    Crie um PIN de 4 dígitos
                    <input required type="password" autoComplete="new-password" inputMode="numeric" maxLength={4} value={form.pin} onChange={(event) => updateForm('pin', event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" className="affiliate-input mt-2 tracking-[0.35em]" />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                    Confirme o PIN
                    <input required type="password" autoComplete="new-password" inputMode="numeric" maxLength={4} value={form.pin_confirmacao} onChange={(event) => updateForm('pin_confirmacao', event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" className="affiliate-input mt-2 tracking-[0.35em]" />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864] sm:col-span-2">
                    Nome de divulgação
                    <input
                      required
                      value={form.nome_divulgacao}
                      onChange={(event) => updateForm('nome_divulgacao', event.target.value)}
                      placeholder="Nome que será exibido no seu portal"
                      className="affiliate-input mt-2"
                    />
                    <span className="mt-2 block text-[11px] normal-case tracking-normal text-[#777f89]">Pode ser seu nome, marca ou nome profissional.</span>
                  </label>
                </div>

                <div className="mt-8 border-t border-[#e0dacf] pt-7">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-[#8d6829]">02</span>
                    <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-[#0b1522]">Recebimento das comissões</h4>
                  </div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-[0.8fr_1.2fr]">
                    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                      Tipo de chave PIX
                      <select
                        value={form.pix_tipo}
                        onChange={(event) => {
                          updateForm('pix_tipo', event.target.value as PixType);
                          updateForm('pix_chave', '');
                        }}
                        className="affiliate-input mt-2"
                      >
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="telefone">Telefone</option>
                        <option value="aleatoria">Aleatória</option>
                      </select>
                    </label>

                    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                      Chave PIX
                      <input
                        required
                        value={form.pix_chave}
                        onChange={(event) => updateForm('pix_chave', formatPixKey(form.pix_tipo, event.target.value))}
                        placeholder={`Informe ${PIX_LABELS[form.pix_tipo].toLowerCase()}`}
                        className="affiliate-input mt-2"
                      />
                    </label>
                  </div>

                  <div className="mt-5 flex gap-3 border border-[#d8c9aa] bg-[#f8f3e8] p-4 text-xs leading-5 text-[#66583e]">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8d6829]" aria-hidden="true" />
                    A chave PIX pode ser atualizada depois no portal. Para sua segurança, ela aparece mascarada nos históricos de saque.
                  </div>
                </div>

                <label className="mt-7 flex cursor-pointer items-start gap-3 border border-[#d4cec3] bg-[#f5f2ec] p-4 text-sm leading-6 text-[#525b66]">
                  <input
                    type="checkbox"
                    checked={form.termos_aceitos}
                    onChange={(event) => updateForm('termos_aceitos', event.target.checked)}
                    className="affiliate-checkbox mt-1"
                  />
                  <span>Li e concordo com as regras de atribuição, janela de conversão, carência, estorno, saldo mínimo e pagamento das comissões.</span>
                </label>

                <div className="mt-7 flex flex-col gap-3 border-t border-[#e0dacf] pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-start gap-2 text-xs leading-5 text-[#777f89]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8d6829]" /> Seu documento será usado para evitar contas duplicadas e vincular perfis existentes.</p>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex min-h-13 shrink-0 items-center justify-center gap-2 bg-[#0b1522] px-7 text-sm font-bold text-white transition-colors hover:bg-[#24364b] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {loading ? 'Criando e ativando...' : 'Criar perfil de afiliado'} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
