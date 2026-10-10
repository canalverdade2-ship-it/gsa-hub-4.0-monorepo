import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Minus, Plus, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';

interface SubscriptionDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  onConfirm: (months: number) => void;
  initialDuration?: number;
}

const PERIOD_OPTIONS = [1, 3, 6, 12];

export default function SubscriptionDurationModal({
  isOpen,
  onClose,
  item,
  onConfirm,
  initialDuration = 12,
}: SubscriptionDurationModalProps) {
  const [months, setMonths] = useState(initialDuration);

  useEffect(() => {
    if (isOpen) setMonths(Math.min(12, Math.max(1, initialDuration)));
  }, [isOpen, initialDuration]);

  const monthlyPrice = Number(item?.valor || 0);
  const contractTotal = useMemo(() => monthlyPrice * months, [monthlyPrice, months]);

  if (!isOpen || !item) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Período da assinatura" size="sm">
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-[16px] border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {item.imagem_url ? (
              <img src={item.imagem_url} alt={item.nome} className="h-full w-full object-contain" />
            ) : (
              <Calendar className="h-8 w-8 text-slate-300" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-extrabold leading-5 text-slate-950">{item.nome}</h3>
            <p className="mt-1 text-sm font-black text-[#17345f]">
              {formatCurrency(monthlyPrice)}
              <span className="ml-1 text-xs font-semibold text-slate-500">por mês</span>
            </p>
          </div>
        </div>

        <section className="rounded-[16px] border border-slate-200 bg-white p-5" aria-labelledby="subscription-period-title">
          <div>
            <h4 id="subscription-period-title" className="text-sm font-extrabold text-slate-950">Escolha o período</h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">Você poderá acompanhar cobranças e situação do plano pelo portal.</p>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option)}
                aria-pressed={months === option}
                className={`min-h-11 rounded-xl border px-2 text-xs font-extrabold transition ${
                  months === option
                    ? 'border-[#17345f] bg-[#edf2f7] text-[#17345f]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {option} {option === 1 ? 'mês' : 'meses'}
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-[48px_1fr_48px] items-center gap-3">
            <button
              type="button"
              onClick={() => setMonths((current) => Math.max(1, current - 1))}
              disabled={months <= 1}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Diminuir período"
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex h-14 flex-col items-center justify-center rounded-xl bg-[#f5f6f8]" aria-live="polite">
              <span className="text-2xl font-black leading-none tabular-nums text-slate-950">{months}</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{months === 1 ? 'mês' : 'meses'}</span>
            </div>
            <button
              type="button"
              onClick={() => setMonths((current) => Math.min(12, current + 1))}
              disabled={months >= 12}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Aumentar período"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <label className="mt-5 block">
            <span className="sr-only">Selecionar período entre 1 e 12 meses</span>
            <input
              type="range"
              min="1"
              max="12"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
              className="w-full accent-[#17345f]"
            />
          </label>
        </section>

        <div className="rounded-[16px] border border-[#dfd1b4] bg-[#faf7f0] p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">Valor mensal</p>
              <p className="mt-1 text-lg font-black text-[#17345f]">{formatCurrency(monthlyPrice)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500">Total do período</p>
              <p className="mt-1 text-[26px] font-black leading-none tracking-[-0.04em] text-[#17345f]">{formatCurrency(contractTotal)}</p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-[#e7dcc4] pt-3 text-[11px] leading-5 text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#9b742f]" aria-hidden="true" />
            As condições, cobranças futuras e regras de cancelamento ficam registradas no pedido.
          </div>
        </div>

        <button
          type="button"
          onClick={() => onConfirm(months)}
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#17345f] px-5 py-4 text-sm font-extrabold text-white transition hover:bg-[#102746]"
        >
          <Check className="h-5 w-5" aria-hidden="true" />
          Continuar com {months} {months === 1 ? 'mês' : 'meses'}
        </button>
      </div>
    </Modal>
  );
}
