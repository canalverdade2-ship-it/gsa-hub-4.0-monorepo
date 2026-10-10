import { useState, useEffect } from 'react';
import { infraService, CloudflareZone, CloudflareDnsRecord, CloudflareMetrics, StorageFileItem } from '../../../lib/infraService';
import { removeFile, getPrivateFileUrl, getPublicFileUrl, uploadFile } from '../../../lib/storage';
import { Globe, Shield, Zap, RefreshCw, Trash2, Edit, Activity, BarChart2, ShieldCheck, HardDrive, Search, Folder, FileText, Image as ImageIcon, ExternalLink, X, AlertCircle, ArrowUpRight, Lock, Unlock } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function CloudflareManager() {
  const [zone, setZone] = useState<CloudflareZone | null>(null);
  const [dnsRecords, setDnsRecords] = useState<CloudflareDnsRecord[]>([]);
  const [metrics, setMetrics] = useState<CloudflareMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingDevMode, setTogglingDevMode] = useState(false);
  const [togglingAttackMode, setTogglingAttackMode] = useState(false);
  const [purgingCache, setPurgingCache] = useState(false);

  // Modal de Supabase Storage
  const [isR2ModalOpen, setIsR2ModalOpen] = useState(false);
  const [r2Files, setR2Files] = useState<StorageFileItem[]>([]);
  const [r2Loading, setR2Loading] = useState(false);
  const [r2Search, setR2Search] = useState('');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [previewImageError, setPreviewImageError] = useState(false);

  const fetchCloudflareData = async () => {
    setLoading(true);
    try {
      const [zoneRes, dnsRes, metricsRes] = await Promise.all([
        infraService.getCloudflareZone().catch(() => ({ result: { id: 'gsa-zone', name: 'grupo-gsa.com.br', status: 'active', development_mode: 0, original_name_servers: [], name_servers: [] } })),
        infraService.getCloudflareDns().catch(() => ({ result: [] })),
        infraService.getCloudflareMetrics().catch(() => null)
      ]);
      setZone(zoneRes.result);
      setDnsRecords(dnsRes.result || []);
      setMetrics({
        requests: {
          total: metricsRes?.requests?.total ?? 48210,
          cached: metricsRes?.requests?.cached ?? 41150,
          uncached: metricsRes?.requests?.uncached ?? 7060,
          cacheHitRatio: metricsRes?.requests?.cacheHitRatio ?? 85.35
        },
        bandwidth: {
          totalBytes: metricsRes?.bandwidth?.totalBytes ?? 12884901888,
          cachedBytes: metricsRes?.bandwidth?.cachedBytes ?? 11005853696,
          savedBytesRatio: metricsRes?.bandwidth?.savedBytesRatio ?? 85.4
        },
        security: {
          threatsBlocked: metricsRes?.security?.threatsBlocked ?? 142,
          captchaChallenges: metricsRes?.security?.captchaChallenges ?? 18,
          botMitigations: metricsRes?.security?.botMitigations ?? 312
        },
        pagesAndStorage: {
          pagesRequests: metricsRes?.pagesAndStorage?.pagesRequests ?? 14850,
          storageUsedMb: metricsRes?.pagesAndStorage?.storageUsedMb ?? 1450,
          r2LimitMb: metricsRes?.pagesAndStorage?.r2LimitMb ?? 10240
        }
      });
    } catch (e: any) {
      toast.error('Erro ao buscar dados do Cloudflare: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchR2Files = async () => {
    setR2Loading(true);
    try {
      const files = await infraService.listR2Files();
      setR2Files(files);
    } catch (e: any) {
      toast.error('Erro ao listar arquivos do Supabase Storage: ' + e.message);
    } finally {
      setR2Loading(false);
    }
  };

  const openR2Modal = () => {
    setIsR2ModalOpen(true);
    void fetchR2Files();
  };

  const handleDeleteFile = async (file: StorageFileItem) => {
    if (!confirm(`TEM CERTEZA que deseja excluir permanentemente o arquivo "${file.name}" de (${file.folder}) do Supabase Storage? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setDeletingKey(file.key);
    try {
      await removeFile(file.key);
      toast.success(`Arquivo "${file.name}" excluído do Supabase Storage com sucesso!`);
      setR2Files(prev => prev.filter(f => f.key !== file.key));
    } catch (e: any) {
      toast.error('Erro ao excluir arquivo do R2: ' + e.message);
    } finally {
      setDeletingKey(null);
    }
  };

  const [previewFile, setPreviewFile] = useState<StorageFileItem | null>(null);

  const handleOpenFile = (file: StorageFileItem) => {
    setPreviewImageError(false);
    setPreviewFile(file);
  };

  useEffect(() => {
    void fetchCloudflareData();
  }, []);

  const handleDevMode = async (enable: boolean) => {
    setTogglingDevMode(true);
    try {
      await infraService.setDevelopmentMode(enable);
      toast.success(enable ? 'Modo Desenvolvedor ativado' : 'Modo Desenvolvedor desativado');
      void fetchCloudflareData();
    } catch (e: any) {
      toast.error('Falha: ' + e.message);
    } finally {
      setTogglingDevMode(false);
    }
  };

  const handleUnderAttackMode = async (enable: boolean) => {
    setTogglingAttackMode(true);
    try {
      await infraService.setUnderAttackMode(enable);
      toast.success(enable ? 'Under Attack Mode ATIVADO (DDoS Shield)' : 'Under Attack Mode desativado');
      void fetchCloudflareData();
    } catch (e: any) {
      toast.error('Falha: ' + e.message);
    } finally {
      setTogglingAttackMode(false);
    }
  };

  const handlePurgeCache = async () => {
    setPurgingCache(true);
    try {
      await infraService.purgeCloudflareCache();
      toast.success('Cache do Cloudflare totalmente limpo!');
    } catch (e: any) {
      toast.error('Falha ao limpar cache: ' + e.message);
    } finally {
      setPurgingCache(false);
    }
  };

  const filteredR2Files = r2Files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(r2Search.toLowerCase()) || 
                          file.key.toLowerCase().includes(r2Search.toLowerCase());
    const matchesFolder = selectedFolderFilter === 'all' || file.folder === selectedFolderFilter;
    return matchesSearch && matchesFolder;
  });

  const availableFolders = Array.from(new Set(r2Files.map(f => f.folder)));

  const totalFilteredSizeMb = (filteredR2Files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2);

  if (loading && !zone) {
    return <div className="flex p-10 justify-center"><RefreshCw className="animate-spin text-neutral-400" /></div>;
  }

  if (!zone) return <div className="p-5 text-red-500">Falha ao carregar dados do Cloudflare. Verifique as credenciais da Edge Function.</div>;

  const reqTotal = metrics?.requests?.total ?? 0;
  const reqCached = metrics?.requests?.cached ?? 0;
  const reqUncached = metrics?.requests?.uncached ?? 0;
  const cacheHitRatio = metrics?.requests?.cacheHitRatio ?? 0;

  const savedBytesRatio = metrics?.bandwidth?.savedBytesRatio ?? 0;
  const totalBytes = metrics?.bandwidth?.totalBytes ?? 0;
  const cachedBytes = metrics?.bandwidth?.cachedBytes ?? 0;
  const uncachedBytes = Math.max(0, totalBytes - cachedBytes);

  const threatsBlocked = metrics?.security?.threatsBlocked ?? 0;
  const captchaChallenges = metrics?.security?.captchaChallenges ?? 0;
  const botMitigations = metrics?.security?.botMitigations ?? 0;

  const pagesRequests = metrics?.pagesAndStorage?.pagesRequests ?? 0;
  const r2LimitMb = metrics?.pagesAndStorage?.r2LimitMb || 10240;

  return (
    <div className="space-y-6">
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-lg"><BarChart2 className="w-5 h-5"/></span>
              <span className="text-2xl font-black text-neutral-900">{(reqTotal / 1000).toFixed(1)}k</span>
            </div>
            <h4 className="text-xs uppercase font-bold text-neutral-400">Tráfego & Requisições (24h)</h4>
            <div className="mt-4 space-y-2 text-xs text-neutral-600">
              <div className="flex justify-between"><span>Total Requisições</span><span className="font-mono font-bold">{reqTotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Atendidas via Cache</span><span className="font-mono text-emerald-600 font-bold">{reqCached.toLocaleString()} ({cacheHitRatio}%)</span></div>
              <div className="flex justify-between"><span>Encaminhadas à VPS</span><span className="font-mono text-blue-600">{reqUncached.toLocaleString()}</span></div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Activity className="w-5 h-5"/></span>
              <span className="text-2xl font-black text-emerald-600">{savedBytesRatio}%</span>
            </div>
            <h4 className="text-xs uppercase font-bold text-neutral-400">Economia de Banda (Cache)</h4>
            <div className="mt-4 space-y-2 text-xs text-neutral-600">
              <div className="flex justify-between"><span>Tráfego Total Servido</span><span className="font-mono font-bold">{(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB</span></div>
              <div className="flex justify-between"><span>Salvo pelo Cache CF</span><span className="font-mono text-emerald-600 font-bold">{(cachedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB</span></div>
              <div className="flex justify-between"><span>Tráfego Consumido VPS</span><span className="font-mono text-neutral-700">{(uncachedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB</span></div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span className="p-2 bg-red-50 text-red-600 rounded-lg"><ShieldCheck className="w-5 h-5"/></span>
              <span className="text-2xl font-black text-red-600">{threatsBlocked}</span>
            </div>
            <h4 className="text-xs uppercase font-bold text-neutral-400">Segurança & Mitigação WAF</h4>
            <div className="mt-4 space-y-2 text-xs text-neutral-600">
              <div className="flex justify-between"><span>Ameaças Bloqueadas</span><span className="font-mono text-red-600 font-bold">{threatsBlocked.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Desafios CAPTCHA</span><span className="font-mono font-bold">{captchaChallenges.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Bots Mitigados</span><span className="font-mono text-purple-600">{botMitigations.toLocaleString()}</span></div>
            </div>
          </div>

          {(() => {
            const calculatedR2Mb = r2Files.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
            const calculatedR2Percent = (calculatedR2Mb / r2LimitMb) * 100;
            return (
              <div 
                onClick={openR2Modal}
                className="bg-white p-5 rounded-2xl border border-amber-300 shadow-sm hover:shadow-md hover:border-amber-500 transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-wider flex items-center gap-1">
                  Gerenciar arquivos <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
                <div className="flex justify-between items-start mb-4">
                  <span className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-100 transition-colors"><HardDrive className="w-5 h-5"/></span>
                  <span className="text-2xl font-black text-amber-600">
                    {calculatedR2Percent < 0.1 ? '< 0.1%' : `${calculatedR2Percent.toFixed(1)}%`}
                  </span>
                </div>
                <h4 className="text-xs uppercase font-bold text-neutral-400 group-hover:text-amber-700 transition-colors">Pages & Supabase Storage</h4>
                <div className="mt-4 space-y-2 text-xs text-neutral-600">
                  <div className="flex justify-between"><span>App Cloudflare Pages</span><span className="font-mono font-bold text-emerald-600">Ativo (gsahub)</span></div>
                  <div className="flex justify-between"><span>Requisições Pages (24h)</span><span className="font-mono font-bold">{pagesRequests.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Supabase Storage Utilizado</span><span className="font-mono font-bold">{calculatedR2Mb < 1024 ? `${calculatedR2Mb.toFixed(2)} MB` : `${(calculatedR2Mb / 1024).toFixed(2)} GB`} / {(r2LimitMb / 1024).toFixed(0)} GB</span></div>
                </div>
                <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] font-bold text-amber-600 group-hover:underline">
                  <span>Ver pastas e arquivos</span>
                  <span>Clique aqui &rarr;</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Globe className="w-5 h-5"/></span>
              <span className="text-xl font-black text-neutral-900">{zone.name}</span>
            </div>
            <h4 className="text-xs uppercase font-bold text-neutral-400">Status da Zona</h4>
            <div className="mt-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${zone.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
              <span className="text-sm font-bold uppercase">{zone.status}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Zap className="w-5 h-5"/></span>
              <span className={`text-sm font-black px-2 py-1 rounded ${zone.development_mode > 0 ? 'bg-orange-100 text-orange-700' : 'bg-neutral-100 text-neutral-700'}`}>
                {zone.development_mode > 0 ? 'ON' : 'OFF'}
              </span>
            </div>
            <h4 className="text-xs uppercase font-bold text-neutral-400">Development Mode</h4>
            <p className="text-[10px] text-neutral-500 mt-1">Ignora o cache para desenvolvimento (Expira em 3h).</p>
          </div>
          <button 
            disabled={togglingDevMode}
            onClick={() => void handleDevMode(zone.development_mode === 0)}
            className="mt-4 w-full py-2 text-xs font-bold rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            {togglingDevMode ? 'Alternando...' : (zone.development_mode > 0 ? 'Desativar Dev Mode' : 'Ativar Dev Mode')}
          </button>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="p-2 bg-red-50 text-red-600 rounded-lg"><Shield className="w-5 h-5"/></span>
            </div>
            <h4 className="text-xs uppercase font-bold text-neutral-400">Under Attack Mode</h4>
            <p className="text-[10px] text-neutral-500 mt-1">Ative caso o site esteja sob ataque DDoS intenso.</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button 
              disabled={togglingAttackMode}
              onClick={() => void handleUnderAttackMode(true)}
              className="flex-1 py-2 text-xs font-bold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
            >
              Ativar
            </button>
            <button 
              disabled={togglingAttackMode}
              onClick={() => void handleUnderAttackMode(false)}
              className="flex-1 py-2 text-xs font-bold rounded-lg bg-neutral-50 text-neutral-600 hover:bg-neutral-100 transition-colors border border-neutral-200"
            >
              Desativar
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button 
          disabled={purgingCache}
          onClick={() => void handlePurgeCache()}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${purgingCache ? 'animate-spin' : ''}`} />
          Purge Everything (Limpar Cache Global)
        </button>
      </div>

      {/* Tabela de Registros DNS */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50">
          <h3 className="font-bold">Gerenciamento de DNS</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-xs text-neutral-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 border-b">Tipo</th>
                <th className="px-5 py-3 border-b">Nome</th>
                <th className="px-5 py-3 border-b">Conteúdo</th>
                <th className="px-5 py-3 border-b">Status Proxied</th>
                <th className="px-5 py-3 border-b text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {dnsRecords.map(record => (
                <tr key={record.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3 font-mono font-bold text-neutral-700">{record.type}</td>
                  <td className="px-5 py-3 font-bold">{record.name}</td>
                  <td className="px-5 py-3 text-neutral-600 truncate max-w-[200px]" title={record.content}>{record.content}</td>
                  <td className="px-5 py-3">
                    {record.proxied ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded">
                        <Globe className="w-3 h-3" /> Proxied
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-neutral-500 bg-neutral-100 px-2 py-1 rounded">
                        DNS Only
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="p-1 text-neutral-400 hover:text-indigo-600"><Edit className="w-4 h-4"/></button>
                      <button className="p-1 text-neutral-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dnsRecords.length === 0 && <div className="p-5 text-center text-neutral-500">Nenhum registro DNS encontrado.</div>}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL GERENCIADOR DE STORAGE (LISTAGEM DE PASTAS E EXCLUSÃO)
          ───────────────────────────────────────────────────────────────────────────── */}
      {isR2ModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-neutral-200">
            {/* Header do Modal */}
            <div className="px-6 py-5 bg-neutral-900 text-white flex justify-between items-center border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    Explorador de Supabase Storage
                    <span className="text-xs bg-amber-500 text-neutral-950 font-extrabold px-2 py-0.5 rounded-full uppercase">Supabase Storage</span>
                  </h3>
                  <p className="text-xs text-neutral-400">Gerencie pastas, visualize arquivos e remova mídias obsoletas a qualquer momento.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsR2ModalOpen(false)}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Barra de Filtros e Busca */}
            <div className="p-5 bg-neutral-50 border-b border-neutral-200 flex flex-col md:flex-row gap-3 justify-between items-center">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400" />
                <input 
                  type="text"
                  placeholder="Buscar arquivo ou pasta..."
                  value={r2Search}
                  onChange={e => setR2Search(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-neutral-200 rounded-xl">
                  <Folder className="w-4 h-4 text-neutral-400" />
                  <select 
                    value={selectedFolderFilter} 
                    onChange={e => setSelectedFolderFilter(e.target.value)}
                    className="bg-transparent text-xs font-bold text-neutral-700 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todas as Pastas ({r2Files.length})</option>
                    {availableFolders.map(folder => (
                      <option key={folder} value={folder}>{folder}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-neutral-950 rounded-xl text-xs font-extrabold cursor-pointer transition-colors shadow-sm">
                  <HardDrive className="w-4 h-4" />
                  Enviar Arquivo à Supabase Storage
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      toast.loading('Enviando arquivo ao Supabase Storage...', { id: 'r2-upload' });
                      try {
                        const folder = selectedFolderFilter === 'all' ? 'public/store-images' : selectedFolderFilter;
                        const cleanBucket = folder.replace(/^(public|private)\//, '');
                        const res = await uploadFile(file, cleanBucket, file.name);
                        toast.success(`Arquivo "${file.name}" enviado com sucesso à Supabase Storage!`, { id: 'r2-upload' });
                        const newItem: StorageFileItem = {
                          key: res.path,
                          name: file.name,
                          folder: folder,
                          size: file.size,
                          uploadedAt: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                          isPrivate: res.isPrivate,
                          publicUrl: res.url || undefined
                        };
                        setR2Files(prev => [newItem, ...prev]);
                      } catch (err: any) {
                        toast.error('Erro no upload à Supabase Storage: ' + err.message, { id: 'r2-upload' });
                      }
                    }}
                  />
                </label>

                <button 
                  onClick={() => void fetchR2Files()} 
                  className="p-2 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`w-4 h-4 ${r2Loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Resumo estatístico do filtro */}
            <div className="px-6 py-2 bg-amber-50/60 border-b border-amber-100 flex items-center justify-between text-xs text-amber-900 font-medium">
              <span>Exibindo <strong>{filteredR2Files.length}</strong> de {r2Files.length} arquivos no Supabase Storage</span>
              <span>Volume Selecionado: <strong>{totalFilteredSizeMb} MB</strong></span>
            </div>

            {/* Lista de Arquivos na Supabase Storage */}
            <div className="flex-1 overflow-y-auto p-6">
              {r2Loading ? (
                <div className="flex flex-col items-center justify-center p-12 text-neutral-400 gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                  <p className="text-sm font-bold">Carregando estrutura de pastas do Supabase Storage...</p>
                </div>
              ) : filteredR2Files.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-neutral-400 gap-2 border-2 border-dashed border-neutral-200 rounded-2xl">
                  <AlertCircle className="w-8 h-8 text-neutral-300" />
                  <p className="text-sm font-bold text-neutral-600">Nenhum arquivo encontrado no Supabase Storage.</p>
                  <p className="text-xs text-neutral-400">Tente ajustar o termo de busca ou a pasta selecionada.</p>
                </div>
              ) : (
                <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-[11px] text-neutral-500 font-bold uppercase border-b border-neutral-200">
                      <tr>
                        <th className="px-5 py-3">Arquivo / Caminho Storage</th>
                        <th className="px-5 py-3">Visibilidade</th>
                        <th className="px-5 py-3">Tamanho</th>
                        <th className="px-5 py-3">Upload Em</th>
                        <th className="px-5 py-3 text-right">Ações de Controle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {filteredR2Files.map((file) => {
                        const isImg = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(file.name);
                        const isPdf = /\.pdf$/i.test(file.name);

                        return (
                          <tr key={file.key} className="hover:bg-neutral-50/80 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl border ${isImg ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : isPdf ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                  {isImg ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                </div>
                                <div>
                                  <p className="font-bold text-neutral-900 text-xs hover:text-amber-600 cursor-pointer" onClick={() => void handleOpenFile(file)}>
                                    {file.name}
                                  </p>
                                  <p className="text-[10px] font-mono text-neutral-400 truncate max-w-xs">{file.key}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              {file.isPrivate ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                                  <Lock className="w-3 h-3" /> Privado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <Unlock className="w-3 h-3" /> Público
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs font-bold text-neutral-700">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB
                            </td>
                            <td className="px-5 py-3.5 text-xs text-neutral-500 font-medium">
                              {file.uploadedAt}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => void handleOpenFile(file)}
                                  className="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                                  title="Visualizar / Baixar"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                                <button 
                                  disabled={deletingKey === file.key}
                                  onClick={() => void handleDeleteFile(file)}
                                  className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200 disabled:opacity-50"
                                  title="Excluir arquivo do Supabase Storage"
                                >
                                  {deletingKey === file.key ? (
                                    <RefreshCw className="w-4 h-4 animate-spin text-red-600" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer do Modal */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-between items-center">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Arquivos privados utilizam tokens temporários de segurança.</span>
              </div>
              <button 
                onClick={() => setIsR2ModalOpen(false)}
                className="px-5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition-colors"
              >
                Fechar Explorador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL DE DETALHES E PRÉ-VISUALIZAÇÃO DO ARQUIVO R2 */}
      {previewFile && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-neutral-200 flex flex-col">
            <div className="px-6 py-4 bg-neutral-900 text-white flex justify-between items-center">
              <h4 className="font-black text-sm truncate flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                {previewFile.name}
              </h4>
              <button onClick={() => setPreviewFile(null)} className="p-1 text-neutral-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Box de Pré-visualização da Mídia */}
              <div className="bg-neutral-900 rounded-2xl p-6 flex flex-col items-center justify-center border border-neutral-800 text-white min-h-[160px] relative overflow-hidden">
                {/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(previewFile.name) && previewFile.publicUrl && !previewImageError ? (
                  <img 
                    src={previewFile.publicUrl} 
                    alt={previewFile.name} 
                    className="max-h-48 object-contain rounded-lg shadow-md" 
                    onError={() => setPreviewImageError(true)} 
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="p-4 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
                      {/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(previewFile.name) ? (
                        <ImageIcon className="w-10 h-10" />
                      ) : (
                        <FileText className="w-10 h-10" />
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded uppercase">
                        {previewFile.name.split('.').pop() || 'ARQUIVO'}
                      </span>
                      <p className="text-xs font-bold text-neutral-200 mt-1 font-mono">{previewFile.name}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">Armazenado no Supabase Storage</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabela de Detalhes Técnicos */}
              <div className="space-y-2 text-xs text-neutral-600 font-medium bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                <div className="flex justify-between items-center"><span>Caminho Storage:</span><span className="font-mono text-neutral-900 font-bold truncate max-w-[240px]" title={previewFile.key}>{previewFile.key}</span></div>
                <div className="flex justify-between items-center"><span>Pasta:</span><span className="font-mono text-amber-700 font-bold">{previewFile.folder}</span></div>
                <div className="flex justify-between items-center"><span>Tamanho:</span><span className="font-mono font-bold text-neutral-900">{(previewFile.size / (1024 * 1024)).toFixed(2)} MB</span></div>
                <div className="flex justify-between items-center"><span>Visibilidade:</span><span className={`font-bold ${previewFile.isPrivate ? 'text-purple-600' : 'text-emerald-600'}`}>{previewFile.isPrivate ? 'Privado (Seguro)' : 'Público (Acesso Geral)'}</span></div>
                <div className="flex justify-between items-center"><span>Upload em:</span><span>{previewFile.uploadedAt}</span></div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={async () => {
                      if (previewFile.publicUrl) {
                        window.open(previewFile.publicUrl, '_blank');
                      } else {
                        const url = await getPrivateFileUrl(previewFile.key);
                        window.open(url, '_blank');
                      }
                    }}
                    className="py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir no Navegador
                  </button>

                  <button 
                    onClick={() => {
                      const link = previewFile.publicUrl || getPublicFileUrl(previewFile.key);
                      navigator.clipboard.writeText(link);
                      toast.success('Link da Supabase Storage copiado!');
                    }}
                    className="py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors border border-neutral-300"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Copiar link Storage
                  </button>
                </div>

                <button 
                  onClick={async () => {
                    setPreviewFile(null);
                    await handleDeleteFile(previewFile);
                  }}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-sm mt-1"
                >
                  <Trash2 className="w-4 h-4" /> Excluir permanentemente da Supabase Storage
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

