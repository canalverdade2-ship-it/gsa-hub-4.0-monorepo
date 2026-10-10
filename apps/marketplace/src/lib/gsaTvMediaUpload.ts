import { sessionService } from "./sessionService";

export const API_BASE = String(
  import.meta.env.VITE_GSA_TV_API_URL ||
    "https://api.147-15-43-141.nip.io/gsa-tv",
).replace(/\/$/, "");

export type QualityEnhancementProfile = "standard" | "1080p_pro" | "4k_pro" | "ai_super_res";

export type GsaTvUploadInput = {
  file: File;
  title?: string;
  mediaKind?: "program" | "advertising" | "identity" | "filler";
  advertiserName?: string;
  campaignName?: string;
  rightsConfirmed?: boolean;
  qualityProfile?: QualityEnhancementProfile;
  onProgress?: (percent: number) => void;
};

export type GsaTvUrlImportInput = {
  url: string;
  title?: string;
  mediaKind?: "program" | "advertising" | "identity" | "filler";
  advertiserName?: string;
  campaignName?: string;
  rightsConfirmed?: boolean;
  qualityProfile?: QualityEnhancementProfile;
};

export async function importGsaTvMediaFromUrl(
  input: GsaTvUrlImportInput,
): Promise<{ id: string; state: string }> {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken)
    throw new Error("Sua sessão administrativa expirou. Entre novamente.");
  const rightsConfirmed = input.rightsConfirmed ?? true;
  if (!rightsConfirmed)
    throw new Error("Confirme os direitos de utilização do material.");
  const resolvedTitle = input.title?.trim() || "Mídia Importada";
  const response = await fetch(`${API_BASE}/media/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gsa-session-id": session.sessaoId,
      "x-gsa-session-token": session.sessionToken,
    },
    body: JSON.stringify({
      url: input.url.trim(),
      title: resolvedTitle,
      media_kind: input.mediaKind || "program",
      advertiser_name: input.advertiserName?.trim(),
      campaign_name: input.campaignName?.trim(),
      rights_confirmed: true,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error || `Não foi possível importar a mídia (${response.status}).`,
    );
  return body;
}

export async function configureGsaTvFallback(mediaItemId: string) {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken)
    throw new Error("Sua sessão administrativa expirou. Entre novamente.");
  const response = await fetch(`${API_BASE}/fallback/configure`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gsa-session-id": session.sessaoId,
      "x-gsa-session-token": session.sessionToken,
    },
    body: JSON.stringify({ media_item_id: mediaItemId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error || "Não foi possível preparar a tela de emergência.",
    );
  return body;
}

export function uploadGsaTvRightsEvidence(
  file: File,
  mediaItemId: string,
): Promise<{
  storage_path: string;
  original_filename: string;
  sha256: string;
  size_bytes: number;
}> {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken)
    return Promise.reject(
      new Error("Sua sessão administrativa expirou. Entre novamente."),
    );
  if (!file?.size)
    return Promise.reject(new Error("Selecione um documento válido."));
  if (file.size > 25 * 1024 * 1024)
    return Promise.reject(new Error("O documento ultrapassa 25 MB."));
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `${API_BASE}/rights/evidence`);
    request.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream",
    );
    request.setRequestHeader("x-gsa-session-id", session.sessaoId);
    request.setRequestHeader("x-gsa-session-token", session.sessionToken);
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.setRequestHeader("x-media-id", encodeURIComponent(mediaItemId));
    request.onerror = () =>
      reject(
        new Error("A conexão foi interrompida durante o envio do documento."),
      );
    request.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(request.responseText || "{}");
      } catch {
        body = null;
      }
      if (request.status >= 200 && request.status < 300) return resolve(body);
      reject(
        new Error(
          body?.error ||
            `Não foi possível enviar o documento (${request.status}).`,
        ),
      );
    };
    request.send(file);
  });
}

export function uploadGsaTvMedia(
  input: GsaTvUploadInput,
): Promise<{ id: string; state: string }> {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken)
    return Promise.reject(
      new Error("Sua sessão administrativa expirou. Entre novamente."),
    );
  if (!input.file?.size)
    return Promise.reject(new Error("Selecione um arquivo válido."));
  const rightsConfirmed = input.rightsConfirmed ?? true;
  if (!rightsConfirmed)
    return Promise.reject(
      new Error("Confirme os direitos de utilização do material."),
    );
  const fallbackTitle =
    input.title?.trim() ||
    input.file.name.replace(/\.[^/.]+$/, "") ||
    "Novo Vídeo";
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `${API_BASE}/media/upload`);
    request.setRequestHeader(
      "content-type",
      input.file.type || "application/octet-stream",
    );
    request.setRequestHeader("x-gsa-session-id", session.sessaoId);
    request.setRequestHeader("x-gsa-session-token", session.sessionToken);
    request.setRequestHeader(
      "x-file-name",
      encodeURIComponent(input.file.name),
    );
    request.setRequestHeader(
      "x-media-title",
      encodeURIComponent(fallbackTitle),
    );
    request.setRequestHeader("x-media-kind", input.mediaKind || "program");
    request.setRequestHeader(
      "x-rights-confirmed",
      String(rightsConfirmed),
    );
    if (input.qualityProfile) {
      request.setRequestHeader("x-quality-profile", input.qualityProfile);
    }
    if (input.advertiserName)
      request.setRequestHeader(
        "x-advertiser-name",
        encodeURIComponent(input.advertiserName.trim()),
      );
    if (input.campaignName)
      request.setRequestHeader(
        "x-campaign-name",
        encodeURIComponent(input.campaignName.trim()),
      );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        input.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new Error("A conexão foi interrompida durante o envio."));
    request.onabort = () => reject(new Error("O envio foi cancelado."));
    request.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(request.responseText || "{}");
      } catch {
        body = null;
      }
      if (request.status >= 200 && request.status < 300) return resolve(body);
      reject(
        new Error(
          body?.error ||
            `Não foi possível enviar o arquivo (${request.status}).`,
        ),
      );
    };
    request.send(input.file);
  });
}

export async function enhanceGsaTvMediaQuality(
  mediaItemId: string,
  profile: QualityEnhancementProfile = "1080p_pro",
  removeWatermark: boolean = false,
): Promise<{
  success: boolean;
  id: string;
  title: string;
  resolution: string;
  message: string;
}> {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken)
    throw new Error("Sua sessão administrativa expirou. Entre novamente.");
  const response = await fetch(
    `${API_BASE}/media/${encodeURIComponent(mediaItemId)}/enhance`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gsa-session-id": session.sessaoId,
        "x-gsa-session-token": session.sessionToken,
      },
      body: JSON.stringify({ profile, remove_watermark: removeWatermark }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error ||
        `Não foi possível aprimorar a qualidade do vídeo (${response.status}).`,
    );
  return body;
}

export async function deleteGsaTvMedia(mediaId: string): Promise<{
  success: boolean;
  id: string;
  title?: string;
  deleted_files?: string[];
  freed_bytes?: number;
  freed_mb?: number;
}> {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken)
    throw new Error("Sua sessão administrativa expirou. Entre novamente.");
  const response = await fetch(`${API_BASE}/media/${encodeURIComponent(mediaId)}`, {
    method: "DELETE",
    headers: {
      "x-gsa-session-id": session.sessaoId,
      "x-gsa-session-token": session.sessionToken,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error || `Não foi possível excluir a mídia e seus arquivos (${response.status}).`,
    );
  return body;
}

