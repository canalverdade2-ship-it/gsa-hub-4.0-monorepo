import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  label?: string;
  onEnter?: () => void;
  onComplete?: () => void;
}

export function PinInput({ value, onChange, disabled = false, error = false, autoFocus = true, label, onEnter, onComplete }: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const digits = value.padEnd(4, '').split('').slice(0, 4);
  const accessibleLabel = label || 'Senha numérica';

  useLayoutEffect(() => {
    if (!autoFocus || !inputRefs.current[0]) return;
    inputRefs.current[0]?.focus();
  }, [autoFocus]);

  const handleChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const typedValue = event.target.value.replace(/\D/g, '');
    if (!typedValue) return;
    const newDigits = [...digits];
    newDigits[index] = typedValue.slice(-1);
    const nextValue = newDigits.join('').replace(/ /g, '');
    onChange(nextValue);
    if (index < 3) inputRefs.current[index + 1]?.focus();
    if (nextValue.length === 4) window.setTimeout(() => onComplete?.(), 0);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onEnter?.();
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      const newDigits = [...digits];
      if (newDigits[index]?.trim()) {
        newDigits[index] = ' ';
      } else if (index > 0) {
        newDigits[index - 1] = ' ';
        inputRefs.current[index - 1]?.focus();
      }
      onChange(newDigits.join('').trimEnd());
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pastedData = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pastedData) return;
    onChange(pastedData);
    inputRefs.current[Math.min(pastedData.length, 3)]?.focus();
    if (pastedData.length === 4) window.setTimeout(() => onComplete?.(), 0);
  };

  return (
    <fieldset className="flex flex-col items-center gap-3" aria-invalid={error}>
      <legend className="text-sm font-medium text-[#1a1a1a]/60">{accessibleLabel}</legend>
      <div className="flex items-center gap-3" onPaste={handlePaste}>
        {[0, 1, 2, 3].map((index) => (
          <motion.div
            key={`pin-input-digit-${index}`}
            animate={reduceMotion ? undefined : {
              scale: focusedIndex === index ? 1.05 : 1,
              borderColor: error ? 'rgba(239, 68, 68, 0.7)' : focusedIndex === index ? 'rgba(0, 0, 0, 0.4)' : digits[index]?.trim() ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.08)',
            }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            className="relative"
          >
            <input
              ref={(element) => { inputRefs.current[index] = element; }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digits[index]?.trim() || ''}
              onChange={(event) => handleChange(index, event)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onFocus={() => { setFocusedIndex(index); inputRefs.current[index]?.select(); }}
              onBlur={() => setFocusedIndex(null)}
              disabled={disabled}
              aria-label={`${accessibleLabel}, dígito ${index + 1} de 4`}
              className={`h-16 w-14 rounded-2xl border-2 bg-white text-center text-2xl font-bold outline-none transition-all duration-200 focus:shadow-lg focus:shadow-black/5 disabled:cursor-not-allowed disabled:opacity-50 sm:w-16 ${error ? 'border-red-400 bg-red-50/50 text-red-600' : 'border-black/8 text-[#1a1a1a] focus:border-black/40'}`}
              style={{ caretColor: 'transparent' }}
              autoComplete="one-time-code"
            />
            {!digits[index]?.trim() && focusedIndex !== index && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className={`h-2.5 w-2.5 rounded-full ${error ? 'bg-red-300' : 'bg-black/10'}`} /></div>}
            {!reduceMotion && focusedIndex === index && !digits[index]?.trim() && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><motion.div animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }} className="h-7 w-0.5 rounded-full bg-black/60" /></div>}
          </motion.div>
        ))}
      </div>
    </fieldset>
  );
}
