import React, { useState } from 'react';
import { Store, Globe, Package } from 'lucide-react';
import { ImportSupplierConfig, SupplierMode } from '../../../../types/productImport';
import { maskPhone } from '../../../../lib/utils';

interface ImportSupplierModeProps {
  onConfirm: (config: ImportSupplierConfig) => void;
  onBack: () => void;
}

export function ImportSupplierMode({ onConfirm, onBack }: ImportSupplierModeProps) {
  const [mode, setMode] = useState<SupplierMode | null>(null);
  
  // Online config
  const [nomeOnline, setNomeOnline] = useState('');
  
  // Fisica config
  const [nomeFisica, setNomeFisica] = useState('');
  const [cidade, setCidade] = useState('');
  const [telefone, setTelefone] = useState('');

  const handleConfirm = () => {
    if (!mode) return;
    
    if (mode === 'online') {
      onConfirm({ mode: 'online', nome_fornecedor: nomeOnline });
    } else if (mode === 'loja_fisica') {
      onConfirm({ mode: 'loja_fisica', nome_fornecedor: nomeFisica, cidade, telefone });
    } else {
      onConfirm({ mode: 'proprio' });
    }
  };

  const isFormValid = () => {
    if (mode === 'online') return !!nomeOnline;
    if (mode === 'loja_fisica') return !!nomeFisica && !!cidade && !!telefone;
    if (mode === 'proprio') return true;
    return false;
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-2">Como estes produtos serão fornecidos?</h2>
      <p className="text-sm text-gray-500 mb-6">Esta configuração será aplicada ao lote importado.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => setMode('online')}
          className={`flex flex-col items-center p-6 border-2 rounded-xl transition-all ${mode === 'online' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
        >
          <Globe className={`w-8 h-8 mb-3 ${mode === 'online' ? 'text-blue-600' : 'text-gray-400'}`} />
          <h3 className="font-semibold text-gray-900 mb-1">Fornecedor Online</h3>
          <p className="text-xs text-center text-gray-500">Exige URL de compra externa para cada produto.</p>
        </button>

        <button
          onClick={() => setMode('loja_fisica')}
          className={`flex flex-col items-center p-6 border-2 rounded-xl transition-all ${mode === 'loja_fisica' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}
        >
          <Store className={`w-8 h-8 mb-3 ${mode === 'loja_fisica' ? 'text-green-600' : 'text-gray-400'}`} />
          <h3 className="font-semibold text-gray-900 mb-1">Loja Física</h3>
          <p className="text-xs text-center text-gray-500">Compra presencial. Não exige URL externa.</p>
        </button>

        <button
          onClick={() => setMode('proprio')}
          className={`flex flex-col items-center p-6 border-2 rounded-xl transition-all ${mode === 'proprio' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}
        >
          <Package className={`w-8 h-8 mb-3 ${mode === 'proprio' ? 'text-purple-600' : 'text-gray-400'}`} />
          <h3 className="font-semibold text-gray-900 mb-1">Fornecimento Próprio</h3>
          <p className="text-xs text-center text-gray-500">Estoque local. Apenas adiciona ao catálogo.</p>
        </button>
      </div>

      {mode === 'online' && (
        <div className="bg-gray-50 p-6 rounded-lg mb-6 border animate-in fade-in slide-in-from-top-4">
          <h4 className="font-medium text-gray-900 mb-4">Dados do Fornecedor Online</h4>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Fornecedor *</label>
            <input 
              type="text" 
              value={nomeOnline} 
              onChange={e => setNomeOnline(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg" 
              placeholder="Ex: AliExpress"
            />
          </div>
          <p className="text-xs text-gray-500 mt-3">Você precisará garantir que cada produto tenha sua URL individual na próxima tela.</p>
        </div>
      )}

      {mode === 'loja_fisica' && (
        <div className="bg-gray-50 p-6 rounded-lg mb-6 border animate-in fade-in slide-in-from-top-4">
          <h4 className="font-medium text-gray-900 mb-4">Dados da Loja Física</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Loja *</label>
              <input 
                type="text" 
                value={nomeFisica} 
                onChange={e => setNomeFisica(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
              <input 
                type="text" 
                value={cidade} 
                onChange={e => setCidade(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg" 
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
              <input 
                type="text" 
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={telefone} 
                onChange={e => setTelefone(maskPhone(e.target.value))}
                className="w-full px-4 py-2 border rounded-lg" 
              />
            </div>
          </div>
        </div>
      )}

      {mode === 'proprio' && (
        <div className="bg-purple-50 text-purple-800 p-4 rounded-lg mb-6 border border-purple-100">
          Os produtos serão cadastrados diretamente no seu catálogo sem necessidade de configuração de compra externa.
        </div>
      )}

      <div className="flex justify-between pt-6 border-t">
        <button onClick={onBack} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
          Voltar para origem
        </button>
        <button 
          onClick={handleConfirm}
          disabled={!mode || !isFormValid()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Confirmar Fornecimento
        </button>
      </div>
    </div>
  );
}
