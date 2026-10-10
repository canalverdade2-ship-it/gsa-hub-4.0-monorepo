import React from 'react';
import { Link, FileSpreadsheet, FileText, FileImage, FileCode2 } from 'lucide-react';
import { ImportSourceType } from '../../../../types/productImport';

interface ImportSourceSelectorProps {
  onSelect: (source: ImportSourceType) => void;
}

export function ImportSourceSelector({ onSelect }: ImportSourceSelectorProps) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">Escolha a origem dos produtos</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={() => onSelect('url')}
          className="flex flex-col items-start p-6 bg-white border rounded-xl shadow-sm hover:shadow-md hover:border-blue-500 transition-all group"
        >
          <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors mb-4">
            <Link className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Importar por URL</h3>
          <p className="text-sm text-gray-500 text-left">
            Localize produtos em uma página, categoria ou vitrine de fornecedor.
          </p>
        </button>

        <button
          onClick={() => onSelect('excel')}
          className="flex flex-col items-start p-6 bg-white border rounded-xl shadow-sm hover:shadow-md hover:border-green-500 transition-all group"
        >
          <div className="p-3 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors mb-4">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Importar Excel</h3>
          <p className="text-sm text-gray-500 text-left mb-3">
            Importe uma planilha contendo uma linha para cada produto.
          </p>
          <div className="text-xs font-medium text-gray-400">.xlsx, .xls, .csv</div>
        </button>

        <button
          onClick={() => onSelect('pdf')}
          className="flex flex-col items-start p-6 bg-white border rounded-xl shadow-sm hover:shadow-md hover:border-red-500 transition-all group"
        >
          <div className="p-3 bg-red-50 rounded-lg group-hover:bg-red-100 transition-colors mb-4">
            <FileText className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Importar PDF</h3>
          <p className="text-sm text-gray-500 text-left mb-3">
            Identifique produtos em catálogos, tabelas e listas em PDF.
          </p>
          <div className="text-xs font-medium text-gray-400">.pdf</div>
        </button>

        <button
          onClick={() => onSelect('txt')}
          className="flex flex-col items-start p-6 bg-white border rounded-xl shadow-sm hover:shadow-md hover:border-gray-500 transition-all group"
        >
          <div className="p-3 bg-gray-50 rounded-lg group-hover:bg-gray-100 transition-colors mb-4">
            <FileCode2 className="w-6 h-6 text-gray-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Importar TXT</h3>
          <p className="text-sm text-gray-500 text-left mb-3">
            Importe produtos de arquivos de texto ou listas estruturadas.
          </p>
          <div className="text-xs font-medium text-gray-400">.txt, .csv, .tsv</div>
        </button>

        <button
          onClick={() => onSelect('image')}
          className="flex flex-col items-start p-6 bg-white border rounded-xl shadow-sm hover:shadow-md hover:border-purple-500 transition-all group"
        >
          <div className="p-3 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors mb-4">
            <FileImage className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Importar Imagem</h3>
          <p className="text-sm text-gray-500 text-left mb-3">
            Identifique produtos, nomes e preços em fotos ou imagens de catálogos.
          </p>
          <div className="text-xs font-medium text-gray-400">.jpg, .jpeg, .png, .webp</div>
        </button>
      </div>
    </div>
  );
}
