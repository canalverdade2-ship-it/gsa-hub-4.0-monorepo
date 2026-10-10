import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { FileViewerModal } from '../components/ui/FileViewerModal';
import { isPrivateDocumentReference, resolvePrivateFileReference } from '../lib/privateStorage';
import { parseStorageReference, resolveProviderFileUrl } from '../lib/providerStorage';
import { getPrivateFileUrl, privatePathFromLegacyUrl } from '../lib/storage';

interface FileViewerContextType {
  openFile: (url: string, fileName?: string) => Promise<void>;
  closeFile: () => void;
}

const FileViewerContext = createContext<FileViewerContextType | undefined>(undefined);

async function resolveAnyFileReference(reference: string, expiresInSeconds = 300): Promise<string> {
  if (!reference) return '';

  const legacyPath = privatePathFromLegacyUrl(reference);
  if (legacyPath) return await getPrivateFileUrl(legacyPath);
  if (isPrivateDocumentReference(reference)) {
    return await resolvePrivateFileReference(reference, expiresInSeconds);
  }

  if (parseStorageReference(reference)) {
    return await resolveProviderFileUrl(reference, expiresInSeconds);
  }
  return reference;
}

function PrivateReferenceDomResolver() {
  const pendingRef = useRef(new WeakSet<Element>());

  useEffect(() => {
    const resolveElement = (element: Element) => {
      const attribute = element instanceof HTMLImageElement || element instanceof HTMLIFrameElement ? 'src' : 'href';
      const reference = element.getAttribute(attribute);
      if (!reference || pendingRef.current.has(element)) return;

      if (!isPrivateDocumentReference(reference) && !parseStorageReference(reference) && !privatePathFromLegacyUrl(reference)) {
        return;
      }

      pendingRef.current.add(element);
      void resolveAnyFileReference(reference)
        .then((signedUrl) => {
          if (element.isConnected && signedUrl) element.setAttribute(attribute, signedUrl);
        })
        .catch((error) => {
          console.error('Erro ao resolver referência privada na interface:', error);
          if (element instanceof HTMLImageElement || element instanceof HTMLIFrameElement) element.removeAttribute('src');
        })
        .finally(() => pendingRef.current.delete(element));
    };

    const scan = (root: ParentNode) => {
      if (root instanceof Element && root.matches('img[src], iframe[src], a[href]')) resolveElement(root);
      root.querySelectorAll?.('img[src], iframe[src], a[href]').forEach(resolveElement);
    };

    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          resolveElement(mutation.target);
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node);
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href'],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const openFile = useCallback(async (url: string, name?: string) => {
    if (!url) {
      toast.error('Arquivo indisponível.');
      return;
    }

    try {
      const resolvedUrl = await resolveAnyFileReference(url);
      setFileUrl(resolvedUrl);
      setFileName(name || null);
      setIsOpen(true);
    } catch (error: any) {
      console.error('Erro ao abrir arquivo protegido:', error);
      toast.error('Não foi possível autorizar o acesso ao arquivo.');
    }
  }, []);

  const closeFile = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => {
      setFileUrl(null);
      setFileName(null);
    }, 300);
  }, []);

  const value = useMemo(() => ({ openFile, closeFile }), [openFile, closeFile]);

  return (
    <FileViewerContext.Provider value={value}>
      {children}
      <PrivateReferenceDomResolver />
      <FileViewerModal isOpen={isOpen} onClose={closeFile} fileUrl={fileUrl} fileName={fileName} />
    </FileViewerContext.Provider>
  );
}

export function useFileViewer() {
  const context = useContext(FileViewerContext);
  if (!context) throw new Error('useFileViewer must be used within a FileViewerProvider');
  return context;
}
