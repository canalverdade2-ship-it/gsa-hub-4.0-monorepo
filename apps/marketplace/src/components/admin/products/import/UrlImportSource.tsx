import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { maskPhone } from '../../../../lib/utils';

interface UrlImportSourceProps {
  onAnalyze: (url: string, supplierName: string, phone: string, obs: string) => Promise<void>;
  loading: boolean;
}

export function UrlImportSource({ onAnalyze, loading }: UrlImportSourceProps) {
  const [url, setUrl] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [phone, setPhone] = useState('');
  const [obs, setObs] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    onAnalyze(url, supplierName, phone, obs);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL da Página/Lista de Produtos *
          </label>
          <input
            type="url"
            required
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="https://fornecedor.com/produtos"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do Fornecedor *
          </label>
          <input
            type="text"
            required
            value={supplierName}
            onChange={e => setSupplierName(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Ex: Atacadão XPTO"
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefone
            </label>
            <input
              type="text"
              inputMode="tel"
              maxLength={15}
              value={phone}
              onChange={e => setPhone(maskPhone(e.target.value))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="(00) 00000-0000"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <input
              type="text"
              value={obs}
              onChange={e => setObs(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Contato com João"
              disabled={loading}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button
          type="submit"
          disabled={loading || !url || !supplierName}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Analisando...</span>
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              <span>Localizar Produtos</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
