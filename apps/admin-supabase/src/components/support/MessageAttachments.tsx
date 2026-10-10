import React, { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import { signedFileUrl } from '../../storage';

export interface MessageAttachment {
  id?: string;
  fileId?: string;
  name: string;
  url?: string | null;
  viewUrl?: string | null;
  mimeType?: string;
  size?: number;
}

interface MessageAttachmentsProps {
  attachments?: MessageAttachment[];
  outgoing?: boolean;
  demoRole?: 'admin' | 'client';
}

const formatSize = (value?: number) => {
  if (!value || value < 1024) return value ? `${value} B` : '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const withDemoRole = (url: string | null | undefined, demoRole?: 'admin' | 'client') => {
  if (!url || !demoRole) return url || undefined;
  return `${url}${url.includes('?') ? '&' : '?'}demoRole=${demoRole}`;
};

export function MessageAttachments({ attachments = [], outgoing = false, demoRole }: MessageAttachmentsProps) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const attempted = useRef(new Set<string>());
  const items = attachments.filter((attachment) => attachment?.name);
  useEffect(() => {
    let active = true;
    const missing = items.filter((item) => item.fileId && !item.url && !item.viewUrl && !signedUrls[item.fileId] && !attempted.current.has(item.fileId));
    if (missing.length) {
      missing.forEach((item) => attempted.current.add(item.fileId!));
      void Promise.all(missing.map(async (item) => {
        try { return [item.fileId!, await signedFileUrl(item.fileId!)] as const; }
        catch { return [item.fileId!, ''] as const; }
      })).then((entries) => {
        const resolved = Object.fromEntries(entries.filter(([, url]) => url));
        if (active && Object.keys(resolved).length) setSignedUrls((current) => ({ ...current, ...resolved }));
      });
    }
    return () => { active = false; };
  }, [attachments, items, signedUrls]);
  if (!items.length) return null;

  return (
    <div className={`message-attachments ${outgoing ? 'message-attachments--outgoing' : ''}`}>
      {items.map((attachment, index) => {
        const mime = String(attachment.mimeType || '').toLowerCase();
        const privateUrl = attachment.fileId ? signedUrls[attachment.fileId] : undefined;
        const downloadUrl = withDemoRole(attachment.url || privateUrl, demoRole);
        const viewUrl = withDemoRole(attachment.viewUrl || attachment.url || privateUrl, demoRole);
        const isImage = mime.startsWith('image/') && Boolean(viewUrl);
        const isPdf = mime === 'application/pdf' && Boolean(viewUrl);
        const label = attachment.name || `Anexo ${index + 1}`;
        return (
          <div className="message-attachment" key={`${attachment.id || attachment.fileId || label}-${index}`}>
            {isImage ? (
              <a className="message-attachment-preview" href={viewUrl} target="_blank" rel="noreferrer" aria-label={`Visualizar ${label}`}>
                <img src={viewUrl} alt={label} loading="lazy" />
              </a>
            ) : isPdf ? (
              <div className="message-attachment-preview message-attachment-preview--pdf">
                <iframe src={viewUrl} title={`Prévia de ${label}`} loading="lazy" />
              </div>
            ) : (
              <span className="message-attachment-icon">{mime === 'application/pdf' ? <FileText size={19} /> : <ImageIcon size={19} />}</span>
            )}
            <div className="message-attachment-copy">
              <strong title={label}>{label}</strong>
              {formatSize(attachment.size) && <span>{formatSize(attachment.size)}</span>}
            </div>
            {downloadUrl && (
              <div className="message-attachment-actions">
                <a href={viewUrl || downloadUrl} target="_blank" rel="noreferrer" aria-label={`Visualizar ${label}`} title="Visualizar">
                  <ExternalLink size={15} />
                  <span>Visualizar</span>
                </a>
                <a href={downloadUrl} download={label} aria-label={`Baixar ${label}`} title="Baixar">
                  <Download size={15} />
                  <span>Baixar</span>
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default MessageAttachments;
