import type React from 'react';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AccessibleDialog } from '../ui/AccessibleDialog';

const WHATSAPP_NUMBER = '5511920857756';
const PROJECT_OPTIONS = [
  ['nome_marca', 'Criação de nome e posicionamento'],
  ['logo', 'Criação de logo e logomarca'],
  ['identidade_visual', 'Identidade visual e branding'],
  ['redes_sociais', 'Estruturação de redes sociais'],
  ['social_media', 'Social media, posts e publicações'],
  ['marketing_digital', 'Estratégia digital e campanhas'],
  ['jornada_completa', 'Empresa do zero ao digital'],
  ['site', 'Site institucional ou landing page'],
  ['loja', 'Loja virtual / E-commerce'],
  ['sistema', 'Sistema web sob medida'],
  ['aplicativo', 'Aplicativo mobile (iOS e Android)'],
  ['automacao', 'Automação de processos'],
  ['integracao', 'Integração entre sistemas / APIs'],
] as const;

interface SystemsBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BudgetForm {
  nome: string;
  tipo: string;
  solicitacao: string;
}

const EMPTY_FORM: BudgetForm = { nome: '', tipo: '', solicitacao: '' };
const PROJECT_LABELS = new Map<string, string>(PROJECT_OPTIONS.map(([value, label]) => [value, label]));

function validateForm(form: BudgetForm) {
  const nome = form.nome.trim();
  const solicitacao = form.solicitacao.trim();
  if (nome.length < 3 || nome.length > 120) return 'Informe seu nome completo.';
  if (!PROJECT_LABELS.has(form.tipo)) return 'Selecione o tipo do projeto.';
  if (solicitacao.length < 20) return 'Descreva o projeto com pelo menos 20 caracteres.';
  if (solicitacao.length > 2000) return 'A descrição deve ter no máximo 2.000 caracteres.';
  return null;
}

