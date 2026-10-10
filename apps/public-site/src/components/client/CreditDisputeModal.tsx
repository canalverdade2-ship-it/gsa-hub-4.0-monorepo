import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { uploadFile } from '../../lib/storage';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import type { LojaCreditoMovimentacao } from '../../types';
import {
  cancelClientCreditDispute,
  createClientCreditDispute,
  getClientCreditDisputeDetails,
} from '../../features/creditDisputes/service';
import type { CreditDispute, CreditDisputeReason } from '../../features/creditDisputes/types';

const REASONS: Array<{ value: CreditDisputeReason; label: string }> = [
  { value: 'nao_reconheco', label: 'Não reconheço esta compra' },
  { value: 'nao_recebido', label: 'Produto/serviço não recebido' },
  { value: 'produto_divergente', label: 'Produto diferente do solicitado' },
  { value: 'cobranca_duplicada', label: 'Cobrança duplicada' },
  { value: 'valor_incorreto', label: 'Valor incorreto' },
  { value: 'cancelada_sem_estorno', label: 'Compra cancelada mas não estornada' },
  { value: 'problema_fornecedor', label: 'Problema com fornecedor/prestador' },
  { value: 'outro', label: 'Outro' },
];
const STATUS_LABELS: Record<string, string> = {
  aberta: 'Registrada',
  em_analise: 'Em análise',
  aguardando_documentos: 'Aguardando documentos',
  deferida: 'Aprovada',
  parcialmente_deferida: 'Parcialmente aprovada',
  indeferida: 'Não aprovada',
  cancelada_cliente: 'Cancelada',
  resolvida_por_estorno: 'Resolvida por estorno',
};

