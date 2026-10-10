import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, RefreshCw, ArrowRight, MessageCircle, AlertCircle, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';

interface WhatsAppPinVerificationProps {
  initialPhone: string;
  onVerified: (verifiedPhone: string, verificationToken?: string) => void;
  onCancel?: () => void;
  secureProviderRegistration?: boolean;
  /** Se preenchido, pula direto para o step de entrada do PIN (desafio já existe) */
  initialChallengeId?: string;
  /** Tempo restante em segundos quando o desafio já existe */
  initialTimeLeft?: number;
  /** CPF/CNPJ do cliente — salvo junto com o desafio para recuperação posterior */
  documento?: string;
  /** Dados do formulário — salvos junto com o desafio para recuperação posterior */
  formData?: Record<string, unknown>;
}

export function WhatsAppPinVerification({
  initialPhone,
  onVerified,
  onCancel,
  secureProviderRegistration = true,
  initialChallengeId,
  initialTimeLeft,
  documento,
  formData,
}: WhatsAppPinVerificationProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [step, setStep] = useState<'confirm_phone' | 'enter_pin'>('confirm_phone');

  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(60);
  const [loading, setLoading] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Se já existe um desafio ativo (recuperação de cadastro), pular direto para o PIN
  useEffect(() => {
    if (initialChallengeId) {
      setChallengeId(initialChallengeId);
      setTimeLeft(initialTimeLeft ?? 300);
      setStep('enter_pin');
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timer: any;
    if (step === 'enter_pin' && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    let formatted = raw;
    if (raw.length <= 11) {
      formatted = raw.replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d{5}|\d{4})(\d)/, '$1-$2');
    }
    setPhone(formatted.substring(0, 15));
  };

  const handleRequestPin = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Informe um número de WhatsApp válido.');
      return;
    }

    setLoading(true);
    try {
      if (secureProviderRegistration) {
        // Inclui documento e formData se fornecidos (para recuperação posterior por CPF)
        const payload: Record<string, unknown> = { telefone: cleanPhone };
        if (documento && [11, 14].includes(documento.replace(/\D/g, '').length)) {
          payload.documento = documento.replace(/\D/g, '');
        }
        if (formData && typeof formData === 'object') {
          payload.form_data = formData;
        }

        const { data, error } = await supabase.functions.invoke('gsa-auth-session', {
          body: { action: 'request_provider_registration_code', payload },
        });
        if (error) throw error;
        if (!data?.success || !data?.challenge_id) throw new Error('Não foi possível enviar o código.');
        setChallengeId(data.challenge_id);
        toast.success('Código enviado para o seu WhatsApp!');
        setStep('enter_pin');
        setTimeLeft(Number(data.expires_in || 300));
        setPin(['', '', '', '', '', '']);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
        return;
      }

      throw new Error('O envio seguro do código está indisponível para este formulário.');
    } catch (err: any) {
      console.error('Erro ao solicitar PIN:', err);
      let userMsg = err?.message || 'Erro interno ao solicitar o código.';
      if (err?.context?.json) {
        try {
          const body = await err.context.json();
          if (body?.error === 'verification_unavailable') userMsg = 'Serviço de verificação temporariamente indisponível.';
          else if (body?.error === 'verification_delivery_failed') userMsg = 'Não foi possível entregar a mensagem no WhatsApp. Verifique o número informado.';
          else if (body?.error === 'too_many_attempts') {
            const waitSec = Number(body?.retry_after || 0);
            if (waitSec > 0) {
              const minutes = Math.ceil(waitSec / 60);
              userMsg = `Muitas tentativas. Por segurança, aguarde ${minutes} minuto(s) antes de tentar novamente.`;
            } else {
              userMsg = 'Muitas tentativas. Aguarde alguns instantes.';
            }
          } else if (body?.error) userMsg = body.error;
        } catch {
          // ignore
        }
      } else if (userMsg.includes('non-2xx status code')) {
        userMsg = 'Não foi possível enviar o código no momento. Tente novamente.';
      }
      toast.error(userMsg);
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    if (value && index < pin.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (index === pin.length - 1 && value && newPin.every(d => d !== '')) {
      handleVerifyPin(newPin.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyPin = async (fullPin: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    setLoading(true);
    try {
      if (secureProviderRegistration) {
        if (!challengeId) throw new Error('Solicite um novo código.');
        const { data, error } = await supabase.functions.invoke('gsa-auth-session', {
          body: {
            action: 'verify_provider_registration_code',
            payload: { challenge_id: challengeId, telefone: cleanPhone, code: fullPin },
          },
        });
        if (error) throw error;
        if (!data?.success || !data?.verification_token) throw new Error('Código inválido ou expirado.');
        toast.success('WhatsApp verificado com sucesso!');
        onVerified(cleanPhone, data.verification_token);
        return;
      }
      throw new Error('A verificação segura está indisponível para este formulário.');
    } catch (err: any) {
      console.error('Erro ao validar PIN:', err);
      toast.error('Erro ao verificar o código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'confirm_phone') {
    return (
      <div className="flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
        <div className="mb-6 rounded-full bg-green-500/10 p-4 text-green-500">
          <MessageCircle className="h-10 w-10" />
        </div>
        <h3 className="mb-2 text-2xl font-black text-[#0d1724]">Confirme seu WhatsApp</h3>
        <p className="mb-6 max-w-md text-[#283342]">
          Para concluir o cadastro de forma segura, enviaremos um código de verificação para o seu WhatsApp.
        </p>
        <div className="w-full max-w-sm space-y-4">
          <div className="relative text-left">
            <label className="mb-1 block text-sm font-bold text-[#0d1724]">
              Número do WhatsApp
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={phone}
                onChange={handlePhoneChange}
                disabled={!isEditingPhone}
                placeholder="(00) 00000-0000"
                className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[#0d1724] outline-none focus:border-green-500 disabled:bg-neutral-50 disabled:opacity-70"
              />
              {!isEditingPhone ? (
                <button type="button" onClick={() => setIsEditingPhone(true)} className="rounded-xl bg-neutral-100 p-3 text-neutral-600 transition-colors hover:bg-neutral-200" title="Alterar número">
                  <Pencil className="h-5 w-5" />
                </button>
              ) : (
                <button type="button" onClick={() => setIsEditingPhone(false)} className="rounded-xl bg-green-500 p-3 text-white transition-colors hover:bg-green-600" title="Salvar">
                  <ShieldCheck className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          <button type="button" onClick={handleRequestPin} disabled={loading || phone.replace(/\D/g, '').length < 10} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-bold text-white shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5 hover:bg-green-500 disabled:opacity-50 disabled:hover:translate-y-0">
            {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {loading ? 'Enviando...' : 'Enviar Código'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={loading} className="mt-4 text-sm font-bold text-neutral-500 underline hover:text-neutral-700">
              Cancelar e voltar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center animate-in slide-in-from-right duration-300">
      <div className="mb-6 rounded-full bg-blue-500/10 p-4 text-blue-500">
        <ShieldCheck className="h-10 w-10" />
      </div>
      <h3 className="mb-2 text-2xl font-black text-[#0d1724]">Código de Verificação</h3>
      <p className="mb-6 max-w-md text-[#283342]">
        Digite o código de {pin.length} dígitos que acabamos de enviar para o seu WhatsApp: <strong>{phone}</strong>
      </p>
      <div className="w-full max-w-xs space-y-6">
        <div className="flex justify-center gap-3">
          {pin.map((d, idx) => (
            <input
              key={idx}
              ref={(el) => { inputRefs.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handlePinChange(idx, e.target.value)}
              onKeyDown={e => handleKeyDown(idx, e)}
              disabled={loading}
              className="h-16 w-14 rounded-2xl border-2 border-neutral-200 bg-white text-center text-2xl font-black text-[#0d1724] outline-none transition-colors focus:border-blue-500 disabled:opacity-50"
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-sm">
          {timeLeft > 0 ? (
            <span className="font-bold text-neutral-500">
              Código expira em {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="flex items-center gap-1 font-bold text-red-500">
                <AlertCircle className="h-4 w-4" /> Código expirado
              </span>
              <button type="button" onClick={handleRequestPin} disabled={loading} className="flex items-center gap-2 font-bold text-blue-600 hover:text-blue-700">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Reenviar PIN
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => handleVerifyPin(pin.join(''))} disabled={loading || pin.some(d => d === '')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-500 disabled:opacity-50 disabled:hover:translate-y-0">
          {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : 'Verificar'}
        </button>
        <button type="button" onClick={() => setStep('confirm_phone')} disabled={loading} className="text-sm font-bold text-neutral-500 underline hover:text-neutral-700">
          Alterar número
        </button>
      </div>
    </div>
  );
}