export function SystemsBudgetModal({ isOpen, onClose }: SystemsBudgetModalProps) {
  const [form, setForm] = useState<BudgetForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }, [isOpen]);

  const closeSafely = () => {
    if (submitting) return;
    setForm(EMPTY_FORM);
    onClose();
  };

  const submitToWhatsApp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationMessage = validateForm(form);
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      const message = [
        'Olá! Gostaria de solicitar um orçamento para um projeto.',
        '',
        `*Nome completo:* ${form.nome.trim()}`,
        `*Projeto:* ${PROJECT_LABELS.get(form.tipo)}`,
        '',
        '*Descrição do projeto:*',
        form.solicitacao.trim(),
      ].join('\n');
      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

      toast.success('Solicitação pronta no WhatsApp. Revise e toque em enviar na conversa.');
      setSubmitting(false);
      onClose();
    } catch (error) {
      console.error('Falha ao preparar solicitação para WhatsApp:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o WhatsApp agora.');
      setSubmitting(false);
      }
  };

  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={closeSafely}
      closeOnBackdrop={!submitting}
      ariaLabel="Solicitar orçamento pelo WhatsApp"
      overlayClassName="items-center justify-center overflow-y-auto bg-[#03070d]/82 p-2.5 backdrop-blur-md sm:p-6"
      panelClassName="max-h-[92dvh] w-full max-w-2xl overflow-hidden rounded-[1.6rem] border border-white/30 bg-white shadow-[0_32px_100px_rgba(0,0,0,0.5)] sm:rounded-3xl"
    >
      <form onSubmit={submitToWhatsApp} className="flex max-h-[92dvh] min-h-0 flex-col" noValidate>
        <div className="h-0.5 w-full shrink-0 bg-gradient-to-r from-transparent via-[#d7b96e] to-transparent" />

        <header className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[radial-gradient(ellipse_at_top_right,rgba(215,185,110,0.12),transparent_42%),linear-gradient(135deg,#101e2b,#0b1520)] px-5 py-5 text-white sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#d7b96e]/30 bg-[#d7b96e]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d7b96e]">
                <Sparkles className="h-3 w-3" /> Orçamento sob medida
              </div>
              <h2 className="mt-3 text-[1.45rem] font-bold leading-tight tracking-tight sm:text-2xl">Conte-nos sobre o seu projeto</h2>
              <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-300/85 sm:text-sm">
                Preencha os dados e continue pelo WhatsApp para falar com nossa equipe.
              </p>
            </div>
            <button
              type="button"
              onClick={closeSafely}
              aria-label="Fechar orçamento"
              data-dialog-autofocus
              className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d7b96e]/35 bg-white/[0.04] text-slate-300 transition duration-200 hover:border-[#d7b96e] hover:bg-[#d7b96e]/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d7b96e]"
            >
              <X className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#fbfaf7_0%,#f7f5f0_100%)] px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#e9e2d5] bg-white/75 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#142332] text-[#d7b96e]"><MessageCircle className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Solicitação rápida</h3>
              <p className="mt-0.5 text-xs text-slate-500">Sua mensagem será aberta pronta para revisar e enviar.</p>
            </div>
          </div>

          <div>
            <label htmlFor="budget-name" className="mb-2 block text-[13px] font-semibold text-slate-800">
              Nome completo <span className="text-[#8a6b2f]">*</span>
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b8457]" />
              <input
                id="budget-name"
                required
                autoComplete="name"
                maxLength={120}
                value={form.nome}
                onChange={(event) => setForm((previous) => ({ ...previous, nome: event.target.value }))}
                placeholder="Digite seu nome completo"
                className="h-12 w-full rounded-2xl border border-stone-200 bg-white pl-10 pr-4 text-[15px] text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition duration-200 placeholder:text-stone-400 hover:border-stone-300 focus:border-[#a7833d] focus:outline-none focus:ring-4 focus:ring-[#d7b96e]/20 sm:text-sm"
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="budget-type" className="mb-2 block text-[13px] font-semibold text-slate-800">
              Projeto que deseja realizar <span className="text-[#8a6b2f]">*</span>
            </label>
            <div className="relative">
              <Briefcase className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b8457]" />
              <select
                id="budget-type"
                required
                value={form.tipo}
                onChange={(event) => setForm((previous) => ({ ...previous, tipo: event.target.value }))}
                className="h-12 w-full appearance-none rounded-2xl border border-stone-200 bg-white pl-10 pr-10 text-[15px] text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition duration-200 hover:border-stone-300 focus:border-[#a7833d] focus:outline-none focus:ring-4 focus:ring-[#d7b96e]/20 sm:text-sm"
              >
                <option value="">Selecione o tipo de projeto...</option>
                {PROJECT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="budget-request" className="block text-[13px] font-semibold text-slate-800">
                Descrição do projeto <span className="text-[#8a6b2f]">*</span>
              </label>
              <span className={`shrink-0 text-[11px] font-semibold ${form.solicitacao.trim().length >= 20 ? 'text-emerald-700' : 'text-stone-400'}`}>
                {form.solicitacao.length}/2000
              </span>
            </div>
            <textarea
              id="budget-request"
              required
              rows={4}
              minLength={20}
              maxLength={2000}
              value={form.solicitacao}
              onChange={(event) => setForm((previous) => ({ ...previous, solicitacao: event.target.value }))}
              placeholder="Conte um pouco sobre sua ideia, o que precisa e o resultado que espera alcançar..."
              className="min-h-[130px] w-full resize-y rounded-2xl border border-stone-200 bg-white p-4 text-[15px] leading-6 text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition duration-200 placeholder:text-stone-400 hover:border-stone-300 focus:border-[#a7833d] focus:outline-none focus:ring-4 focus:ring-[#d7b96e]/20 sm:text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-500">Mínimo de 20 caracteres para entendermos sua necessidade.</p>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#d7b96e]/20 bg-[#d7b96e]/[0.07] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6b2f]" />
            <p className="text-[11px] leading-relaxed text-slate-600">Seu nome, tipo de projeto e descrição serão incluídos na mensagem do WhatsApp.</p>
          </div>
        </div>

        <footer className="shrink-0 border-t border-stone-200/80 bg-white/95 px-5 py-3.5 sm:px-7 sm:py-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0c1825] via-[#172b40] to-[#0c1825] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(12,24,37,0.2)] transition duration-200 hover:shadow-[0_10px_24px_rgba(12,24,37,0.28)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#d7b96e] focus:ring-offset-2"
          >
            {submitting ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /><span>{'Preparando WhatsApp...'}</span></>
            ) : (
              <><span>Enviar pelo WhatsApp</span><Send className="h-4 w-4 text-[#d7b96e]" /><ArrowRight className="h-4 w-4" /></>
            )}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-500">O WhatsApp abrirá com a mensagem pronta para você enviar.</p>
        </footer>
      </form>
    </AccessibleDialog>
  );
}
