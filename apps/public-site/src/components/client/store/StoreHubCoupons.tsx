import React, { useState, useEffect } from 'react';
import { copyToClipboard } from '../../../lib/utils';
import { Ticket, CheckCircle, AlertCircle, Copy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { toast } from 'react-hot-toast';
import { Modal } from '../../ui/Modal';
import { callClientRpc } from '../../../lib/clientRpc';

const GUEST_ACTIVATED_STORE_COUPONS_KEY = 'gsa_guest_activated_store_coupons';

interface StoreHubCouponsProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
}

export default function StoreHubCoupons({ isOpen, onClose, clientId }: StoreHubCouponsProps) {
  const [cuponsTab, setCuponsTab] = useState<'ativos' | 'usados'>('ativos');
  const [cupons, setCupons] = useState<any[]>([]);
  const [cuponsAtivados, setCuponsAtivados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [ativandoCupom, setAtivandoCupom] = useState<string | null>(null);
  const [copiedCupomId, setCopiedCupomId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchCupons();
    }
  }, [isOpen, clientId]);

  const fetchCupons = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('cupons_loja')
        .select('*')
        .eq('status', 'ativo')  // só cupons ativos chegam ao cliente
        .order('created_at', { ascending: false });

      // O cliente vê cupons públicos e os direcionados a ele.
      query = clientId
        ? query.or(`cliente_id.is.null,cliente_id.eq.${clientId}`)
        : query.is('cliente_id', null);

      const { data: cuponsData, error } = await query;
      if (error) throw error;

      const ativadosSet = new Set<string>();
      const clienteUsosCount: Record<string, number> = {};

      if (clientId) {
        const { data: ativacoes } = await supabase
          .from('cupons_ativados')
          .select('cupom_id')
          .eq('cliente_id', clientId);

        if (ativacoes) {
          ativacoes.forEach(a => ativadosSet.add(a.cupom_id));
        }

        const { data: orcamentos } = await supabase
          .from('orcamentos')
          .select('cupom_desconto_id, cupom_entrega_id')
          .eq('cliente_id', clientId)
          .neq('status', 'cancelado');

        (orcamentos || []).forEach((orc: any) => {
          if (orc.cupom_desconto_id) {
            clienteUsosCount[orc.cupom_desconto_id] = (clienteUsosCount[orc.cupom_desconto_id] || 0) + 1;
          }
          if (orc.cupom_entrega_id) {
            clienteUsosCount[orc.cupom_entrega_id] = (clienteUsosCount[orc.cupom_entrega_id] || 0) + 1;
          }
        });
      } else {
        try {
          const stored = JSON.parse(localStorage.getItem(GUEST_ACTIVATED_STORE_COUPONS_KEY) || '[]');
          if (Array.isArray(stored)) {
            stored.forEach((cupomId) => {
              if (typeof cupomId === 'string') ativadosSet.add(cupomId);
            });
          }
        } catch {
          localStorage.removeItem(GUEST_ACTIVATED_STORE_COUPONS_KEY);
        }
      }
      setCuponsAtivados(ativadosSet);

      const cuponsProcessados = (cuponsData || [])
        .map((c: any) => {
          const clienteUsos = clienteUsosCount[c.id] || 0;
          const limiteCliente = c.limite_usos_por_cliente || 1;
          let localStatus = clienteUsos >= limiteCliente ? 'usado' : 'ativo';

          // só marca esgotado globalmente se limite_usos for um número positivo
          if (localStatus !== 'usado' && (c.limite_usos > 0) && (c.total_usos || 0) >= c.limite_usos) {
            localStatus = 'esgotado';
          }
          if (c.data_validade) {
            const [year, month, day] = String(c.data_validade).split('T')[0].split('-').map(Number);
            const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
            if (expiryDate < new Date()) localStatus = 'expirado';
          }
          return { ...c, status_local: localStatus, cliente_usos: clienteUsos, limite_cliente: limiteCliente };
        });

      setCupons(cuponsProcessados);
    } catch (error) {
      console.error('Erro ao buscar cupons:', error);
      toast.error('Não foi possível carregar seus cupons.');
    } finally {
      setLoading(false);
    }
  };

  const ativarCupom = async (cupomId: string) => {
    setAtivandoCupom(cupomId);
    try {
      if (clientId) {
        await callClientRpc('gsa_client_activate_store_coupon', { p_cupom_id: cupomId });
      } else {
        const activated = new Set(cuponsAtivados);
        activated.add(cupomId);
        localStorage.setItem(GUEST_ACTIVATED_STORE_COUPONS_KEY, JSON.stringify([...activated]));
      }
      setCuponsAtivados(prev => new Set([...prev, cupomId]));
      toast.success('Cupom ativado com sucesso!');
    } catch (error: any) {
      const code = String(error?.code || '');
      const msg = String(error?.message || error?.details || '').toLowerCase();
      if (code === '23505' || msg.includes('duplicate') || msg.includes('already exists') || msg.includes('unique')) {
        // Cupom já estava ativado: reflete o estado real na interface
        setCuponsAtivados(prev => new Set([...prev, cupomId]));
        toast.success('Você já ativou este cupom!');
        return;
      }
      console.error('Erro ao ativar cupom:', error);
      toast.error('Ocorreu um erro ao ativar o cupom.');
    } finally {
      setAtivandoCupom(null);
    }
  };

  const copiarCupom = async (cupom: any) => {
    try {
      if (copyToClipboard) {
        await copyToClipboard(cupom.codigo_cupom);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = cupom.codigo_cupom;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedCupomId(cupom.id);
      toast.success('Código copiado!');
      setTimeout(() => setCopiedCupomId(null), 2000);
    } catch {
      toast.error('Não foi possível copiar o código.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Meus Cupons da Loja" size="wide">
      <div className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : cupons.length > 0 ? (
          <div className="space-y-6">
            <div className="flex p-1 bg-neutral-100 rounded-2xl gap-1">
              {([{ key: 'ativos', label: 'Disponíveis' }, { key: 'usados', label: 'Usados' }] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setCuponsTab(tab.key)}
                  className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
                    cuponsTab === tab.key
                      ? 'bg-white text-pink-600 shadow-sm ring-1 ring-black/5'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
              {(() => {
                const filteredCupons = cupons
                  .filter(c => cuponsTab === 'ativos' ? c.status_local === 'ativo' : c.status_local === 'usado' || c.status_local === 'expirado' || c.status_local === 'esgotado')
                  .sort((a, b) => {
                    const aAtivado = cuponsAtivados.has(a.id);
                    const bAtivado = cuponsAtivados.has(b.id);
                    if (aAtivado && !bAtivado) return -1;
                    if (!aAtivado && bAtivado) return 1;
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                  });

                if (filteredCupons.length === 0) {
                  return (
                    <div className="col-span-full text-center py-12">
                      <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Ticket className="w-10 h-10 text-neutral-200" />
                      </div>
                      <p className="text-sm text-neutral-500 font-bold uppercase tracking-widest">
                        {cuponsTab === 'ativos' ? 'No momento não há cupons disponíveis' : 'Nenhum cupom foi usado ainda'}
                      </p>
                      {cuponsTab === 'ativos' && <p className="text-xs text-neutral-400 mt-2 font-medium">Fique atento às nossas promoções!</p>}
                    </div>
                  );
                }

                return filteredCupons.map((cupom) => {
                  const isAtivado = cuponsAtivados.has(cupom.id);
                  const isAtivando = ativandoCupom === cupom.id;
                  const isUsado = cupom.status_local === 'usado';
                  const isExpirado = cupom.status_local === 'expirado';

                  return (
                    <div key={cupom.id} className={`relative group overflow-hidden rounded-2xl border p-6 transition-all ${
                      isUsado || isExpirado ? 'bg-neutral-100 border-neutral-200 opacity-75' :
                      isAtivado
                        ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
                        : 'bg-neutral-50 border-neutral-200 hover:border-indigo-300'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm font-black ${
                          isUsado || isExpirado ? 'bg-neutral-200 text-neutral-400' :
                          isAtivado ? 'bg-emerald-600 text-white' : 'bg-white text-indigo-600'
                        }`}>
                          <Ticket className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-lg font-black text-[#1a1a1a]">{cupom.nome_cupom}</h4>
                            {isUsado ? (
                              <span className="text-[10px] font-black text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Usado
                              </span>
                            ) : isExpirado ? (
                              <span className="text-[10px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Expirado
                              </span>
                            ) : isAtivado ? (
                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Ativado
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1 mt-1">
                            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
                              {cupom.categoria_cupom === 'entrega' ? (
                                cupom.tipo_entrega === 'frete_gratis' ? 'Frete Grátis' :
                                cupom.tipo_entrega === 'frete_gratis_minimo' ? 'Frete Grátis' :
                                `Frete Fixo: ${formatCurrency(cupom.taxa_fixa_entrega || 0)}`
                              ) : (
                                cupom.tipo_desconto === 'porcentagem' ? `${cupom.valor_desconto}% OFF` : formatCurrency(cupom.valor_desconto || 0)
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex items-center justify-between gap-2">
                        <button
                          disabled={isUsado || isExpirado}
                          onClick={(e) => {
                            e.stopPropagation();
                            copiarCupom(cupom);
                          }}
                          title="Clique para copiar"
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-mono text-sm font-bold transition-all ${
                            isUsado || isExpirado ? 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed opacity-50' :
                            copiedCupomId === cupom.id
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                              : 'bg-white border-neutral-200 text-neutral-800 hover:border-indigo-300 hover:bg-indigo-50 active:scale-95'
                          }`}
                        >
                          {copiedCupomId === cupom.id ? (
                            <><CheckCircle className="w-4 h-4 text-emerald-600" /> Copiado!</>
                          ) : (
                            <><Copy className="w-4 h-4 text-neutral-400" /> {cupom.codigo_cupom}</>
                          )}
                        </button>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase">
                            {cupom.data_validade ? `Válido até: ${formatDate(cupom.data_validade)}` : 'Sem validade'}
                          </span>
                          <span className="text-[10px] font-semibold text-indigo-600">
                            {cupom.limite_cliente > 1 ? `Seus usos: ${cupom.cliente_usos || 0} de ${cupom.limite_cliente}` : `Limite: ${cupom.limite_cliente} uso por conta`}
                          </span>
                        </div>
                      </div>

                      {cuponsTab === 'ativos' && !isAtivado && !isUsado && !isExpirado && (
                        <button
                          onClick={() => ativarCupom(cupom.id)}
                          disabled={isAtivando}
                          className="mt-4 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                          {isAtivando ? (
                            <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Ativando...</>
                          ) : (
                            <><Ticket className="w-4 h-4" /> Ativar Cupom</>
                          )}
                        </button>
                      )}
                      {isAtivado && cuponsTab === 'ativos' && !isUsado && !isExpirado && (
                        <div className="mt-4 w-full py-2.5 rounded-xl bg-emerald-100 text-emerald-700 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4" /> Pronto para usar no checkout
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Ticket className="w-10 h-10 text-neutral-300" />
            </div>
            <h3 className="text-xl font-black text-neutral-800 mb-2">Nenhum cupom encontrado</h3>
            <p className="text-neutral-500 font-medium">Você ainda não possui cupons cadastrados.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
