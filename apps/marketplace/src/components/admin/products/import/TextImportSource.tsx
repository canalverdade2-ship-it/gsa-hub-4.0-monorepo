import React, { useState } from 'react';
import { Upload, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { ProductImportCandidate } from '../../../../types/productImport';
import { processBlockText, processCsvText } from '../../../../lib/textImportService';

interface TextImportSourceProps {
  onCandidatesReady: (candidates: ProductImportCandidate[]) => void;
}

export function TextImportSource({ onCandidatesReady }: TextImportSourceProps) {
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('O arquivo deve ter no máximo 5MB.');
      return;
    }

    setLoading(true);

    try {
      let candidates: ProductImportCandidate[] = [];

      // If it's a CSV or TSV, parse as tabular with basic mapping assumption
      // For a complete UX, we would route CSVs to ExcelImportSource mapping,
      // but here we demonstrate block parsing for txt and simple CSV fallback.
      if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
         const mapping = {
           nome: 'nome', descricao: 'descricao', custo: 'preco', url: 'url'
         };
         candidates = await processCsvText(file, mapping, file.name.endsWith('.tsv') ? '\t' : ',');
      } else {
         candidates = await processBlockText(file);
      }

      if (candidates.length === 0) {
        toast.error('Nenhum produto válido encontrado. Tente outra fonte (ex: Imagem/OCR) ou formate o texto em blocos.');
        setLoading(false);
        return;
      }
      
      onCandidatesReady(candidates);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao processar arquivo de texto: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl m-6 bg-gray-50 relative">
      {loading ? (
        <div className="flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Analisando texto...</p>
        </div>
      ) : (
        <>
          <Upload className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2 text-center">
            Arraste seu arquivo TXT, CSV ou TSV estruturado aqui.
          </p>
          <p className="text-sm text-gray-400 mb-6 text-center max-w-sm">
            O arquivo será lido em blocos (ex: Nome: Camiseta \n Preço: 29.90).
          </p>
          <input
            type="file"
            accept=".txt, .csv, .tsv"
            onChange={handleFileChange}
            className="hidden"
            id="txt-upload"
          />
          <label
            htmlFor="txt-upload"
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
          >
            Selecionar Arquivo de Texto
          </label>
        </>
      )}
    </div>
  );
}
