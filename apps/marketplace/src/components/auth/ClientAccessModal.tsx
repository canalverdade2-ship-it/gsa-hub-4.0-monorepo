import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Copy, Loader2, Lock, MessageCircle, ShieldAlert, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { PinInput } from '../ui/PinInput';
import { sessionService } from '../../lib/sessionService';
import { logService } from '../../lib/logService';
import { supabase } from '../../lib/supabase';
import { copyToClipboard, formatCurrency, maskCNPJ, maskCPF, maskPhone } from '../../lib/utils';
import { validarCNPJ, validarCPF, validarEmail } from '../../utils/cpfValidator';
import { consultarCEP } from '../../utils/viaCep';
import { usePublicRegistrationSettings } from '../../hooks/usePublicRegistrationSettings';
import { WhatsAppPinVerification } from './WhatsAppPinVerification';
import { SetupAccessPin } from './SetupAccessPin';
import type { ClientPersonType } from '../../lib/sessionService';

export type ClientAccessMode = 'login' | 'first_access' | 'recovery' | 'register';

type PersonType = 'pf' | 'pj';
type RegisterStage = 'voucher' | 'confirm' | 'form' | 'whatsapp' | 'setup_pin';

interface ClientAccessModalProps {
  isOpen: boolean;
  initialMode?: ClientAccessMode;
  initialPersonType?: ClientPersonType;
  onClose: () => void;
  onLoginClient: (id: string, isRecovery?: boolean, personType?: ClientPersonType) => void;
}

const emptyRegistration = {
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
};

type ActiveChallenge = {
  challengeId: string;
  expiresIn: number;
  destination: string;
  formData: typeof emptyRegistration | null;
};

