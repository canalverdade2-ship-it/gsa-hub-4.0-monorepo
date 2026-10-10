import React, { useState, useEffect } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function GSAChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{ ativo: boolean; url: string; tipo: 'iframe' | 'script' }>({
    ativo: false,
    url: '',
    tipo: 'iframe'
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('key, value')
          .like('key', 'ai_chatbot_%');

        if (data && !error) {
          const ativo = data.find(d => d.key === 'ai_chatbot_ativo')?.value === 'true';
          const url = data.find(d => d.key === 'ai_chatbot_url')?.value || '';
          const tipo = data.find(d => d.key === 'ai_chatbot_tipo')?.value === 'script' ? 'script' : 'iframe';
          setConfig({ ativo, url, tipo });
        }
      } catch (err) {
        console.error('Erro ao buscar config do chatbot:', err);
      }
    };

    fetchConfig();
  }, []);

  if (!config.ativo || !config.url) return null;

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-24 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
        aria-label="GSA Assistente IA"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      {/* Janela de Chat (Iframe Mode) */}
      {config.tipo === 'iframe' && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 origin-bottom-right ${
            isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
          }`}
          style={{ width: '380px', height: '600px', maxHeight: 'calc(100vh - 40px)' }}
        >
          <div className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm">GSA Assistente</h3>
                <p className="text-[10px] text-indigo-100">Inteligência Artificial</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 bg-neutral-50 relative">
            {isOpen && (
              <iframe
                src={config.url}
                className="absolute inset-0 w-full h-full border-0"
                title="GSA Assistente IA"
                allow="microphone"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
