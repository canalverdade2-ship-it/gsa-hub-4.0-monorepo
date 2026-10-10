import React, { useState, useRef, useEffect } from 'react';
import { whatsappNotificationService } from '../../../lib/whatsappNotificationService';
import { Loader2, FileText, MessageSquare } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AdminWhatsAppButtonProps {
  telefone?: string | null;
  mensagem: string;
  variant?: 'icon' | 'full';
  disabled?: boolean;
  className?: string;
  tooltip?: string;
  onSendWithPDF?: () => void | Promise<void>;
  isGeneratingPDF?: boolean;
}

export function AdminWhatsAppButton({
  telefone,
  mensagem,
  variant = 'icon',
  disabled = false,
  className = '',
  tooltip = 'Enviar Notificação via WhatsApp',
  onSendWithPDF,
  isGeneratingPDF = false,
}: AdminWhatsAppButtonProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDisabled = disabled || isGeneratingPDF || isSending;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    }
    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptions]);

  const handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isDisabled) {
      if (onSendWithPDF) {
        setShowOptions(true);
      } else {
        setIsSending(true);
        const sent = await whatsappNotificationService.enviarWhatsAppDireto(telefone, mensagem);
        setIsSending(false);
        if (sent) {
          toast.success(`Notificação enviada via WhatsApp!`);
        }
      }
    }
  };

  const sendOnlyMessage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOptions(false);
    setIsSending(true);
    const sent = await whatsappNotificationService.enviarWhatsAppDireto(telefone, mensagem);
    setIsSending(false);
    if (sent) {
      toast.success(`Notificação enviada via WhatsApp!`);
    }
  };

  const sendWithPDF = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOptions(false);
    if (onSendWithPDF) {
      await onSendWithPDF();
    }
  };

  const whatsappIcon = (
    <svg
      width={variant === 'icon' ? '20' : '18'}
      height={variant === 'icon' ? '20' : '18'}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );

  // ── Variante ícone circular com preview da mensagem ao hover ──────────────
  if (variant === 'icon') {
    return (
      <div className={`relative inline-flex items-center ${className}`} ref={dropdownRef}>
        <button
          onClick={handleAction}
          onMouseEnter={() => setShowPreview(true)}
          onMouseLeave={() => setShowPreview(false)}
          disabled={isDisabled}
          type="button"
          title={isSending ? 'Enviando notificação...' : tooltip}
          className={`
            relative h-10 w-10 rounded-full flex items-center justify-center
            transition-all duration-200 group
            ${isDisabled
              ? 'opacity-40 cursor-not-allowed bg-neutral-200 text-neutral-400'
              : 'bg-[#25D366] text-white shadow-md shadow-[#25D366]/30 hover:bg-[#128C7E] hover:shadow-lg hover:shadow-[#128C7E]/40 hover:scale-110 active:scale-95'
            }
          `}
        >
          {/* Anel pulsante */}
          {!isDisabled && !showOptions && (
            <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-20 pointer-events-none" />
          )}
          {isSending || isGeneratingPDF ? <Loader2 className="animate-spin h-5 w-5" /> : whatsappIcon}
        </button>

        {/* Preview da mensagem ao hover (Ponte invisível para não perder o hover) */}
        {showPreview && !isDisabled && (
          <div
            className="absolute bottom-full right-0 pb-2 z-50"
            onMouseEnter={() => setShowPreview(true)}
            onMouseLeave={() => setShowPreview(false)}
          >
            <div
              className="
                w-72 bg-[#111b21] rounded-2xl shadow-2xl
                border border-white/10 overflow-hidden
                animate-in fade-in slide-in-from-bottom-2 duration-150
              "
            >
              {/* Header do preview */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#202c33] border-b border-white/5">
              <div className="w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                {React.cloneElement(whatsappIcon as React.ReactElement<React.SVGProps<SVGSVGElement>>, { width: 14, height: 14 })}
              </div>
              <div>
                <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Pré-visualização</p>
                <p className="text-[9px] text-white/40 font-medium mt-0.5">
                  {telefone ? `+55 ${telefone}` : 'Busca automática no sistema'}
                </p>
              </div>
            </div>

            {/* Corpo da mensagem */}
            <div className="px-4 py-3 max-h-60 overflow-y-auto custom-scrollbar">
              <pre className="text-[10px] text-[#e9edef] font-sans leading-relaxed whitespace-pre-wrap break-words">
                {mensagem}
              </pre>
            </div>

            {/* Footer do preview */}
            <div className="px-4 py-2.5 bg-[#202c33] border-t border-white/5">
              <p className="text-[9px] text-[#25D366] font-bold text-center">
                Clique no botão para enviar a notificação instantaneamente
              </p>
            </div>
            </div>
          </div>
        )}

        {/* Modal de Opções de Envio */}
        {showOptions && !isDisabled && (
          <div className="absolute top-full right-0 mt-2 z-50 w-56 bg-white rounded-2xl shadow-2xl border border-neutral-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
              <p className="text-xs font-black text-neutral-800 uppercase tracking-wider">Enviar Notificação</p>
              <p className="text-[10px] text-neutral-500 font-medium mt-0.5">Escolha o formato de envio</p>
            </div>
            <div className="p-2 flex flex-col gap-1">
              <button
                onClick={sendOnlyMessage}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-neutral-50 transition-colors text-left group"
              >
                <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition-colors shrink-0">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-neutral-800 leading-none">Somente Mensagem</p>
                  <p className="text-[10px] text-neutral-500 mt-1">Enviar sem anexo</p>
                </div>
              </button>
              
              <button
                onClick={sendWithPDF}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-neutral-50 transition-colors text-left group"
              >
                <div className="h-8 w-8 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center group-hover:bg-[#25D366]/20 transition-colors shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-neutral-800 leading-none">Mensagem + PDF</p>
                  <p className="text-[10px] text-neutral-500 mt-1">Anexar documento na nuvem</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Variante botão completo ────────────────────────────────────────────────
  return (
    <div className={`relative inline-flex ${className}`} ref={dropdownRef}>
      <button
        onClick={handleAction}
        disabled={isDisabled}
        type="button"
        className={`
          relative w-full flex items-center justify-center gap-2
          px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider
          transition-all duration-200
          ${isDisabled
            ? 'opacity-40 cursor-not-allowed bg-neutral-200 text-neutral-400'
            : 'bg-[#25D366] text-white shadow-md shadow-[#25D366]/30 hover:bg-[#128C7E] hover:shadow-lg hover:scale-[1.02] active:scale-95'
          }
        `}
      >
        {!isDisabled && !showOptions && (
          <span className="absolute inset-0 rounded-xl bg-[#25D366] animate-ping opacity-10 pointer-events-none" />
        )}
        {isGeneratingPDF ? <Loader2 className="animate-spin h-5 w-5" /> : whatsappIcon}
        <span>{isGeneratingPDF ? 'Gerando PDF...' : 'Notificar WhatsApp'}</span>
      </button>

      {/* Modal de Opções de Envio */}
      {showOptions && !isDisabled && (
        <div className="absolute top-full right-0 mt-2 z-50 w-64 bg-white rounded-2xl shadow-2xl border border-neutral-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
            <p className="text-xs font-black text-neutral-800 uppercase tracking-wider">Enviar Notificação</p>
            <p className="text-[10px] text-neutral-500 font-medium mt-0.5">Como deseja enviar o documento?</p>
          </div>
          <div className="p-2 flex flex-col gap-1">
            <button
              onClick={sendOnlyMessage}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-neutral-50 transition-colors text-left group"
            >
              <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition-colors shrink-0">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-800 leading-none">Somente Mensagem</p>
                <p className="text-[10px] text-neutral-500 mt-1">Apenas o texto formatado</p>
              </div>
            </button>
            
            <button
              onClick={sendWithPDF}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-neutral-50 transition-colors text-left group"
            >
              <div className="h-8 w-8 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center group-hover:bg-[#25D366]/20 transition-colors shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-800 leading-none">Mensagem + Link PDF</p>
                <p className="text-[10px] text-neutral-500 mt-1">Documento será anexado</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