export function ClientAccessModal({ isOpen, initialMode = 'login', initialPersonType = 'pf', onClose, onLoginClient }: ClientAccessModalProps) {
  const [mode, setMode] = useState<ClientAccessMode>(initialMode);
  const [personType, setPersonType] = useState<PersonType>(initialPersonType);
  const [documento, setDocumento] = useState('');
  const [loginStage, setLoginStage] = useState<'document' | 'pin'>('document');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryStage, setRecoveryStage] = useState<'request' | 'code'>('request');
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registerStage, setRegisterStage] = useState<RegisterStage>('voucher');
  const [voucherTab, setVoucherTab] = useState<'com-indicacao' | 'sem-indicacao'>('com-indicacao');
  const [voucherInput, setVoucherInput] = useState('');
  const [referralInfo, setReferralInfo] = useState<{ kind?: string; isDefaultCode?: boolean } | null>(null);
  const [registrationData, setRegistrationData] = useState(emptyRegistration);
  // Estado para desafio WhatsApp ativo detectado pelo CPF
  const [activeChallenge, setActiveChallenge] = useState<ActiveChallenge | null>(null);
  const [checkingChallenge, setCheckingChallenge] = useState(false);
  const lastCheckedDocRef = useRef('');
  const { settings, loading: settingsLoading } = usePublicRegistrationSettings(isOpen && mode === 'register');

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setPersonType(initialPersonType);
    setLoginStage('document');
    setPin('');
    setPinConfirm('');
    setPhone('');
    setRecoveryEmail('');
    setRecoveryStage('request');
    setRecoveryId('');
    setRecoveryCode('');
    setAttemptsLeft(null);
    setPinError(false);
    setRegisterStage('voucher');
    setVoucherInput('');
    setReferralInfo(null);
    setActiveChallenge(null);
    lastCheckedDocRef.current = '';
  }, [initialMode, initialPersonType, isOpen]);

  useEffect(() => {
    if (voucherTab === 'sem-indicacao' && settings.ativo && settings.codigo) {
      setVoucherInput(settings.codigo);
    }
  }, [voucherTab, settings.ativo, settings.codigo]);

  // Detecção automática de desafio WhatsApp ativo ao digitar o CPF no formulário de cadastro
  useEffect(() => {
    if (mode !== 'register' || registerStage !== 'form') return;
    const cleanDoc = documento.replace(/\D/g, '');
    const expectedLength = personType === 'pf' ? 11 : 14;
    if (cleanDoc.length !== expectedLength) return;
    
    // Só consulta se for matematicamente válido
    if (personType === 'pf' && !validarCPF(cleanDoc)) return;
    if (personType === 'pj' && !validarCNPJ(cleanDoc)) return;

    if (lastCheckedDocRef.current === cleanDoc) return;

    lastCheckedDocRef.current = cleanDoc;
    setCheckingChallenge(true);

    supabase.functions.invoke('gsa-auth-session', {
      body: { action: 'check_provider_registration_code', payload: { documento: cleanDoc } },
    }).then(({ data }) => {
      if (data?.registered) {
        toast(`Este ${personType === 'pf' ? 'CPF' : 'CNPJ'} já possui cadastro. Faça login para acessar.`, { icon: 'ℹ️' });
        changeMode('login');
        setDocumento(cleanDoc);
        return;
      }
      if (data?.active && data?.challenge_id) {
        setActiveChallenge({
          challengeId: data.challenge_id,
          expiresIn: Number(data.expires_in || 0),
          destination: data.destination || 'WhatsApp cadastrado',
          formData: data.form_data || null,
        });
      }
    }).catch(() => {
      // Falha silenciosa — o usuário pode continuar normalmente
    }).finally(() => {
      setCheckingChallenge(false);
    });
  }, [documento, personType, mode, registerStage]);


  const cleanDocument = () => documento.replace(/\D/g, '');
  const validDocumentLength = () => cleanDocument().length === (personType === 'pf' ? 11 : 14);

  const changeMode = (nextMode: ClientAccessMode) => {
    setMode(nextMode);
    setLoginStage('document');
    setPin('');
    setPinConfirm('');
    setPhone('');
    setRecoveryStage('request');
    setRecoveryId('');
    setRecoveryCode('');
    setPinError(false);
    setAttemptsLeft(null);
  };

  const handleDocumentContinue = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validDocumentLength()) {
      toast.error(`Informe um ${personType === 'pf' ? 'CPF' : 'CNPJ'} válido.`);
      return;
    }
    setLoginStage('pin');
  };

  const handleLogin = async () => {
    if (pin.length !== 4 || loading) return;
    setLoading(true);
    setPinError(false);
    try {
      const data = await sessionService.loginWithPin(cleanDocument(), pin, 'cliente');
      if (data?.valid) {
        await logService.logAction({ ator_tipo: 'cliente', ator_id: data.id, ator_nome: data.nome, acao: 'LOGIN', detalhes: 'Acesso via portal principal' });
        toast.success('Login realizado com sucesso.');
        onLoginClient(data.id, false, personType);
        return;
      }
      setPinError(true);
      setPin('');
      setAttemptsLeft(typeof data?.attempts_left === 'number' ? data.attempts_left : null);
      toast.error(data?.error === 'blocked' ? 'Acesso temporariamente bloqueado. Entre em contato com o suporte.' : 'Documento ou senha inválidos.');
    } catch (error: any) {
      setPinError(true);
      setPin('');
      toast.error(error?.message || 'Documento ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  const handleFirstAccess = () => {
    setPhone('');
    setPin('');
    setPinConfirm('');
    changeMode('recovery');
    toast('Por segurança, o primeiro acesso exige o código enviado ao e-mail cadastrado.');
  };

  const handleRecovery = async () => {
    if (!validDocumentLength() || !validarEmail(recoveryEmail)) {
      toast.error('Informe documento e e-mail válidos.');
      return;
    }
    setLoading(true);
    try {
      const data = await sessionService.requestClientRecovery(cleanDocument(), recoveryEmail.trim().toLowerCase());
      if (!data?.success || !data?.recovery_id) throw new Error('Não foi possível iniciar a recuperação.');
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

  const handleRecoveryCode = async () => {
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
      if (!data?.success) throw new Error('Não foi possível concluir a recuperação.');

      toast.success('Identidade confirmada. Crie sua nova senha.');
      onLoginClient(data.id, true, personType);
    } catch (error: any) {
      await supabase.auth.signOut({ scope: 'local' });
      setRecoveryCode('');
      toast.error(error?.message || 'Não foi possível confirmar o código.');
    } finally {
      setLoading(false);
    }
  };

  const handleValidateVoucher = async () => {
    if (!voucherInput.trim()) {
      toast.error(voucherTab === 'com-indicacao' ? 'Informe o celular usado na indicação.' : 'Informe o código de cadastro.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('gsa_public_lookup_referral', { p_token: voucherInput.trim() });
      if (error || !data?.valid) throw new Error(data?.error || 'Indicação inválida.');
      const fullReferral = {
        kind: data.kind,
        isDefaultCode: data.kind === 'default',
      };
      setReferralInfo(fullReferral);
      setRegistrationData((previous) => ({
        ...previous,
        telefone: data.kind === 'referral' ? maskPhone(voucherInput) : previous.telefone,
      }));
      setRegisterStage(fullReferral.isDefaultCode ? 'form' : 'confirm');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível validar a indicação.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanDoc = cleanDocument();
    const cleanPhone = registrationData.telefone.replace(/\D/g, '');
    if (personType === 'pf' ? !validarCPF(cleanDoc) : !validarCNPJ(cleanDoc)) {
      toast.error(`${personType === 'pf' ? 'CPF' : 'CNPJ'} inválido.`);
      return;
    }
    if (!validarEmail(registrationData.email) || cleanPhone.length !== 11) {
      toast.error('Informe e-mail e telefone válidos.');
      return;
    }
    
    // Inicia a verificação via WhatsApp
    setRegisterStage('whatsapp');
  };

  const submitFinalRegistration = async (pin: string) => {
    setLoading(true);
    const cleanDoc = cleanDocument();
    const cleanPhone = registrationData.telefone.replace(/\D/g, '');
    try {
      const { data, error } = await supabase.rpc('gsa_public_register_client', {
        p_referral_token: voucherInput.trim(),
        p_payload: {
          ...registrationData,
          telefone: cleanPhone,
          cep: registrationData.cep.replace(/\D/g, ''),
          tipo_pessoa: personType,
          [personType === 'pf' ? 'cpf' : 'cnpj']: cleanDoc,
          pin, // Envia o PIN
        },
      });
      if (error) throw error;
      toast.success(data?.status === 'pendente' ? 'Cadastro enviado. Aguarde a aprovação administrativa.' : 'Cadastro realizado. Você já pode entrar.');
      setRegistrationData(emptyRegistration);
      setDocumento('');
      setVoucherInput('');
      changeMode('login');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir o cadastro.');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'login'
    ? (loginStage === 'document' ? 'Área do Cliente' : 'Digite sua senha')
    : mode === 'first_access'
      ? 'Primeiro acesso de cliente cadastrado'
      : mode === 'recovery'
        ? 'Recuperar senha'
        : registerStage === 'voucher'
          ? 'Criar novo cadastro'
          : registerStage === 'confirm'
            ? 'Confirmar indicação'
            : 'Dados do cadastro';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {mode === 'login' && loginStage === 'document' && (
        <form onSubmit={handleDocumentContinue} className="space-y-5">
          <PersonSelector value={personType} onChange={(value) => { setPersonType(value); setDocumento(''); }} />
          <DocumentInput personType={personType} value={documento} onChange={setDocumento} />
          <button type="submit" disabled={loading} className="btn-primary w-full">Continuar</button>
          <div className="grid gap-2 border-t border-neutral-100 pt-4 text-center text-sm">
            <button type="button" onClick={handleFirstAccess} className="font-semibold text-[#8a651f] hover:underline">Primeiro acesso ou esqueci minha senha</button>
            <button type="button" onClick={() => changeMode('register')} className="font-semibold text-[#142030] hover:underline">Criar um novo cadastro</button>
          </div>
        </form>
      )}

      {mode === 'login' && loginStage === 'pin' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#142030]/5"><Lock className="h-8 w-8 text-[#142030]" /></div>
            <p className="text-sm text-neutral-600">Digite sua senha numérica de quatro dígitos.</p>
          </div>
          <PinInput value={pin} onChange={(value) => { setPin(value); setPinError(false); }} error={pinError} disabled={loading} onEnter={handleLogin} />
          {attemptsLeft !== null && attemptsLeft <= 2 && <p className="text-center text-xs font-semibold text-red-600">{attemptsLeft} tentativa(s) restante(s).</p>}
          <div className="text-center"><button type="button" onClick={() => changeMode('recovery')} className="text-sm font-semibold text-[#142030] hover:underline">Esqueci minha senha</button></div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setLoginStage('document'); setPin(''); }} className="btn-secondary flex-1">Voltar</button>
            <button type="button" onClick={handleLogin} disabled={loading || pin.length !== 4} className="btn-primary flex-1">{loading ? 'Verificando...' : 'Acessar'}</button>
          </div>
        </div>
      )}

      {mode === 'first_access' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="mb-2 h-5 w-5" />O primeiro acesso não utiliza mais documento e telefone como única confirmação. Continue pela verificação do código enviado ao e-mail cadastrado.</div>
          <div className="flex gap-3"><button type="button" onClick={() => changeMode('login')} className="btn-secondary flex-1">Voltar</button><button type="button" onClick={() => changeMode('recovery')} className="btn-primary flex-1">Confirmar por e-mail</button></div>
        </div>
      )}

      {mode === 'recovery' && (
        <div className="space-y-5">
          {recoveryStage === 'request' ? (
            <>
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="mb-2 h-5 w-5" />A redefinição só será liberada depois da confirmação do código enviado ao e-mail cadastrado.</div>
              <PersonSelector value={personType} onChange={(value) => { setPersonType(value); setDocumento(''); }} />
              <DocumentInput personType={personType} value={documento} onChange={setDocumento} />
              <label className="grid gap-2 text-sm font-medium text-neutral-600">E-mail cadastrado<input type="email" name="recovery-email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} className="input-field" maxLength={254} /></label>
              <div className="flex gap-3"><button type="button" onClick={() => changeMode('login')} className="btn-secondary flex-1">Voltar</button><button type="button" onClick={handleRecovery} disabled={loading} className="btn-primary flex-1">{loading ? 'Enviando...' : 'Enviar código'}</button></div>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"><ShieldAlert className="mb-2 h-5 w-5" />Digite o código de seis dígitos enviado para <strong>{recoveryEmail}</strong>. Ele expira em poucos minutos e só pode ser usado uma vez.</div>
              <label className="grid gap-2 text-sm font-medium text-neutral-600">Código de confirmação<input type="text" name="recovery-code" inputMode="numeric" autoComplete="one-time-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(event) => { if (event.key === 'Enter') void handleRecoveryCode(); }} placeholder="000000" className="input-field text-center text-2xl font-mono tracking-[0.45em]" maxLength={6} autoFocus /></label>
              <div className="flex gap-3"><button type="button" onClick={() => { setRecoveryStage('request'); setRecoveryCode(''); }} className="btn-secondary flex-1">Reenviar</button><button type="button" onClick={handleRecoveryCode} disabled={loading || recoveryCode.length !== 6} className="btn-primary flex-1">{loading ? 'Confirmando...' : 'Confirmar código'}</button></div>
            </>
          )}
        </div>
      )}

      {mode === 'register' && registerStage === 'voucher' && (
        <div className="space-y-5">
          <div className="flex gap-2 rounded-lg bg-neutral-100 p-1" role="group" aria-label="Forma de cadastro">
            <button type="button" aria-pressed={voucherTab === 'com-indicacao'} onClick={() => { setVoucherTab('com-indicacao'); setVoucherInput(''); }} className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${voucherTab === 'com-indicacao' ? 'bg-white text-[#0b1522] shadow' : 'text-neutral-500 hover:text-neutral-800'}`}>Com indicação</button>
            <button type="button" aria-pressed={voucherTab === 'sem-indicacao'} onClick={() => { setVoucherTab('sem-indicacao'); setVoucherInput(settings.ativo && settings.codigo ? settings.codigo : ''); }} className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${voucherTab === 'sem-indicacao' ? 'bg-white text-[#0b1522] shadow' : 'text-neutral-500 hover:text-neutral-800'}`}>Sem indicação</button>
          </div>
          {voucherTab === 'sem-indicacao' && (
            <div className="rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-900">
              {settingsLoading ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</span> : settings.ativo ? (
                <>
                  <p>Use o código público abaixo. Ele será validado pelo servidor antes do cadastro.</p>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3"><strong className="font-mono">{settings.codigo}</strong><button type="button" onClick={async () => { if (await copyToClipboard(settings.codigo)) toast.success('Código copiado.'); }} className="flex items-center gap-1 text-xs font-bold"><Copy className="h-4 w-4" />Copiar</button></div>
                  <p className="mt-3 text-xs">Bônus após aprovação: {settings.tipo === 'pontos' ? `${settings.valor} pontos` : formatCurrency(settings.valor)}.</p>
                </>
              ) : <p>O cadastro sem indicação está temporariamente indisponível.</p>}
            </div>
          )}
          <label className="grid gap-2 text-sm font-medium text-neutral-600">{voucherTab === 'com-indicacao' ? 'Celular usado na indicação' : 'Código público'}<input type="text" name="referral-token" autoComplete="off" inputMode={voucherTab === 'com-indicacao' ? 'numeric' : 'text'} value={voucherInput} onChange={(event) => setVoucherInput(voucherTab === 'com-indicacao' ? maskPhone(event.target.value) : event.target.value)} className="input-field" disabled={voucherTab === 'sem-indicacao' && !settings.ativo} /></label>
          <div className="flex gap-3"><button type="button" onClick={() => changeMode('login')} className="btn-secondary flex-1">Voltar</button><button type="button" onClick={handleValidateVoucher} disabled={loading || (voucherTab === 'sem-indicacao' && !settings.ativo)} className="btn-primary flex-1">{loading ? 'Validando...' : 'Validar'}</button></div>
        </div>
      )}

      {mode === 'register' && registerStage === 'confirm' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-neutral-50 p-5"><p className="text-xs uppercase tracking-widest text-neutral-400">Indicação encontrada</p><p className="mt-2 font-bold">{referralInfo?.isDefaultCode ? 'Cadastro público autorizado' : 'Indicação válida'}</p></div>
          <p className="text-sm text-neutral-600">Confirma que esta é a indicação correta?</p>
          <div className="flex gap-3"><button type="button" onClick={() => setRegisterStage('voucher')} className="btn-secondary flex-1">Não</button><button type="button" onClick={() => setRegisterStage('form')} className="btn-primary flex-1">Sim, continuar</button></div>
        </div>
      )}

      {mode === 'register' && registerStage === 'form' && (
        <form onSubmit={handleRegister} className="space-y-4">
          <PersonSelector value={personType} onChange={(value) => { setPersonType(value); setDocumento(''); }} />
          <DocumentInput personType={personType} value={documento} onChange={setDocumento} validate loading={checkingChallenge} />
          <label className="grid gap-2 text-sm font-medium text-neutral-600">{personType === 'pf' ? 'Nome completo' : 'Razão social'}<input required name="nome" autoComplete="name" value={registrationData.nome} onChange={(event) => setRegistrationData({ ...registrationData, nome: event.target.value })} className="input-field" maxLength={180} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-neutral-600">E-mail<input type="email" required name="email" autoComplete="email" value={registrationData.email} onChange={(event) => setRegistrationData({ ...registrationData, email: event.target.value })} className="input-field" maxLength={254} /></label>
            <label className="grid gap-2 text-sm font-medium text-neutral-600">Telefone<input required name="telefone" type="tel" inputMode="tel" autoComplete="tel" value={registrationData.telefone} onChange={(event) => setRegistrationData({ ...registrationData, telefone: maskPhone(event.target.value) })} className="input-field" maxLength={15} /></label>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-4">
            <label className="grid gap-2 text-sm font-medium text-neutral-600">CEP<input required name="cep" inputMode="numeric" autoComplete="postal-code" value={registrationData.cep} onChange={async (event) => { let value = event.target.value.replace(/\D/g, ''); if (value.length > 5) value = value.replace(/^(\d{5})(\d)/, '$1-$2'); setRegistrationData((previous) => ({ ...previous, cep: value })); const raw = value.replace(/\D/g, ''); if (raw.length === 8) { const address = await consultarCEP(raw); if (address) setRegistrationData((previous) => ({ ...previous, endereco: address.logradouro, bairro: address.bairro, cidade: address.localidade, estado: address.uf })); } }} className="input-field" maxLength={9} /></label>
            <label className="grid gap-2 text-sm font-medium text-neutral-600">Número<input required name="numero" inputMode="numeric" autoComplete="address-line2" value={registrationData.numero} onChange={(event) => setRegistrationData({ ...registrationData, numero: event.target.value })} className="input-field" maxLength={20} /></label>
          </div>
          <label className="grid gap-2 text-sm font-medium text-neutral-600">Endereço<input required name="endereco" autoComplete="street-address" value={registrationData.endereco} onChange={(event) => setRegistrationData({ ...registrationData, endereco: event.target.value })} className="input-field" maxLength={220} /></label>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_90px]">
            <label className="grid gap-2 text-sm font-medium text-neutral-600">Bairro<input required name="bairro" value={registrationData.bairro} onChange={(event) => setRegistrationData({ ...registrationData, bairro: event.target.value })} className="input-field" maxLength={120} /></label>
            <label className="grid gap-2 text-sm font-medium text-neutral-600">Cidade<input required name="cidade" autoComplete="address-level2" value={registrationData.cidade} onChange={(event) => setRegistrationData({ ...registrationData, cidade: event.target.value })} className="input-field" maxLength={120} /></label>
            <label className="grid gap-2 text-sm font-medium text-neutral-600">UF<input required name="estado" autoComplete="address-level1" maxLength={2} value={registrationData.estado} onChange={(event) => setRegistrationData({ ...registrationData, estado: event.target.value.toUpperCase() })} className="input-field" /></label>
          </div>
          <label className="grid gap-2 text-sm font-medium text-neutral-600">Observações<textarea name="observacoes" rows={2} maxLength={2000} value={registrationData.observacoes} onChange={(event) => setRegistrationData({ ...registrationData, observacoes: event.target.value })} className="input-field resize-none" /></label>
          <div className="flex gap-3"><button type="button" onClick={() => setRegisterStage(referralInfo?.isDefaultCode ? 'voucher' : 'confirm')} className="btn-secondary flex-1">Voltar</button><button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Validando...' : 'Continuar para ativação'}</button></div>
        </form>
      )}

      {mode === 'register' && registerStage === 'whatsapp' && (
        <WhatsAppPinVerification
          initialPhone={registrationData.telefone}
          documento={documento.replace(/\D/g, '')}
          formData={registrationData as Record<string, unknown>}
          initialChallengeId={activeChallenge?.challengeId}
          initialTimeLeft={activeChallenge?.expiresIn}
          onVerified={(verifiedPhone) => {
            setRegistrationData({ ...registrationData, telefone: verifiedPhone });
            setActiveChallenge(null);
            setRegisterStage('setup_pin');
          }}
          onCancel={() => { setActiveChallenge(null); setRegisterStage('form'); }}
        />
      )}

      {mode === 'register' && registerStage === 'setup_pin' && (
        <SetupAccessPin 
          onComplete={submitFinalRegistration} 
          loading={loading} 
          onSuccess={() => changeMode('login')}
        />
      )}

      {/* Pop-up de desafio WhatsApp ativo detectado pelo CPF */}
      {activeChallenge && registerStage === 'form' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="active-challenge-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2 text-green-600">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <h3 id="active-challenge-title" className="text-lg font-black text-[#0d1724]">Cadastro em andamento</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveChallenge(null)}
                className="rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-2 text-sm text-neutral-600">
              Identificamos que você iniciou um cadastro recentemente. O código de verificação enviado para o WhatsApp <strong>{activeChallenge.destination}</strong> ainda está ativo.
            </p>
            {activeChallenge.expiresIn > 0 && (
              <p className="mb-4 text-sm font-bold text-green-700">
                Expira em {Math.floor(activeChallenge.expiresIn / 60).toString().padStart(2, '0')}:{(activeChallenge.expiresIn % 60).toString().padStart(2, '0')} minutos.
              </p>
            )}
            {activeChallenge.formData && (
              <div className="mb-4 rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                <p className="font-bold">Dados salvos do cadastro anterior:</p>
                <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                  {[activeChallenge.formData.nome, activeChallenge.formData.email, activeChallenge.formData.telefone].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setActiveChallenge(null)}
                className="btn-secondary flex-1 text-sm"
              >
                Iniciar novo cadastro
              </button>
              <button
                type="button"
                onClick={() => {
                  // Restaurar dados do formulário salvos, se existirem
                  if (activeChallenge.formData) {
                    setRegistrationData({ ...emptyRegistration, ...activeChallenge.formData });
                  }
                  setRegisterStage('whatsapp');
                }}
                className="btn-primary flex-1 text-sm"
              >
                Continuar verificação
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PersonSelector({ value, onChange }: { value: PersonType; onChange: (value: PersonType) => void }) {
  return <div className="flex gap-2 rounded-lg bg-neutral-100 p-1" role="group" aria-label="Tipo de pessoa"><button type="button" aria-pressed={value === 'pf'} onClick={() => onChange('pf')} className={`flex-1 rounded-md py-2 text-sm ${value === 'pf' ? 'bg-white shadow' : 'text-neutral-500'}`}>CPF</button><button type="button" aria-pressed={value === 'pj'} onClick={() => onChange('pj')} className={`flex-1 rounded-md py-2 text-sm ${value === 'pj' ? 'bg-white shadow' : 'text-neutral-500'}`}>CNPJ</button></div>;
}

function DocumentInput({ personType, value, onChange, validate = false, loading = false }: { personType: PersonType; value: string; onChange: (value: string) => void; validate?: boolean; loading?: boolean }) {
  const inputId = `client-document-${personType}`;
  return <div><label htmlFor={inputId} className="mb-2 flex items-center justify-between text-sm font-medium text-neutral-600"><span>{personType === 'pf' ? 'CPF' : 'CNPJ'}</span>{loading && <span className="flex items-center gap-1 text-xs text-neutral-400"><Loader2 className="h-3 w-3 animate-spin" /> Consultando...</span>}</label><input id={inputId} name="documento" autoComplete="off" type="text" inputMode="numeric" required value={value} onChange={(event) => onChange(personType === 'pf' ? maskCPF(event.target.value) : maskCNPJ(event.target.value))} onBlur={() => { if (!validate) return; const clean = value.replace(/\D/g, ''); if (clean && (personType === 'pf' ? !validarCPF(clean) : !validarCNPJ(clean))) { toast.error(`${personType === 'pf' ? 'CPF' : 'CNPJ'} inválido.`); onChange(''); } }} placeholder={personType === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'} className="input-field" /></div>;
}
