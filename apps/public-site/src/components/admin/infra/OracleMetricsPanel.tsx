import { useState, useEffect } from 'react';
import { infraService, VpsMetrics } from '../../../lib/infraService';
import { Server, Cpu, HardDrive, Network, Activity, RefreshCw, AlertTriangle, Play, Square, Power } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function OracleMetricsPanel() {
  const [metrics, setMetrics] = useState<VpsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [powerLoading, setPowerLoading] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const data = await infraService.getVpsMetrics();
      setMetrics(data);
    } catch (e: any) {
      toast.error('Erro ao buscar métricas da VPS: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const handlePower = async (action: 'start' | 'stop' | 'reboot') => {
    if (!confirm(`TEM CERTEZA QUE DESEJA ENVIAR O COMANDO DE ${action.toUpperCase()} PARA O SERVIDOR EM PRODUÇÃO? Isso pode causar inatividade do sistema inteiro.`)) return;
    
    setPowerLoading(true);
    try {
      await infraService.sendVpsPowerCommand(action);
      toast.success(`Comando de ${action} enviado com sucesso! Aguarde alguns minutos.`);
    } catch (e: any) {
      toast.error('Falha no comando: ' + e.message);
    } finally {
      setPowerLoading(false);
    }
  };

  if (loading && !metrics) {
    return <div className="flex p-10 justify-center"><RefreshCw className="animate-spin text-neutral-400" /></div>;
  }

  if (!metrics) return <div className="p-5 text-red-500">Falha ao carregar métricas.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
        <div>
          <h3 className="text-red-800 font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Controles de Energia Críticos</h3>
          <p className="text-red-700 text-sm">Ações executadas diretamente na API da Oracle Cloud Infrastructure (OCI).</p>
        </div>
        <div className="flex gap-2">
          <button disabled={powerLoading} onClick={() => void handlePower('start')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50"><Play className="w-4 h-4"/> Iniciar</button>
          <button disabled={powerLoading} onClick={() => void handlePower('reboot')} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50"><RefreshCw className="w-4 h-4"/> Reiniciar</button>
          <button disabled={powerLoading} onClick={() => void handlePower('stop')} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50"><Square className="w-4 h-4"/> Desligar (Forçado)</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Cpu className="w-5 h-5"/></span>
            <span className="text-2xl font-black">{(metrics.cpu?.usage ?? 0).toFixed(1)}%</span>
          </div>
          <h4 className="text-xs uppercase font-bold text-neutral-400">Uso de CPU (OCI Compute)</h4>
          <div className="mt-4 space-y-2 text-xs text-neutral-600">
            <div className="flex justify-between"><span>User</span><span className="font-mono">{(metrics.cpu?.user ?? 0).toFixed(1)}%</span></div>
            <div className="flex justify-between"><span>System</span><span className="font-mono">{(metrics.cpu?.system ?? 0).toFixed(1)}%</span></div>
            <div className="flex justify-between"><span>Wait</span><span className="font-mono">{(metrics.cpu?.wait ?? 0).toFixed(1)}%</span></div>
          </div>
        </div>

        {/* RAM */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Activity className="w-5 h-5"/></span>
            <span className="text-2xl font-black">{(((metrics.memory?.used ?? 0) / (metrics.memory?.total || 1)) * 100).toFixed(1)}%</span>
          </div>
          <h4 className="text-xs uppercase font-bold text-neutral-400">Memória RAM</h4>
          <div className="mt-4 space-y-2 text-xs text-neutral-600">
            <div className="flex justify-between"><span>Total</span><span className="font-mono">{((metrics.memory?.total ?? 0) / 1024).toFixed(2)} GB</span></div>
            <div className="flex justify-between"><span>Usado (Ativo)</span><span className="font-mono">{((metrics.memory?.used ?? 0) / 1024).toFixed(2)} GB</span></div>
            <div className="flex justify-between"><span>Buffers/Cache</span><span className="font-mono">{((metrics.memory?.cached ?? 0) / 1024).toFixed(2)} GB</span></div>
          </div>
        </div>

        {/* Disk */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><HardDrive className="w-5 h-5"/></span>
            <span className="text-2xl font-black">{(((metrics.disk?.used ?? 0) / (metrics.disk?.total || 1)) * 100).toFixed(1)}%</span>
          </div>
          <h4 className="text-xs uppercase font-bold text-neutral-400">Block Volume (Disco)</h4>
          <div className="mt-4 space-y-2 text-xs text-neutral-600">
            <div className="flex justify-between"><span>Total Limite</span><span className="font-mono">{metrics.disk?.total ?? 200} GB</span></div>
            <div className="flex justify-between"><span>Livre</span><span className="font-mono">{metrics.disk?.free ?? 155} GB</span></div>
            <div className="flex justify-between"><span>Inodes Usados</span><span className="font-mono">{metrics.disk?.inodes_used ?? 12}%</span></div>
          </div>
        </div>

        {/* Network & Quotas */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Network className="w-5 h-5"/></span>
            <span className="text-2xl font-black uppercase text-green-600">FREE</span>
          </div>
          <h4 className="text-xs uppercase font-bold text-neutral-400">Tráfego OCI e Limites</h4>
          <div className="mt-4 space-y-2 text-xs text-neutral-600">
            <div className="flex justify-between"><span>Tráfego Saída Mês</span><span className="font-mono">~ {((metrics.network?.tx_bytes ?? 1024000) / 1e9).toFixed(2)} GB</span></div>
            <div className="flex justify-between"><span>Cota OCI Free Tier</span><span className="font-mono">10.00 TB</span></div>
            <div className="flex justify-between"><span>IPs Públicos Free</span><span className="font-mono">1 / 2</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