interface Props {
  isOpen: boolean;
  movement: LojaCreditoMovimentacao | null;
  dispute?: CreditDispute | null;
  clientId: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export function CreditDisputeModal({ isOpen, movement, dispute, clientId, onClose, onChanged }: Props) {
  const [reason, setReason] = useState<CreditDisputeReason>('nao_reconheco');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [details, setDetails] = useState<CreditDispute | null>(dispute || null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const confirmHook = useConfirm();

  const deadline = useMemo(() => {
    if (!movement?.created_at) return null;
    const date = new Date(movement.created_at);
    date.setDate(date.getDate() + 90);
    return date;
  }, [movement]);
  useEffect(() => {
    setDetails(dispute || null);
    setReason('nao_reconheco');
    setDescription('');
    setAttachments([]);
    if (isOpen && dispute?.id) {
      void getClientCreditDisputeDetails(dispute.id)
        .then(setDetails)
        .catch(() => undefined);
    }
  }, [isOpen, dispute?.id]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 5)) {
        if (file.size > 10 * 1024 * 1024) throw new Error('Cada anexo pode ter no máximo 10 MB.');
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const result = await uploadFile(
          file,
          'documentos_cliente',
          `contestacoes-credito/${clientId}/${Date.now()}-${safeName}`,
        );
        uploaded.push(result.path);
      }
      setAttachments((current) => [...current, ...uploaded].slice(0, 5));
      toast.success(`${uploaded.length} anexo(s) adicionado(s).`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar o anexo.');
    } finally {
      setUploading(false);
    }
  };
  const handleSubmit = async () => {
    if (!movement) return;
    if (description.trim().length < 10) {
      toast.error('Descreva o problema com pelo menos 10 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createClientCreditDispute({
        movimentacaoId: movement.id,
        motivo: reason,
        descricao: description,
        anexos: attachments,
      });
      const loaded = await getClientCreditDisputeDetails(created.contestacao_id);
      setDetails(loaded);
      await onChanged();
      toast.success(`Contestação ${created.protocolo} registrada.`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível registrar a contestação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!details) return;
    const confirmed = await confirmHook.confirm({
      title: 'Cancelar contestação?',
      message: 'A análise será encerrada. Você só poderá abrir outra contestação se a compra ainda estiver dentro do prazo de 90 dias.',
      confirmLabel: 'Sim, cancelar contestação',
      cancelLabel: 'Manter contestação',
      variant: 'danger',
    });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await cancelClientCreditDispute(details.id);
      setDetails(await getClientCreditDisputeDetails(details.id));
      await onChanged();
      toast.success('Contestação cancelada.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível cancelar a contestação.');
    } finally {
      setSubmitting(false);
    }
  };
  if (!movement) return null;
  const canCancel = Boolean(details && ['aberta', 'em_analise', 'aguardando_documentos'].includes(details.status));

  return (
    <>
      <ConfirmDialog {...confirmHook} />
      <Modal isOpen={isOpen} onClose={onClose} title={details ? 'Acompanhar Contestação' : 'Contestar Compra'} size="lg">
        <div className="space-y-5">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black text-neutral-900">{movement.descricao || 'Compra no Crédito GSA'}</p>
                <p className="mt-1 text-[11px] text-neutral-500">{formatDateTime(movement.created_at)}</p>
              </div>
              <strong className="shrink-0 text-sm text-rose-600">-{formatCurrency(Math.abs(Number(movement.valor || 0)))}</strong>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-800">
              <Clock className="h-4 w-4 shrink-0" />
              Prazo de contestação: {deadline ? deadline.toLocaleDateString('pt-BR') : 'indisponível'}
            </div>
          </div>

          {details ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wide text-indigo-800">{details.protocolo}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-indigo-700 ring-1 ring-indigo-100">
                    {STATUS_LABELS[details.status] || details.status}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold text-neutral-700">{REASONS.find((item) => item.value === details.motivo)?.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600">{details.descricao}</p>
              </div>
              {details.valor_deferido > 0 && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                  Valor deferido: {formatCurrency(details.valor_deferido)}
                </div>
              )}
              {details.motivo_decisao && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">Decisão do sistema</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-700">{details.motivo_decisao}</p>
                </div>
              )}
              <div className="space-y-3">
                <h4 className="text-sm font-black text-neutral-900">Linha do tempo</h4>
                {(details.eventos || []).map((event) => (
                  <div key={event.id} className="flex gap-3 rounded-xl border border-neutral-100 p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                    <div>
                      <p className="text-xs font-bold text-neutral-800">{event.titulo}</p>
                      {event.descricao && <p className="mt-0.5 text-[11px] text-neutral-500">{event.descricao}</p>}
                      <p className="mt-1 text-[9px] text-neutral-400">{formatDateTime(event.ocorrido_em)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {canCancel && (
                <button type="button" onClick={() => void handleCancel()} disabled={submitting}
                  className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 disabled:opacity-50">
                  Cancelar contestação
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-black text-neutral-700">Motivo da contestação</label>
                <select value={reason} onChange={(event) => setReason(event.target.value as CreditDisputeReason)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm font-semibold text-neutral-800 outline-none focus:border-indigo-400">
                  {REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-black text-neutral-700">Descreva o ocorrido</label>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={3000}
                  placeholder="Explique o que aconteceu e por que esta compra deve ser revista..."
                  className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-800 outline-none focus:border-indigo-400" />
                <p className="mt-1 text-right text-[10px] text-neutral-400">{description.length}/3000</p>
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-xs font-bold text-neutral-600">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Enviando anexos...' : 'Adicionar comprovantes (opcional)'}
                <input type="file" multiple className="hidden" accept="image/*,.pdf" disabled={uploading}
                  onChange={(event) => void handleUpload(event.target.files)} />
              </label>
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map((path, index) => (
                    <div key={path} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600">
                      <FileText className="h-3.5 w-3.5" /> Anexo {index + 1} enviado com segurança
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>O valor contestado retorna ao limite disponível, mas permanece bloqueado para novas compras até a conclusão da análise.</span>
                </div>
              </div>
              <button type="button" onClick={() => void handleSubmit()}
                disabled={submitting || uploading || description.trim().length < 10}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Enviar contestação
              </button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
