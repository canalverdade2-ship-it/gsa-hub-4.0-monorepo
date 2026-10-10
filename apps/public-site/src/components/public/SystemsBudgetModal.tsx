import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  MessageCircle,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import { supabase } from '../../lib/supabase';

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

interface AttachedFile {
  file: File;
  name: string;
  size: number;
  type: string;
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
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY_FORM);
    setAttachedFile(null);
    setSubmitting(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen]);

  const closeSafely = () => {
    if (submitting) return;
    setForm(EMPTY_FORM);
    setAttachedFile(null);
    setUploadProgress(null);
    onClose();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      toast.error('O arquivo excede o limite máximo de 15 MB.');
      event.target.value = '';
      return;
    }

    setAttachedFile({ file, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const submitToWhatsApp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationMessage = validateForm(form);
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    // Reserve the WhatsApp tab on the click gesture before awaiting the file upload.
    const whatsappWindow = attachedFile ? window.open('about:blank', '_blank') : null;
    if (attachedFile && !whatsappWindow) {
      toast.error('Permita a abertura de uma nova aba para enviar o anexo pelo WhatsApp.');
      return;
    }

    setSubmitting(true);
    setUploadProgress(null);

    try {
      let attachmentUrl: string | null = null;
      if (attachedFile) {
        setUploadProgress('Preparando seu anexo...');
        const extension = attachedFile.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'dat';
        const safeBaseName = attachedFile.name
          .replace(/\.[^/.]+$/, '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40);
        const objectName = `public/whatsapp-requests/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBaseName}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('orcamentos-anexos')
          .upload(objectName, attachedFile.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: attachedFile.type,
          });
        if (uploadError) throw new Error('Não foi possível preparar o anexo. Tente novamente ou envie sem arquivo.');

        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('orcamentos-anexos')
          .createSignedUrl(objectName, 60 * 60 * 24 * 7);
        if (signedUrlError || !signedUrlData?.signedUrl) {
          throw new Error('Não foi possível gerar o link temporário do anexo. Tente novamente ou envie sem arquivo.');
        }
        attachmentUrl = signedUrlData.signedUrl;
      }

      const message = [
        'Olá! Gostaria de solicitar um orçamento para um projeto.',
        '',
        `*Nome completo:* ${form.nome.trim()}`,
        `*Projeto:* ${PROJECT_LABELS.get(form.tipo)}`,
        '',
        '*Descrição do projeto:*',
        form.solicitacao.trim(),
        ...(attachmentUrl ? ['', `*Arquivo de referência (link temporário por 7 dias):* ${attachmentUrl}`] : []),
      ].join('\n');
      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

      if (whatsappWindow) {
        whatsappWindow.opener = null;
        whatsappWindow.location.href = whatsappUrl;
      } else {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }

      toast.success('Solicitação pronta no WhatsApp. Revise e toque em enviar na conversa.');
      setSubmitting(false);
      onClose();
    } catch (error) {
      whatsappWindow?.close();
      console.error('Falha ao preparar solicitação para WhatsApp:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o WhatsApp agora.');
      setSubmitting(false);
      setUploadProgress(null);
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

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
              <label htmlFor="budget-file-upload" className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                <Paperclip className="h-3.5 w-3.5 text-[#8a6b2f]" /> Anexo <span className="text-xs font-normal text-slate-500">(opcional)</span>
              </label>
              <span className="text-[10px] font-medium text-slate-500">PDF, DOCX, imagem ou planilha · até 15 MB</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              id="budget-file-upload"
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp"
              className="hidden"
              disabled={submitting}
            />

            {!attachedFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="group flex min-h-[92px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 py-3 text-center transition duration-200 hover:border-[#a7833d] hover:bg-[#d7b96e]/5 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5f1e7] text-[#8a6b2f] transition group-hover:scale-105"><UploadCloud className="h-5 w-5" /></span>
                <span className="mt-1.5 text-xs font-semibold text-slate-800"><span className="text-[#8a6b2f]">Toque para anexar</span> ou escolha um arquivo</span>
                <span className="mt-0.5 text-[10px] text-slate-500">O WhatsApp receberá um link temporário do arquivo.</span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-50/70 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Paperclip className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-slate-900" title={attachedFile.name}>{attachedFile.name}</span>
                    <span className="mt-0.5 block text-[10px] text-emerald-800">{formatFileSize(attachedFile.size)} · link válido por 7 dias</span>
                  </span>
                </div>
                <button type="button" onClick={handleRemoveFile} disabled={submitting} aria-label="Remover anexo" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#d7b96e]/20 bg-[#d7b96e]/[0.07] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6b2f]" />
            <p className="text-[11px] leading-relaxed text-slate-600">Seus dados serão incluídos na mensagem do WhatsApp. O anexo, se houver, será compartilhado por um link temporário com a equipe.</p>
          </div>
        </div>

        <footer className="shrink-0 border-t border-stone-200/80 bg-white/95 px-5 py-3.5 sm:px-7 sm:py-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0c1825] via-[#172b40] to-[#0c1825] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(12,24,37,0.2)] transition duration-200 hover:shadow-[0_10px_24px_rgba(12,24,37,0.28)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#d7b96e] focus:ring-offset-2"
          >
            {submitting ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /><span>{uploadProgress || 'Preparando WhatsApp...'}</span></>
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
