import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

export interface UploadZoneProps {
  onFileSelect?: (file: File) => void;
  selectedFile?: { name: string; size: string } | null;
  onRemove?: () => void;
  accept?: string;
  hint?: string;
}

export function UploadZone({
  onFileSelect,
  selectedFile,
  onRemove,
  accept = '.pdf',
  hint = 'Apenas arquivos em PDF. Tamanho máximo de 10 MB.'
}: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect?.(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect?.(e.target.files[0]);
    }
  };

  return (
    <div>
      <div
        className={`dropzone-pdf ${isDragOver ? 'dropzone-pdf--hover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleChange}
        />
        <div style={{ color: '#2563eb', marginBottom: 12 }}>
          <UploadCloud size={36} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
          Arraste e solte o arquivo aqui
        </div>
        <div style={{ fontSize: 13, color: '#2563eb', fontWeight: 500, marginTop: 2 }}>
          ou <span style={{ textDecoration: 'underline' }}>clique para selecionar</span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{hint}</div>
      </div>

      {selectedFile && (
        <div className="file-chip">
          <div className="file-chip-icon">
            <FileText size={20} />
          </div>
          <div className="file-chip-name">{selectedFile.name}</div>
          <div className="file-chip-size">{selectedFile.size}</div>
          {onRemove && (
            <button type="button" className="file-chip-remove" onClick={onRemove}>
              <X size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadZone;
