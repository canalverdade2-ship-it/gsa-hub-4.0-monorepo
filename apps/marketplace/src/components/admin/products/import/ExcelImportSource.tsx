import React, { useState, useCallback } from 'react';
import { Upload, Loader2, Table, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { detectColumnMapping, processExcelFile, readExcelMetadata } from '../../../../lib/excelImportService';
import { ProductImportCandidate } from '../../../../types/productImport';

interface ExcelImportSourceProps {
  onCandidatesReady: (candidates: ProductImportCandidate[]) => void;
}

export function ExcelImportSource({ onCandidatesReady }: ExcelImportSourceProps) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  // Metadata state
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[][]>([]);
  const [headerRow, setHeaderRow] = useState<number>(0);

  // Mapping state
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('O arquivo deve ter no máximo 10MB.');
      return;
    }

    if (selectedFile.name.endsWith('.xlsm')) {
      toast.error('Arquivos com macro (.xlsm) não são permitidos por segurança.');
      return;
    }

    setFile(selectedFile);
    setLoading(true);

    try {
      const meta = await readExcelMetadata(selectedFile);
      setSheets(meta.sheets);
      setSelectedSheet(meta.sheets[0]);
      
      // Auto-detect header row (row with most columns)
      let maxCols = 0;
      let hRow = 0;
      meta.preview.slice(0, 20).forEach((row, i) => {
        const validCols = row.filter(c => c && String(c).trim() !== '').length;
        if (validCols > maxCols) {
          maxCols = validCols;
          hRow = i;
        }
      });

      setHeaderRow(hRow);
      setPreview(meta.preview);
      
      const foundHeaders = meta.preview[hRow] ? meta.preview[hRow].map(String) : [];
      setHeaders(foundHeaders);
      
      const initialMapping = detectColumnMapping(foundHeaders);
      setMapping(initialMapping);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao ler arquivo Excel. Verifique se não está corrompido.');
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!file || !selectedSheet || !mapping.nome) {
      toast.error('Selecione a coluna que representa o Nome do Produto.');
      return;
    }

    setLoading(true);
    try {
      const candidates = await processExcelFile(file, selectedSheet, headerRow, mapping);
      if (candidates.length === 0) {
        toast.error('Nenhum produto válido encontrado. Verifique as colunas mapeadas.');
        setLoading(false);
        return;
      }
      
      if (candidates.length > 500) {
        toast.error('A planilha contém mais de 500 produtos. Por favor, divida o arquivo.');
        setLoading(false);
        return;
      }

      onCandidatesReady(candidates);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao processar produtos: ' + err.message);
      setLoading(false);
    }
  };

  if (!file) {
    return (
      <div className="p-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl m-6 bg-gray-50">
        <Upload className="w-12 h-12 text-gray-400 mb-4" />
        <p className="text-gray-600 mb-2 text-center">
          Arraste e solte sua planilha aqui, ou clique para procurar.
        </p>
        <p className="text-sm text-gray-400 mb-6 text-center">
          Suporta .xlsx, .xls e .csv até 10MB
        </p>
        <input
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileChange}
          className="hidden"
          id="excel-upload"
        />
        <label
          htmlFor="excel-upload"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
        >
          Selecionar Arquivo
        </label>
      </div>
    );
  }

  const fields = [
    { key: 'nome', label: 'Nome do Produto', req: true },
    { key: 'descricao', label: 'Descrição' },
    { key: 'custo', label: 'Custo / Preço' },
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'url', label: 'URL / Link' },
    { key: 'categoria', label: 'Categoria' },
    { key: 'sku', label: 'SKU / Código' },
    { key: 'imagens', label: 'Imagens (URL)' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center bg-blue-50 p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <Table className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-blue-900">{file.name}</span>
        </div>
        <button onClick={() => setFile(null)} className="text-sm text-blue-600 hover:underline">
          Trocar arquivo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-semibold border-b pb-2">Mapeamento de Colunas</h3>
          <p className="text-sm text-gray-500">
            Relacione as colunas da sua planilha com os campos do sistema.
          </p>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {fields.map(f => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  {f.label} {f.req && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={mapping[f.key] || ''}
                  onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Ignorar --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-l pl-6">
          <h3 className="font-semibold border-b pb-2">Configurações</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Planilha</label>
            <select
              value={selectedSheet}
              onChange={e => setSelectedSheet(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              {sheets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Linha de Cabeçalho (1-indexado)
            </label>
            <input 
              type="number"
              min={1}
              value={headerRow + 1}
              inputMode="numeric"
onChange={e => {
                const val = parseInt(e.target.value) - 1;
                setHeaderRow(val >= 0 ? val : 0);
              }}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Linhas antes do cabeçalho serão ignoradas.
            </p>
          </div>

          <div className="bg-gray-50 p-3 rounded border text-sm">
            <strong>Dica:</strong> Valores como "R$ 1.234,56" serão convertidos automaticamente para o formato correto de banco de dados.
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button
          onClick={handleProcess}
          disabled={loading || !mapping.nome}
          className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
          <span>Continuar e Revisar</span>
        </button>
      </div>
    </div>
  );
}
