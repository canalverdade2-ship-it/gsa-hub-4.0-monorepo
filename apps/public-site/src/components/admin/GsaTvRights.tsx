import React, { useMemo, useRef, useState } from "react";
import { FileCheck2, Loader2, Paperclip, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import { mutateGsaTvExtended } from "../../lib/gsaTvExtended";
import { uploadGsaTvRightsEvidence } from "../../lib/gsaTvMediaUpload";
type Props = {
  channelId: string;
  media: any[];
  rights: any[];
  onChanged: () => Promise<void> | void;
};
export function GsaTvRights({ channelId, media, rights, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    media_item_id: "",
    document_name: "",
    document_type: "authorization",
    valid_until: "",
    justification: "",
    verified: false,
  });
  const byId = useMemo(
    () => Object.fromEntries(media.map((x) => [x.id, x])),
    [media],
  );
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !form.justification.trim()) {
      toast.error(
        "Anexe uma comprovação ou informe a justificativa da autorização.",
      );
      return;
    }
    setBusy(true);
    try {
      const evidence = file
        ? await uploadGsaTvRightsEvidence(file, form.media_item_id)
        : null;
      await mutateGsaTvExtended("save_rights_document", {
        channel_id: channelId,
        media_item_id: form.media_item_id,
        document_name: form.document_name,
        document_type: form.document_type,
        valid_until: form.valid_until
          ? new Date(form.valid_until).toISOString()
          : null,
        verified: form.verified,
        storage_path: evidence?.storage_path || null,
        metadata: {
          justification: form.justification.trim() || null,
          original_filename: evidence?.original_filename || null,
          sha256: evidence?.sha256 || null,
          size_bytes: evidence?.size_bytes || null,
        },
      });
      toast.success("Dossiê de direitos atualizado e auditado.");
      setForm({
        ...form,
        document_name: "",
        valid_until: "",
        justification: "",
        verified: false,
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao salvar direito.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[390px_1fr]">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-black">
          <FileCheck2 className="h-5 w-5 text-indigo-600" />
          Registrar autorização
        </h2>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm font-semibold">
            Mídia
            <select
              required
              value={form.media_item_id}
              onChange={(e) =>
                setForm({ ...form, media_item_id: e.target.value })
              }
              className="mt-1 w-full rounded-lg border p-2.5"
            >
              <option value="">Selecione</option>
              {media.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Documento / referência
            <input
              required
              value={form.document_name}
              onChange={(e) =>
                setForm({ ...form, document_name: e.target.value })
              }
              className="mt-1 w-full rounded-lg border p-2.5"
              placeholder="Ex.: Autorização de exibição 2026"
            />
          </label>
          <label className="block text-sm font-semibold">
            Tipo
            <select
              value={form.document_type}
              onChange={(e) =>
                setForm({ ...form, document_type: e.target.value })
              }
              className="mt-1 w-full rounded-lg border p-2.5"
            >
              <option value="authorization">Autorização</option>
              <option value="license">Licença</option>
              <option value="contract">Contrato</option>
              <option value="release">Cessão de imagem/voz</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Comprovação em arquivo{" "}
            <span className="font-normal text-slate-500">(opcional)</span>
            <span className="mt-1 flex items-center gap-2 rounded-lg border p-2.5">
              <Paperclip className="h-4 w-4 text-indigo-600" />
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="min-w-0 flex-1 text-xs"
              />
            </span>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              PDF, imagem ou TXT, até 25 MB.
            </span>
          </label>
          <label className="block text-sm font-semibold">
            Justificativa / autorização copiada{" "}
            <span className="font-normal text-slate-500">(opcional)</span>
            <textarea
              rows={4}
              value={form.justification}
              onChange={(e) =>
                setForm({ ...form, justification: e.target.value })
              }
              className="mt-1 w-full rounded-lg border p-2.5"
              placeholder="Cole aqui o texto da autorização, fonte, licença ou justificativa legal."
            />
          </label>
          <label className="block text-sm font-semibold">
            Validade
            <input
              type="datetime-local"
              value={form.valid_until}
              onChange={(e) =>
                setForm({ ...form, valid_until: e.target.value })
              }
              className="mt-1 w-full rounded-lg border p-2.5"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.verified}
              onChange={(e) => setForm({ ...form, verified: e.target.checked })}
            />
            <span>Documento conferido por responsável autorizado.</span>
          </label>
          <button
            disabled={busy || !form.verified}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Registrar e validar
          </button>
        </form>
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-4 font-black">Dossiês de direitos</h2>
        {rights.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
            Nenhum documento registrado.
          </div>
        ) : (
          <div className="divide-y">
            {rights.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <strong>{r.document_name}</strong>
                  <p className="mt-1 text-xs text-slate-500">
                    {byId[r.media_item_id]?.title || r.media_item_id} ·{" "}
                    {r.document_type}
                    {r.valid_until
                      ? ` · válido até ${new Date(r.valid_until).toLocaleString("pt-BR")}`
                      : " · sem expiração"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${r.verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {r.verified ? "verificado" : "pendente"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
