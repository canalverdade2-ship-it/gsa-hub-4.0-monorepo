import React, { useState, useRef, useEffect } from 'react';
import { Lock, CheckCircle, ArrowRight, RefreshCw, KeyRound } from 'lucide-react';

interface SetupAccessPinProps {
  onComplete: (accessPin: string) => Promise<void> | void;
  loading?: boolean;
  onSuccess?: () => void;
}

export function SetupAccessPin({ onComplete, loading = false, onSuccess }: SetupAccessPinProps) {
  const [step, setStep] = useState<'create' | 'confirm' | 'success'>('create');
  
  const [pin, setPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  
  const [error, setError] = useState('');
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'create') {
      inputRefs.current[0]?.focus();
    } else if (step === 'confirm') {
      confirmRefs.current[0]?.focus();
    }
  }, [step]);

  const handlePinChange = (index: number, value: string, isConfirm: boolean) => {
    if (!/^\d*$/.test(value)) return;
    setError('');

    const targetPin = isConfirm ? [...confirmPin] : [...pin];
    targetPin[index] = value;
    
    if (isConfirm) setConfirmPin(targetPin);
    else setPin(targetPin);

    const refs = isConfirm ? confirmRefs : inputRefs;

    // Auto-advance
    if (value && index < 3) {
      refs.current[index + 1]?.focus();
    }
    
    // Auto-submit
    if (index === 3 && value && targetPin.every(d => d !== '')) {
      const fullPin = targetPin.join('');
      if (!isConfirm) {
        setStep('confirm');
      } else {
        const firstPin = pin.join('');
        if (fullPin === firstPin) {
          handleFinalSubmit(fullPin);
        } else {
          setError('Os PINs não conferem. Tente novamente.');
          setConfirmPin(['', '', '', '']);
          confirmRefs.current[0]?.focus();
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>, isConfirm: boolean) => {
    const targetPin = isConfirm ? confirmPin : pin;
    const refs = isConfirm ? confirmRefs : inputRefs;

    if (e.key === 'Backspace' && !targetPin[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handleFinalSubmit = async (finalPin: string) => {
    try {
      await onComplete(finalPin);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Erro ao finalizar o cadastro.');
      // Volta para confirmar se der erro
      setConfirmPin(['', '', '', '']);
      confirmRefs.current[0]?.focus();
    }
  };

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center animate-in zoom-in duration-300">
        <div className="mb-6 rounded-full bg-green-500/10 p-6 text-green-500">
          <CheckCircle className="h-16 w-16" />
        </div>
        <h3 className="mb-2 text-2xl font-black text-[#0d1724]">Cadastro Concluído com Sucesso!</h3>
        <p className="mb-8 max-w-md text-[#283342]">
          Seu cadastro foi ativado e seu PIN de acesso configurado. Agora você já pode acessar o sistema.
        </p>
        <button
          type="button"
          onClick={() => {
            if (onSuccess) {
              onSuccess();
            } else {
              window.dispatchEvent(new CustomEvent('gsa-auth-success'));
            }
          }}
          className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-green-600 py-4 font-bold text-white shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5 hover:bg-green-500"
        >
          <KeyRound className="h-5 w-5" />
          Acessar Sistema
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center animate-in slide-in-from-right duration-300">
      <div className="mb-6 rounded-full bg-indigo-500/10 p-4 text-indigo-500">
        <Lock className="h-10 w-10" />
      </div>
      <h3 className="mb-2 text-2xl font-black text-[#0d1724]">
        {step === 'create' ? 'Crie sua Senha (PIN)' : 'Confirme seu PIN'}
      </h3>
      <p className="mb-6 max-w-md text-[#283342]">
        {step === 'create' 
          ? 'Crie uma senha de 4 números. Você usará esse PIN para fazer login no sistema.' 
          : 'Digite novamente os 4 números para confirmar.'}
      </p>

      <div className="w-full max-w-xs space-y-6">
        <div className="flex justify-center gap-3">
          {(step === 'create' ? pin : confirmPin).map((d, idx) => (
            <input
              key={idx}
              ref={el => {
                if (step === 'create') inputRefs.current[idx] = el;
                else confirmRefs.current[idx] = el;
              }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handlePinChange(idx, e.target.value, step === 'confirm')}
              onKeyDown={e => handleKeyDown(idx, e, step === 'confirm')}
              disabled={loading}
              className={`h-16 w-14 rounded-2xl border-2 bg-white text-center text-2xl font-black text-[#0d1724] outline-none transition-colors focus:border-indigo-500 disabled:opacity-50 ${
                error ? 'border-red-500 focus:border-red-500' : 'border-neutral-200'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm font-bold text-red-500 animate-in fade-in slide-in-from-top-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => step === 'create' ? setStep('confirm') : handleFinalSubmit(confirmPin.join(''))}
          disabled={loading || (step === 'create' ? pin.some(d => d === '') : confirmPin.some(d => d === ''))}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : step === 'create' ? (
            <>Continuar <ArrowRight className="h-5 w-5" /></>
          ) : (
            'Finalizar Cadastro'
          )}
        </button>

        {step === 'confirm' && !loading && (
          <button
            type="button"
            onClick={() => {
              setStep('create');
              setConfirmPin(['', '', '', '']);
              setError('');
            }}
            className="text-sm font-bold text-neutral-500 underline hover:text-neutral-700"
          >
            Voltar e alterar PIN
          </button>
        )}
      </div>
    </div>
  );
}
