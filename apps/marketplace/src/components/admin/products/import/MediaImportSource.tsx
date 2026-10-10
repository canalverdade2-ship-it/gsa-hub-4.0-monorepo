import React, { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Search, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../../../lib/supabase';
import { ProductImportCandidate } from '../../../../types/productImport';
import { requireAdminSession } from '../../../../lib/adminRpc';

interface MediaImportSourceProps {
  type: 'pdf' | 'image';
  onCandidatesReady: (candidates: ProductImportCandidate[]) => void;
}

export function MediaImportSource({ type, onCandidatesReady }: MediaImportSourceProps) {
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const accept = type === 'pdf' ? '.pdf' : '.jpg,.jpeg,.png,.webp';
  const maxSize = type === 'pdf' ? 15 : 10;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`O arquivo deve ter no máximo ${maxSize}MB.`);
      return;
    }

    if (file.name.endsWith('.svg')) {
      toast.error('Arquivos SVG não são suportados para OCR.');
      return;
    }

    setLoading(true);
    let intervalId: any = null;

    try {
      // 1. Get Session for Edge Function
      const session = requireAdminSession();

      // 2. Request Signed URL
      setProgressText('Enviando arquivo com segurança...');
      const uploadReq = await supabase.functions.invoke('gsa-product-import', {
        body: {
          action: 'create_upload',
          sessaoId: session.sessaoId,
          sessionToken: session.sessionToken,
          filename: file.name
        }
      });

      if (uploadReq.error) {
         if (uploadReq.error.message?.includes('Failed to fetch')) {
            throw new Error('A Edge Function gsa-product-import não está respondendo. Pode não ter sido publicada ainda.');
         }
         throw uploadReq.error;
      }
      
      const { path, import_id, signed_url } = uploadReq.data;

      // 3. Upload File
      setProgressText('Lendo o conteúdo do arquivo...');
      const uploadRes = await fetch(signed_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        }
      });

      if (!uploadRes.ok) {
        throw new Error('Falha ao enviar o arquivo para o servidor.');
      }

      // 4. Request Analysis
      setProgressText('Identificando produtos...');
      
      // Rotate stages every 8 seconds to show real progress
      intervalRef.current = setInterval(() => {
        setProgressText((prev) => {
          if (prev === 'Identificando produtos...') return 'Organizando os resultados...';
          if (prev === 'Organizando os resultados...') return 'Preparando revisão...';
          return prev;
        });
      }, 8000);

      const analyzeReq = await supabase.functions.invoke('gsa-product-import', {
        body: {
          action: 'analyze_media',
          sessaoId: session.sessaoId,
          sessionToken: session.sessionToken,
          path: path
        }
      });

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (analyzeReq.error) {
         throw analyzeReq.error;
      }

      const result = analyzeReq.data;
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.products || !Array.isArray(result.products)) {
        throw new Error('Resposta inválida do servidor de IA.');
      }

      // Fix mojibake (e.g. "é" → "é") on the client side as a safety net
      // even if the Edge Function already cleaned it, this handles edge cases
      const fixMojibake = (str: string | null): string | null => {
        if (!str) return str;
        try {
          const bytes = new Uint8Array(str.length);
          let hasMojibake = false;
          for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code > 255) return str; // real unicode, no fix needed
            bytes[i] = code;
            if (code === 0xC3 || code === 0xC2) hasMojibake = true;
          }
          if (hasMojibake) {
            const decoded = new TextDecoder('utf-8').decode(bytes);
            if (!decoded.includes('\uFFFD')) return decoded;
          }
        } catch {
          // ignore
        }
        return str;
      };

      if (result.warnings?.length) {
        result.warnings.forEach((w: string) => {
          const lower = w.toLowerCase();
          // Suppress English encoding warnings — they're handled transparently now
          if (lower.includes('encoding') || lower.includes('alimento') || lower.includes('base de soja')) {
            return; 
          }
          toast.error(w, { duration: 5000 });
        });
      }

      // Log processing metadata in console for admin debugging
      if (result.processing) {
        console.log('[IA Audit Debug Info]', result.processing);
      }

      // 5. Map to Candidates
      let hashBaseStr = '';
      const uniqueSuffix = Date.now().toString(16);
      if (crypto.subtle) {
        const fingerprintBase = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.name + file.lastModified));
        hashBaseStr = Array.from(new Uint8Array(fingerprintBase)).map(b => b.toString(16).padStart(2, '0')).join('') + '-' + uniqueSuffix;
      } else {
        // Fallback for non-secure contexts (http:// IP addresses instead of localhost)
        hashBaseStr = (file.name + file.lastModified).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32) + '-' + uniqueSuffix;
      }

      const candidates: ProductImportCandidate[] = result.products.map((p: any, idx: number) => ({
        client_id: crypto.randomUUID(),
        source_type: type,
        source_reference: file.name,
        source_fingerprint: `${hashBaseStr}-ai-${idx}`,
        nome: fixMojibake(p.name) || null,
        descricao: fixMojibake(p.description) || null,
        valor_custo: p.cost || null,
        moeda: p.currency || 'BRL',
        imagens: [], 
        url_produto: fixMojibake(p.product_url) || null,
        nome_fornecedor: fixMojibake(p.supplier) || null,
        categoria_sugerida: null,
        sku: p.sku || null,
        codigo_barras: p.barcode || null,
        tipo_codigo_barras: null,
        identificador_preferencial: p.barcode ? 'codigo_barras' : 'interno',
        selecionado: p.confidence > 0.8,
        completo: !!(p.name && p.cost > 0),
        confidence: p.confidence,
        avisos: p.confidence < 0.8 ? ['Requer revisão cuidadosa (confiança baixa)'] : [],
        evidence: {
          trecho: fixMojibake(p.evidence) || null,
          pagina: p.page
        }
      }));

      if (candidates.length === 0) {
        toast.error('Nenhum produto foi identificado neste arquivo.');
        return;
      }

      onCandidatesReady(candidates);

    } catch (err: any) {
      if (intervalId) clearInterval(intervalId);
      console.error(err);
      
      // Friendly message on total failure
      toast.error(
        'Não foi possível analisar este arquivo no momento. Tente novamente mais tarde ou utilize Excel/TXT.',
        { duration: 6000 }
      );
    } finally {
      setLoading(false);
      setProgressText('');
      
      // Reset input element value to allow re-uploading same file if failed
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  return (
    <div className="p-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl m-6 bg-gray-50 relative">
      {loading ? (
        <div className="flex flex-col items-center max-w-sm text-center">
          <Search className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
          <p className="text-gray-800 font-medium mb-2">{progressText}</p>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4 overflow-hidden">
             <div className="bg-blue-500 h-1.5 rounded-full w-full animate-progress origin-left"></div>
          </div>
          <p className="text-xs text-gray-500">Por favor, não feche esta janela.</p>
        </div>
      ) : (
        <>
          <Upload className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2 text-center font-medium">
            Arraste seu arquivo {type.toUpperCase()} aqui.
          </p>
          <p className="text-sm text-gray-400 mb-4 text-center max-w-sm">
            Tamanho máximo: {maxSize}MB. Arquivos muito longos podem demorar a ser processados pela Inteligência Artificial.
          </p>
          
          {/* Privacy Notice */}
          <div className="flex items-start gap-2 bg-blue-50/50 border border-blue-100 rounded-lg p-3 mb-6 max-w-sm">
            <AlertTriangle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-700 leading-normal text-left font-medium">
              Este arquivo será processado por um serviço externo de inteligência artificial. Não envie documentos com dados pessoais, financeiros ou confidenciais.
            </p>
          </div>

          <input
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
            id={`media-upload-${type}`}
          />
          <label
            htmlFor={`media-upload-${type}`}
            className={`px-6 py-2 text-white rounded-lg cursor-pointer font-semibold ${type === 'pdf' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}
          >
            Selecionar {type.toUpperCase()}
          </label>
        </>
      )}
    </div>
  );
}
