import { Download, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import { useFileViewer } from '../../contexts/FileViewerContext';

interface SecureAttachmentButtonProps {
  reference: string;
  fileName?: string;
  mimeType?: string;
  className?: string;
  label?: string;
  compact?: boolean;
}

export function SecureAttachmentButton({
  reference,
  fileName,
  mimeType,
  className = '',
  label,
  compact = false,
}: SecureAttachmentButtonProps) {
  const { openFile } = useFileViewer();
  const isImage = Boolean(mimeType?.startsWith('image/'));
  const Icon = isImage ? ImageIcon : FileIcon;

  return (
    <button
      type="button"
      onClick={() => void openFile(reference, fileName)}
      className={`flex items-center gap-2 rounded-lg font-bold transition-all ${compact ? 'p-2' : 'w-full p-3 text-xs'} ${className}`}
      title={fileName ? `Abrir ${fileName}` : 'Abrir anexo'}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!compact && <span className="min-w-0 flex-1 truncate text-left">{label || fileName || 'Abrir anexo'}</span>}
      <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </button>
  );
}
