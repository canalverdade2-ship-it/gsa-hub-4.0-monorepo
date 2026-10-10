import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, ExternalLink, FileText, File } from 'lucide-react';

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string | null;
  fileName: string | null;
}

export function FileViewerModal({ isOpen, onClose, fileUrl, fileName }: FileViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
    }
  }, [isOpen]);

  if (!isOpen || !fileUrl) return null;

  const isImage = fileUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const isPdf = fileUrl.match(/\.pdf(\?.*)?$/i) || fileName?.match(/\.pdf$/i);


  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => prev + 90);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      
      {/* HEADER / CONTROLS */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-3 text-white truncate max-w-[50%]">
          {isImage ? <File className="h-5 w-5 opacity-70 shrink-0" /> : <FileText className="h-5 w-5 opacity-70 shrink-0" />}
          <span className="font-semibold truncate text-sm">{fileName || 'Arquivo'}</span>
        </div>

        <div className="flex items-center gap-2">
          {isImage && (
            <>
              <button onClick={handleZoomOut} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all" title="Reduzir">
                <ZoomOut className="h-5 w-5" />
              </button>
              <button onClick={handleZoomIn} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all" title="Ampliar">
                <ZoomIn className="h-5 w-5" />
              </button>
              <button onClick={handleRotate} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all mr-2" title="Rotacionar">
                <RotateCw className="h-5 w-5" />
              </button>
              <div className="w-px h-6 bg-white/20 mx-1"></div>
            </>
          )}

          <a href={fileUrl} download={fileName || 'download'} target="_blank" rel="noreferrer" className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all" title="Baixar Arquivo">
            <Download className="h-5 w-5" />
          </a>
          <a href={fileUrl} target="_blank" rel="noreferrer" className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all" title="Abrir em nova aba">
            <ExternalLink className="h-5 w-5" />
          </a>
          <button onClick={onClose} className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-all ml-2" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* CONTENT VIEWER */}
      <div className="w-full h-full max-h-[85vh] mt-12 flex items-center justify-center overflow-auto rounded-xl">
        {isImage ? (
          <img 
            src={fileUrl} 
            alt={fileName || 'Imagem'} 
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              cursor: zoom > 1 ? 'grab' : 'default'
            }}
          />
        ) : isPdf ? (
          <object
            data={`${fileUrl}#toolbar=0`}
            type="application/pdf"
            className="w-full h-full max-w-5xl bg-white rounded-xl shadow-2xl"
            title={fileName || 'PDF'}
          >
            <div className="bg-white p-10 rounded-2xl flex flex-col items-center text-center max-w-sm m-auto mt-20">
              <FileText className="h-10 w-10 text-neutral-400 mb-4" />
              <h3 className="font-bold text-lg text-neutral-900 mb-2">Visualização Indisponível</h3>
              <p className="text-sm text-neutral-500 mb-6">
                Seu navegador ou dispositivo não suporta a visualização direta deste PDF. Por favor, baixe o arquivo para abri-lo.
              </p>
              <a 
                href={fileUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 w-full justify-center"
              >
                <Download className="h-5 w-5" />
                Baixar PDF
              </a>
            </div>
          </object>
        ) : (
          <div className="bg-white p-10 rounded-2xl flex flex-col items-center text-center max-w-sm">
            <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-10 w-10 text-neutral-400" />
            </div>
            <h3 className="font-bold text-lg text-neutral-900 mb-2">Formato não suportado</h3>
            <p className="text-sm text-neutral-500 mb-6">
              Este tipo de arquivo não pode ser visualizado diretamente no navegador. Por favor, faça o download.
            </p>
            <a 
              href={fileUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 w-full justify-center"
            >
              <Download className="h-5 w-5" />
              Baixar Arquivo
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
