import React, { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, MonitorPlay, Wallet, Users, Settings, Box, Plane, BarChart3, Bot, Megaphone, Terminal, AlertCircle, Landmark, MessageSquare, Share2, Crown, ShieldCheck, Receipt, Store, Handshake, BellRing, Tags, Tv2 } from 'lucide-react';


interface ActionItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  keywords: string[];
  module: string;
  tab?: string;
  action?: () => void;
}

const GLOBAL_ACTIONS: ActionItem[] = [
  { id: 'op_pedidos_marketplace', title: 'Pedidos do Marketplace', subtitle: 'Compras e Assinaturas', icon: Box, keywords: ['vendas', 'pedidos', 'compras', 'produtos', 'assinaturas'], module: 'operacoes', tab: 'produtos' },
  { id: 'op_viagens', title: 'Viagens GSA', subtitle: 'Operações', icon: Plane, keywords: ['viagem', 'pacotes', 'turismo', 'passagens'], module: 'viagens' },
  { id: 'op_store', title: 'GSA Store', subtitle: 'Comercial', icon: Store, keywords: ['loja', 'store', 'produtos', 'assinaturas', 'catalogo'], module: 'loja' },
  { id: 'op_classificados', title: 'Classificados GSA', subtitle: 'Comercial', icon: Tags, keywords: ['classificados', 'anuncios', 'marketplace'], module: 'classificados' },
  { id: 'fin_faturas', title: 'Faturas e Recebimentos', subtitle: 'Financeiro', icon: Wallet, keywords: ['faturas', 'pagamentos', 'receber', 'boletos', 'pix'], module: 'financeiro', tab: 'faturas' },
  { id: 'fin_cobranca', title: 'Régua de Cobrança', subtitle: 'Financeiro', icon: AlertCircle, keywords: ['cobranca', 'inadimplencia', 'protesto', 'atrasos'], module: 'cobranca' },
  { id: 'fin_fiscal', title: 'Fiscal e Notas', subtitle: 'Financeiro', icon: Receipt, keywords: ['fiscal', 'nota fiscal', 'nf', 'documentos fiscais'], module: 'fiscal' },
  { id: 'pes_clientes', title: 'Clientes', subtitle: 'Cadastros', icon: Users, keywords: ['clientes', 'pessoas', 'usuarios', 'cadastros'], module: 'cadastro', tab: 'clientes' },
  { id: 'pes_tickets', title: 'Tickets de Suporte', subtitle: 'Atendimento', icon: MessageSquare, keywords: ['suporte', 'ajuda', 'tickets', 'atendimento', 'sac'], module: 'atendimento' },
  { id: 'rel_parceiros', title: 'Parceiros', subtitle: 'Relacionamento', icon: Handshake, keywords: ['parceiros', 'rede', 'beneficios'], module: 'parceiros' },
  { id: 'rel_afiliados', title: 'Afiliados GSA', subtitle: 'Relacionamento', icon: Share2, keywords: ['afiliados', 'marketing', 'comissoes', 'indicacoes'], module: 'afiliados' },
  { id: 'rel_fidelidade', title: 'Fidelidade', subtitle: 'Relacionamento', icon: Crown, keywords: ['fidelidade', 'pontos', 'vouchers', 'premios'], module: 'fidelidade' },
  { id: 'rel_comunicacao', title: 'Avisos e Campanhas', subtitle: 'Relacionamento', icon: BellRing, keywords: ['avisos', 'campanhas', 'comunicacao'], module: 'avisos-campanhas' },
  { id: 'rel_vip', title: 'Área VIP', subtitle: 'Relacionamento', icon: Crown, keywords: ['vip', 'gamificacao', 'pontos', 'fidelidade'], module: 'area_vip' },
  { id: 'sys_relatorios', title: 'Relatórios Gerenciais', subtitle: 'Sistema', icon: BarChart3, keywords: ['relatorios', 'bi', 'dashboards', 'metricas', 'graficos'], module: 'relatorios' },
  { id: 'sys_acessos', title: 'Controle de Acessos', subtitle: 'Sistema', icon: ShieldCheck, keywords: ['acessos', 'permissoes', 'usuarios', 'colaboradores', 'senhas'], module: 'acessos' },
  { id: 'sys_config', title: 'Configurações Globais', subtitle: 'Sistema', icon: Settings, keywords: ['configuracoes', 'ajustes', 'parametros', 'empresa', 'whatsapp'], module: 'configuracoes' },
  { id: 'sys_automacoes', title: 'Automações (Scraping)', subtitle: 'Sistema', icon: Bot, keywords: ['robos', 'scraping', 'automacoes', 'n8n'], module: 'automacoes' },
  { id: 'sys_monitor', title: 'Saúde do Sistema', subtitle: 'Sistema', icon: Terminal, keywords: ['monitor', 'servidor', 'vps', 'cloudflare', 'banco de dados'], module: 'sistema' },
  { id: 'sys_gsatv', title: 'GSA TV', subtitle: 'Gestão', icon: Tv2, keywords: ['gsa tv', 'tv', 'programacao', 'midia'], module: 'gsa-tv' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (module: string, tab?: string, itemId?: string) => void;
  canAccess?: (module: string, tab?: string) => boolean;
}

export function AdminCommandPalette({ isOpen, onClose, onNavigate, canAccess }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filteredActions = GLOBAL_ACTIONS.filter((action) => {
    if (canAccess && !canAccess(action.module, action.tab)) return false;
    const searchStr = `${action.title} ${action.subtitle} ${action.keywords.join(' ')}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return searchStr.includes(normalizedQuery);
  }).slice(0, 9);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

  const handleExecute = (action: ActionItem) => {
    if (action.action) {
      action.action();
    } else {
      onNavigate(action.module, action.tab);
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, Math.max(0, filteredActions.length - 1))); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => Math.max(0, index - 1)); return; }
      if (event.key === 'Enter' && filteredActions[selectedIndex]) { event.preventDefault(); handleExecute(filteredActions[selectedIndex]); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredActions, isOpen, onClose, selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-neutral-950/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed left-1/2 top-[15%] z-[101] w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl bg-[#0F0F0F] shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
              <Search className="h-5 w-5 text-indigo-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Busque módulos, áreas ou comandos..."
                className="flex-1 bg-transparent text-lg font-bold text-white outline-none placeholder:text-white/30"
              />
              <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold text-white/50">
                <span className="text-xs">ESC</span>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {filteredActions.length > 0 ? (
                <div className="space-y-1">
                  {filteredActions.map((action, i) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={() => handleExecute(action)}
                        className="group flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition hover:bg-indigo-500/20"
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition shadow-sm ${i === selectedIndex ? 'bg-indigo-500 text-white' : 'bg-white/5 text-white/50 group-hover:bg-indigo-500 group-hover:text-white'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-white transition group-hover:text-indigo-300">
                            {action.title}
                          </p>
                          <p className="text-xs font-semibold text-white/40 transition group-hover:text-indigo-200/70">
                            {action.subtitle}
                          </p>
                        </div>
                        <div className="hidden text-xs font-bold text-white/20 group-hover:block group-hover:text-indigo-400">
                          Acessar ↵
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-12 text-center">
                  <MonitorPlay className="mx-auto h-12 w-12 text-white/10" />
                  <p className="mt-4 text-sm font-bold text-white/50">Nenhum comando encontrado.</p>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/30">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><kbd className="rounded bg-white/10 px-1.5 py-0.5">↑↓</kbd> Navegar</span>
                <span className="flex items-center gap-1.5"><kbd className="rounded bg-white/10 px-1.5 py-0.5">↵</kbd> Executar</span>
              </div>
              <div className="font-black uppercase tracking-widest text-indigo-500">GSA OS OmniBar</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
