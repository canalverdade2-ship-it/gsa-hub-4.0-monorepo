import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileCheck2, Loader2, Upload, WalletCards } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDateTime, generateUUID } from '../../lib/utils';
import { uploadFile } from '../../lib/storage';
import {
  cancelClientCreditWithdrawal,
  createCreditWithdrawal,
  listClientCreditWithdrawals,
  quoteCreditWithdrawal,
  submitCreditWithdrawalDocuments,
} from '../../features/creditWithdrawal/service';
import type {
  CreditWithdrawal,
  CreditWithdrawalDocument,
  CreditWithdrawalQuote,
} from '../../features/creditWithdrawal/types';

interface Props {
  isOpen: boolean;
  clientId: string;
  withdrawal?: CreditWithdrawal | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const STATUS_LABELS: Record<string, string> = {
  aguardando_documentos: 'Aguardando documentos',
  em_analise: 'Em análise',
  analise_reforcada: 'Análise minuciosa',
  aprovado: 'Aprovado para liberação',
  recusado: 'Não aprovado',
  cancelado_cliente: 'Cancelado',
  liberado: 'Liberado',
};
export function CreditWithdrawalModal({ isOpen, clientId, withdrawal, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState<CreditWithdrawal | null>(withdrawal || null);
  const [value, setValue] = useState('');
  const [pixType, setPixType] = useState('cpf');
  const [pixKey, setPixKey] = useState('');
  const [quote, setQuote] = useState<CreditWithdrawalQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [addressFile, setAddressFile] = useState<File | null>(null);

  const numericValue = useMemo(() => {
    const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    return Number(normalized || 0);
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      setCurrent(null);
      return;
    }
    if (withdrawal) {
      setCurrent(withdrawal);
    } else if (current?.id) {
      void listClientCreditWithdrawals()
        .then((items) => { const latest = items.find((item) => item.id === current.id); if (latest) setCurrent(latest); })
        .catch(() => undefined);
    } else {
      setValue('');
      setPixType('cpf');
      setPixKey('');
      setPhotoFile(null);
      setAddressFile(null);
    }
  }, [isOpen, withdrawal?.id, withdrawal?.status]);

  useEffect(() => {
    if (!isOpen || current) return;
    const timer = window.setTimeout(() => {
      setLoadingQuote(true);
      void quoteCreditWithdrawal(numericValue)
        .then(setQuote)
        .catch((error) => toast.error(error?.message || 'Não foi possível calcular o saque.'))
        .finally(() => setLoadingQuote(false));
    }, numericValue > 0 ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, current?.id, numericValue]);
  const handleCreate = async () => {
    if (!quote?.pode_solicitar || numericValue <= 0) {
      toast.error('Informe um valor que, somado à taxa, caiba no crédito disponível.');
      return;
    }
    if (!pixKey.trim()) {
      toast.error('Informe a chave PIX para recebimento.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createCreditWithdrawal(generateUUID(), numericValue, pixType, pixKey.trim());
      setCurrent({
        ...created,
        cliente_id: clientId,
        taxa_tipo: quote.taxa_tipo,
        taxa_config_valor: quote.taxa_config_valor,
        limite_disponivel_snapshot: quote.credito_disponivel_efetivo,
        valor_bloqueado: created.valor_total_fatura,
        criterio_cadastro_30d_ok: quote.criterio_cadastro_30d_ok,
        criterio_credito_100_ok: quote.criterio_credito_100_ok,
        pix_tipo: pixType,
        pix_chave_mascarada: '***',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await onChanged();
      toast.success(`Solicitação ${created.protocolo} registrada. Envie os documentos para iniciar a análise.`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível solicitar o saque.');
    } finally {
      setSubmitting(false);
    }
  };

  const uploadDocument = async (file: File, kind: string): Promise<CreditWithdrawalDocument> => {
    if (file.size > 10 * 1024 * 1024) throw new Error('Cada documento pode ter no máximo 10 MB.');
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const result = await uploadFile(file, 'documentos_cliente', `${clientId}/credit-withdrawal/${kind}-${Date.now()}-${generateUUID()}.${ext}`);
    return { path: result.path, name: file.name, mime_type: file.type, size: file.size };
  };
  const handleDocuments = async () => {
    if (!current || !photoFile || !addressFile) {
      toast.error('Envie o documento oficial com foto e o comprovante de endereço.');
      return;
    }
    setUploading(true);
    try {
      const [photoDocument, addressProof] = await Promise.all([
        uploadDocument(photoFile, 'documento-foto'),
        uploadDocument(addressFile, 'comprovante-endereco'),
      ]);
      await submitCreditWithdrawalDocuments(current.id, photoDocument, addressProof);
      setCurrent({
        ...current,
        documento_foto: photoDocument,
        comprovante_endereco: addressProof,
        status: current.analise_reforcada ? 'analise_reforcada' : 'em_analise',
        prazo_analise: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      });
      await onChanged();
      toast.success(current.analise_reforcada ? 'Documentos enviados. A análise minuciosa foi iniciada.' : 'Documentos enviados. A análise foi iniciada.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar os documentos.');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = async () => {
    if (!current || !window.confirm('Cancelar esta solicitação de saque? O valor reservado voltará a ficar disponível.')) return;
    setSubmitting(true);
    try {
      await cancelClientCreditWithdrawal(current.id);
      setCurrent({ ...current, status: 'cancelado_cliente', valor_bloqueado: 0 });
      await onChanged();
      toast.success('Solicitação de saque cancelada.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível cancelar a solicitação.');
    } finally {
      setSubmitting(false);
    }
  };
  const activeCanCancel = Boolean(current && ['aguardando_documentos', 'em_analise', 'analise_reforcada'].includes(current.status));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Saque do Crédito Disponível" size="lg">
      <div className="space-y-5">
        {!current ? (
          <>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="flex items-start gap-3">
                <WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                <div>
                  <p className="text-sm font-black text-indigo-950">Simule antes de solicitar</p>
                  <p className="mt-1 text-xs leading-relaxed text-indigo-800">O valor recebido via PIX será o valor do saque. A taxa é somada à operação e o total será cobrado em uma única fatura, com vencimento 30 dias após a liberação.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-black text-neutral-700">Valor que deseja receber via PIX</label>
              <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="R$ 0,00"
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-lg font-black outline-none focus:border-indigo-400" />
              {quote && <p className="mt-1 text-[10px] text-neutral-500">Máximo para saque considerando a taxa: {formatCurrency(quote.valor_maximo_saque)}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-black text-neutral-700">Tipo de chave PIX
                <select value={pixType} onChange={(event) => setPixType(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm outline-none">
                  <option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Chave aleatória</option>
                </select>
              </label>
              <label className="block text-xs font-black text-neutral-700">Chave PIX
                <input value={pixKey} onChange={(event) => setPixKey(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-indigo-400" />
              </label>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              {loadingQuote ? <div className="flex items-center justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div> : quote && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span>Crédito disponível efetivo</span><strong>{formatCurrency(quote.credito_disponivel_efetivo)}</strong></div>
                  <div className="flex justify-between"><span>Valor do saque</span><strong>{formatCurrency(numericValue)}</strong></div>
                  <div className="flex justify-between"><span>Taxa de saque {quote.taxa_tipo === 'percentual' ? `(${quote.taxa_config_valor}%)` : '(fixa)'}</span><strong>{formatCurrency(quote.taxa_calculada)}</strong></div>
                  <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-sm"><span className="font-black">Total da fatura</span><strong className="text-indigo-700">{formatCurrency(quote.valor_total_fatura)}</strong></div>
                  <p className="text-[10px] text-neutral-500">Vencimento: 30 dias após a confirmação da liberação do saque.</p>
                </div>
              )}
            </div>

            {quote && <div className={`rounded-2xl border p-4 ${quote.analise_reforcada ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className={`text-xs font-black ${quote.analise_reforcada ? 'text-amber-900' : 'text-emerald-900'}`}>Regras de liberação padrão</p>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center gap-2">{quote.criterio_cadastro_30d_ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}<span>Conta com pelo menos 30 dias — {quote.criterio_cadastro_30d_ok ? 'aprovada' : `não aprovada (${quote.dias_cadastro} dias)`}</span></div>
                <div className="flex items-center gap-2">{quote.criterio_credito_100_ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}<span>Crédito disponível acima de R$ 100 — {quote.criterio_credito_100_ok ? 'aprovada' : 'não aprovada'}</span></div>
              </div>
              {quote.analise_reforcada && <p className="mt-3 text-[11px] font-semibold leading-relaxed text-amber-900">Você pode continuar. Como uma ou mais regras de liberação padrão ainda não foram atendidas, a solicitação passará por uma análise minuciosa do sistema em até 72 horas e poderá ser aprovada ou recusada.</p>}
            </div>}
            <button type="button" onClick={() => void handleCreate()} disabled={submitting || loadingQuote || !quote?.pode_solicitar || !pixKey.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
              Solicitar saque e reservar crédito
            </button>
          </>
        ) : current.status === 'aguardando_documentos' ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-indigo-800">{current.protocolo}</p>
              <p className="mt-2 text-sm font-black text-neutral-900">Agora envie os documentos obrigatórios</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">O sistema precisa de um documento oficial com foto e um comprovante de endereço para iniciar a análise. O prazo de até 72 horas começa após o recebimento dos dois documentos.</p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-xs">
              <div className="flex justify-between"><span>Valor do saque</span><strong>{formatCurrency(current.valor_solicitado)}</strong></div>
              <div className="mt-2 flex justify-between"><span>Taxa de saque</span><strong>{formatCurrency(current.taxa_calculada)}</strong></div>
              <div className="mt-2 flex justify-between border-t border-neutral-100 pt-2"><span className="font-black">Fatura após liberação</span><strong>{formatCurrency(current.valor_total_fatura)}</strong></div>
            </div>

            {current.analise_reforcada && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-relaxed text-amber-900">Esta solicitação seguirá por análise minuciosa porque uma ou mais regras de liberação padrão não foram atendidas.</div>}
            <label className="block rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-xs font-bold text-neutral-700">
              <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Documento oficial com foto</span>
              <input type="file" accept="image/*,.pdf" className="mt-3 block w-full text-[11px]" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} />
              {photoFile && <p className="mt-2 text-[10px] text-emerald-700">Selecionado: {photoFile.name}</p>}
            </label>
            <label className="block rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-xs font-bold text-neutral-700">
              <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Comprovante de endereço</span>
              <input type="file" accept="image/*,.pdf" className="mt-3 block w-full text-[11px]" onChange={(event) => setAddressFile(event.target.files?.[0] || null)} />
              {addressFile && <p className="mt-2 text-[10px] text-emerald-700">Selecionado: {addressFile.name}</p>}
            </label>
            <button type="button" onClick={() => void handleDocuments()} disabled={uploading || !photoFile || !addressFile}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              Enviar documentos e iniciar análise
            </button>
            {activeCanCancel && <button type="button" onClick={() => void handleCancel()} disabled={submitting || uploading} className="w-full rounded-xl border border-rose-200 px-4 py-3 text-xs font-black text-rose-700 disabled:opacity-50">Cancelar solicitação</button>}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wide text-neutral-700">{current.protocolo}</p><span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-indigo-700 ring-1 ring-neutral-200">{STATUS_LABELS[current.status] || current.status}</span></div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                <div><p className="text-[9px] font-black uppercase text-neutral-400">Saque</p><p className="font-black">{formatCurrency(current.valor_solicitado)}</p></div>
                <div><p className="text-[9px] font-black uppercase text-neutral-400">Taxa</p><p className="font-black">{formatCurrency(current.taxa_calculada)}</p></div>
                <div><p className="text-[9px] font-black uppercase text-neutral-400">Fatura</p><p className="font-black text-indigo-700">{formatCurrency(current.valor_total_fatura)}</p></div>
              </div>
            </div>
            {current.status === 'analise_reforcada' && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-xs font-black text-amber-900">Análise minuciosa em andamento</p><p className="mt-1 text-[11px] leading-relaxed text-amber-900">Uma ou mais regras de liberação padrão não foram atendidas. O sistema avaliará a solicitação e poderá aprovar ou recusar.</p></div></div></div>}
            {['em_analise', 'analise_reforcada'].includes(current.status) && <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><div className="flex items-start gap-3"><Clock className="mt-0.5 h-5 w-5 text-indigo-600" /><div><p className="text-xs font-black text-indigo-900">Prazo de análise: até 72 horas</p>{current.prazo_analise && <p className="mt-1 text-[10px] text-indigo-700">Prazo estimado até {formatDateTime(current.prazo_analise)}</p>}</div></div></div>}
            {current.status === 'aprovado' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-900"><strong>Aprovado para liberação.</strong> O valor continua reservado até o sistema confirmar o pagamento via PIX. A fatura só será criada depois da liberação.</div>}
            {current.status === 'liberado' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-900"><strong>Saque liberado via PIX.</strong> A fatura foi gerada com vencimento em 30 dias após a liberação.</div>}
            {current.motivo_decisao && <div className="rounded-2xl border border-neutral-200 bg-white p-4"><p className="text-[10px] font-black uppercase text-neutral-500">Decisão do sistema</p><p className="mt-1 text-xs text-neutral-700">{current.motivo_decisao}</p></div>}
            {activeCanCancel && <button type="button" onClick={() => void handleCancel()} disabled={submitting} className="w-full rounded-xl border border-rose-200 px-4 py-3 text-xs font-black text-rose-700 disabled:opacity-50">Cancelar solicitação</button>}
          </div>
        )}
      </div>
    </Modal>
  );
}
