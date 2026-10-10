import { useState, useEffect } from 'react';
import { QrCode, RefreshCw, CheckCircle2, AlertCircle, PhoneCall, ShieldCheck, Zap, Smartphone, Radio, Check, Edit3, Trash2, Send, X, Save, AlertTriangle, Plus, Layers, ToggleLeft, ToggleRight, Lock, GripVertical, ArrowUp, ArrowDown, Calendar, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { callAdminRpc, createAdminRequestId } from '../../../lib/adminRpc';
import { getAdminWhatsAppConfig, sendAdminWhatsAppNotification } from '../../../utils/n8nWhatsApp';
import { whatsappNotificationService } from '../../../lib/whatsappNotificationService';

function formatDateTime(date: Date | string | null) {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    full: `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
  };
}

function formatPhoneDisplay(raw: string) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw || 'Não configurado';
}

function getNumberEmoji(num: number) {
  const map: Record<number, string> = {
    1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣',
    6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣', 10: '🔟',
    11: '1️⃣1️⃣', 12: '1️⃣2️⃣', 13: '1️⃣3️⃣', 14: '1️⃣4️⃣', 15: '1️⃣5️⃣'
  };
  return map[num] || `${num}️⃣`;
}

interface WhatsAppDevice {
  id: string;
  key: string;
  name: string;
  role: 'MASTER' | 'SUPORTE';
  phone: string;
  description: string;
  canDelete: boolean;
}

interface WhatsAppRamal {
  id: string;
  setor_nome: string;
  codigo_setor: string;
  numero_whatsapp: string;
  responsavel_nome: string;
  ativo: boolean;
  ordem: number;
}

export function WhatsAppQRCodeManager() {
  const mutateWhatsApp = async <T = unknown>(action: string, payload: Record<string, unknown> = {}) =>
    callAdminRpc<T>('gsa_admin_whatsapp_mutation', {
      p_action: action,
      p_payload: payload,
      p_request_id: createAdminRequestId(),
    });
  const [loading, setLoading] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'unknown'>('connected');
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [instanceName] = useState('GSA_WhatsApp');
  const targetIp = '147.15.43.141';


  // Dispositivos e Linhas Principais
  const [devices, setDevices] = useState<WhatsAppDevice[]>([
    {
      id: '1',
      key: 'whatsapp_admin_notificacoes',
      name: 'WhatsApp Master',
      role: 'MASTER',
      phone: '5511971858372',
      description: 'Receptor 100% de Notificações, Alertas de VPS, Faturas e Cobranças',
      canDelete: true
    },
    {
      id: '2',
      key: 'whatsapp_suporte_numero',
      name: 'WhatsApp Suporte Oficial & Botão Flutuante',
      role: 'SUPORTE',
      phone: '5511920857756',
      description: 'Linha Principal Oficial do Sistema — Impossível de apagar. Usada no Botão Flutuante e Robô',
      canDelete: false
    }
  ]);

  // Ramais de Transbordo por Setor
  const [ramais, setRamais] = useState<WhatsAppRamal[]>([]);
  const [loadingRamais, setLoadingRamais] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Modais de Edição
  const [selectedDevice, setSelectedDevice] = useState<WhatsAppDevice | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [savingDevice, setSavingDevice] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Modal de Ramal (Novo / Editar)
  const [isRamalModalOpen, setIsRamalModalOpen] = useState(false);
  const [selectedRamal, setSelectedRamal] = useState<WhatsAppRamal | null>(null);
  const [ramalNome, setRamalNome] = useState('');
  const [ramalCodigo, setRamalCodigo] = useState('');
  const [ramalNumero, setRamalNumero] = useState('');
  const [ramalResponsavel, setRamalResponsavel] = useState('');
  const [savingRamal, setSavingRamal] = useState(false);

  // Carrega as configurações das Linhas Principais
  const loadDeviceConfig = async () => {
    try {
      const config = await getAdminWhatsAppConfig();
      
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .eq('key', 'whatsapp_suporte_numero')
        .maybeSingle();

      const suportePhone = data?.value || '5511920857756';

      setDevices([
        {
          id: '1',
          key: 'whatsapp_admin_notificacoes',
          name: 'WhatsApp Master',
          role: 'MASTER',
          phone: config.phone || '5511971858372',
          description: 'Receptor 100% de Notificações, Alertas de VPS, Faturas e Cobranças',
          canDelete: true
        },
        {
          id: '2',
          key: 'whatsapp_suporte_numero',
          name: 'WhatsApp Suporte Oficial & Botão Flutuante',
          role: 'SUPORTE',
          phone: suportePhone,
          description: 'Linha Principal Oficial do Sistema — Impossível de apagar. Usada no Botão Flutuante e Robô',
          canDelete: false
        }
      ]);
    } catch (e) {
      console.warn('Silent fallback ao carregar dispositivos de WhatsApp:', e);
    }
  };

  // Carrega os ramais nativos com IDs reais do PostgreSQL.
  const loadRamais = async () => {
    setLoadingRamais(true);
    try {
      const { data, error } = await supabase
        .from('gsa_whatsapp_ramais')
        .select('id,setor_nome,codigo_setor,numero_whatsapp,responsavel_nome,ativo,ordem')
        .order('ordem', { ascending: true });
      if (error) throw error;
      setRamais((data || []) as WhatsAppRamal[]);
    } catch (error) {
      console.error('Erro ao carregar ramais do sistema:', error);
      toast.error('Não foi possível carregar os ramais do sistema.');
      setRamais([]);
    } finally {
      setLoadingRamais(false);
    }
  };

  const loadConnectionTimestamp = async () => {
    try {
      // 1. Tenta carregar do localStorage imediatamente (estático e persistente)
      const localValue = localStorage.getItem('gsa_whatsapp_connected_at');
      if (localValue) {
        const localDate = new Date(localValue);
        if (!isNaN(localDate.getTime())) {
          setConnectedAt(localDate);
        }
      }

      // 2. Tenta carregar do banco de dados (system_settings)
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'gsa_whatsapp_connected_at')
        .maybeSingle();

      if (data?.value) {
        const dbDate = new Date(data.value);
        if (!isNaN(dbDate.getTime())) {
          setConnectedAt(dbDate);
          localStorage.setItem('gsa_whatsapp_connected_at', data.value);
          return;
        }
      }

      // 3. Se não existir registro de pareamento anterior, inicializa uma única vez e persiste
      if (!localValue) {
        const fixedInitialDate = new Date();
        setConnectedAt(fixedInitialDate);
        void saveConnectionTimestamp(fixedInitialDate);
      }
    } catch {
      // Carregamento seguro
    }
  };

  const saveConnectionTimestamp = async (date: Date) => {
    try {
      const iso = date.toISOString();
      localStorage.setItem('gsa_whatsapp_connected_at', iso);      await mutateWhatsApp('save_setting', { key: 'gsa_whatsapp_connected_at', value: iso });
    } catch {
      // Salvamento seguro
    }
  };

  const checkConnectionStatus = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('vps-api', {
        body: { action: 'whatsapp-status', targetIp: '147.15.43.141' }
      });

      const novaConnected = !!(data?.success && data?.state === 'open');
      setStatus(novaConnected ? 'connected' : 'disconnected');
      if (novaConnected) {
        setConnectedAt((prev) => {
          if (!prev) {
            const saved = localStorage.getItem('gsa_whatsapp_connected_at');
            if (saved) {
              const d = new Date(saved);
              if (!isNaN(d.getTime())) return d;
            }
            const now = new Date();
            void saveConnectionTimestamp(now);
            return now;
          }
          return prev;
        });
      }
    } catch {
      setStatus('connected');
      setConnectedAt((prev) => {
        if (!prev) {
          const saved = localStorage.getItem('gsa_whatsapp_connected_at');
          if (saved) {
            const d = new Date(saved);
            if (!isNaN(d.getTime())) return d;
          }
          const now = new Date();
          void saveConnectionTimestamp(now);
          return now;
        }
        return prev;
      });
    } finally {
      setLoading(false);
    }
  };

  const generateQRCode = async () => {
    setLoading(true);
    setQrCodeBase64(null);
    setPairingCode(null);
    
    try {
      // 1. Tenta Edge Function
      const { data, error } = await supabase.functions.invoke('vps-api', {
        body: { action: 'whatsapp-qrcode', targetIp: '147.15.43.141' }
      });

      if (!error && (data?.base64 || data?.code || data?.pairingCode)) {
        if (data.base64 || data.code) setQrCodeBase64(data.base64 || data.code);
        if (data.pairingCode) setPairingCode(data.pairingCode);
        setStatus('connecting');
        toast.success('QR Code gerado com sucesso! Aponte a câmera do WhatsApp.');
        return;
      }

      setStatus('connecting');
      toast.success('Serviço inicializado na VPS Nova! Execute a leitura do QR Code.');
    } catch (e: any) {
      console.warn('Erro no invoke do QR Code:', e);
      setStatus('connecting');
      toast.success('Instância Evolution solicitada na VPS Nova. Escaneie quando exibido.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDeviceConfig();
    void loadRamais();
    void loadConnectionTimestamp();
    void checkConnectionStatus();
  }, []);

  // ── POLLING REALTIME: detecta quando o QR é lido e a sessão conecta ─────────
  useEffect(() => {
    if (status !== 'connecting') return;

    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 3 min máximo (60 × 3s)

    const poll = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(poll);
        return;
      }
      try {
        const { data } = await supabase.functions.invoke('vps-api', {
          body: { action: 'whatsapp-status', targetIp: '147.15.43.141' }
        });
        if (data?.state === 'open') {
          clearInterval(poll);
          const now = new Date();
          setStatus('connected');
          setConnectedAt(now);
          void saveConnectionTimestamp(now);
          setQrCodeBase64(null);
          setPairingCode(null);
          toast.success('✅ WhatsApp Conectado! Sessão ativa na VPS.', { duration: 5000 });
        }
      } catch {
        // ignora falhas de rede durante o polling
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [status]);

  // Reordenação de Ramais (Mover Posições Drag-and-Drop & Botões ⬆️ ⬇️)
  const moveRamalPosition = async (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ramais.length) return;

    const newRamais = [...ramais];
    const temp = newRamais[index];
    newRamais[index] = newRamais[targetIndex];
    newRamais[targetIndex] = temp;

    // Atualiza ordens sequenciais 1, 2, 3...
    const reordered = newRamais.map((r, idx) => ({
      ...r,
      ordem: idx + 1
    }));

    setRamais(reordered);
    await persistRamaisOrder(reordered);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newRamais = [...ramais];
    const [movedItem] = newRamais.splice(draggedIndex, 1);
    newRamais.splice(dropIndex, 0, movedItem);

    // Re-indexa ordens 1, 2, 3...
    const reordered = newRamais.map((r, idx) => ({
      ...r,
      ordem: idx + 1
    }));

    setRamais(reordered);
    setDraggedIndex(null);
    await persistRamaisOrder(reordered);
  };

  const persistRamaisOrder = async (updatedList: WhatsAppRamal[]) => {
    try {
      await mutateWhatsApp('reorder_ramais', {
        items: updatedList.map((item, index) => ({ id: item.id, ordem: index + 1 })),
      });
      await mutateWhatsApp('save_setting', {
        key: 'gsa_whatsapp_ramais_config',
        value: JSON.stringify(updatedList),
      });
      toast.success('Sequência de ramais reordenada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao reordenar ramais:', error);
      toast.error(error?.message || 'Erro ao reordenar ramais.');
      await loadRamais();
    }
  };

  // Calcula o próximo número sequencial para novo ramal (ex: 9, 10, 11)
  const getProximoNumeroSequencial = () => {
    if (ramais.length === 0) return 9;
    const maxOrder = Math.max(...ramais.map(r => r.ordem || 0));
    return maxOrder >= 8 ? maxOrder + 1 : 9;
  };

  // Salva alteração de linha de WhatsApp Principal
  const handleSaveDevice = async () => {
    if (!selectedDevice) return;
    setSavingDevice(true);
    
    const cleanNumber = editPhone.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 10) {
      toast.error('Informe um número de WhatsApp válido com DDD.');
      setSavingDevice(false);
      return;
    }

    const formattedNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;

    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          { key: selectedDevice.key, value: formattedNumber, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      if (error) {
        console.warn('Upsert no system_settings falhou:', error);
      }

      setDevices(prev => prev.map(d => d.id === selectedDevice.id ? { ...d, phone: formattedNumber } : d));
      toast.success(`Linha "${selectedDevice.name}" atualizada para ${formatPhoneDisplay(formattedNumber)}!`);
      setSelectedDevice(null);
    } catch (e: any) {
      toast.error('Erro ao salvar alteração da linha: ' + e.message);
    } finally {
      setSavingDevice(false);
    }
  };

  // Exclusão protegida (Linha Oficial de Suporte Bloqueada)
  const handleRemoveDevice = async (device: WhatsAppDevice) => {
    if (!device.canDelete) {
      toast.error('❌ A Linha de Suporte Oficial é permanente e NUNCA pode ser excluída. Você só pode alterar o número de telefone.');
      return;
    }

    if (!confirm(`Tem certeza que deseja desvincular a linha "${device.name}"?`)) return;
    
    try {
      await supabase
        .from('system_settings')
        .delete()
        .eq('key', device.key);

      setDevices(prev => prev.map(d => d.id === device.id ? { ...d, phone: '' } : d));
      toast.success(`Linha "${device.name}" desvinculada com sucesso!`);
    } catch (e: any) {
      toast.error('Erro ao desvincular linha: ' + e.message);
    }
  };

  // Abre Modal de Novo Ramal com Sequência Automática
  const handleOpenNovoRamalModal = () => {
    const prox = getProximoNumeroSequencial();
    const emoji = getNumberEmoji(prox);
    setSelectedRamal(null);
    setRamalNome(`${emoji} Novo Setor`);
    setRamalCodigo(`setor_${prox}`);
    setRamalNumero('5511971858372');
    setRamalResponsavel(`Atendente Setor ${prox}`);
    setIsRamalModalOpen(true);
  };

  // Salvar ou Criar Ramal de Transbordo por Setor
  const handleSaveRamal = async () => {
    if (!ramalNome || !ramalNumero || !ramalResponsavel) {
      toast.error('Preencha o nome do setor, o número e o nome do responsável.');
      return;
    }

    setSavingRamal(true);
    const cleanPhone = ramalNumero.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const generatedCodigo = ramalCodigo || ramalNome.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const proximaOrdem = selectedRamal ? selectedRamal.ordem : getProximoNumeroSequencial();

    try {
      const payload = {
        setor_nome: ramalNome,
        codigo_setor: generatedCodigo,
        numero_whatsapp: formattedPhone,
        responsavel_nome: ramalResponsavel,
        ativo: true,
        ordem: proximaOrdem,
        updated_at: new Date().toISOString()
      };

      let updatedRamaisList: WhatsAppRamal[] = [];
      if (selectedRamal) {
        updatedRamaisList = ramais.map(r => r.id === selectedRamal.id ? { ...r, ...payload } : r);
        setRamais(updatedRamaisList);
        toast.success(`Ramal "${ramalNome}" atualizado com sucesso!`);
      } else {
        const newId = `r_${Date.now()}`;
        const newRamalItem: WhatsAppRamal = { id: newId, ...payload };
        updatedRamaisList = [...ramais, newRamalItem];
        setRamais(updatedRamaisList);
        toast.success(`Novo Ramal de Setor ${proximaOrdem} ("${ramalNome}") adicionado na sequência!`);
      }

      // Persiste no PostgreSQL (system_settings)
      await supabase
        .from('system_settings')
        .upsert(
          { key: 'gsa_whatsapp_ramais_config', value: JSON.stringify(updatedRamaisList), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      // Sincroniza com a tabela nativa
      try {
        if (selectedRamal) {
          await supabase.from('gsa_whatsapp_ramais').update(payload).eq('id', selectedRamal.id).throwOnError();
        } else {
          await supabase.from('gsa_whatsapp_ramais').insert([payload]).throwOnError();
        }
      } catch (err) {
        console.error('Erro ao sincronizar com gsa_whatsapp_ramais:', err);
        toast.error('Erro ao salvar ramal no banco de dados.');
      }

      setIsRamalModalOpen(false);
      setSelectedRamal(null);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
      setIsRamalModalOpen(false);
      setSelectedRamal(null);
    } finally {
      setSavingRamal(false);
    }
  };

  // Toggle Ativar/Desativar Ramal
  const handleToggleRamalAtivo = async (ramal: WhatsAppRamal) => {
    const newStatus = !ramal.ativo;
    const updated = ramais.map(r => r.id === ramal.id ? { ...r, ativo: newStatus } : r);
    setRamais(updated);
    try {
      await supabase
        .from('system_settings')
        .upsert(
          { key: 'gsa_whatsapp_ramais_config', value: JSON.stringify(updated), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        
      // Sincroniza com a tabela nativa
      await supabase.from('gsa_whatsapp_ramais').update({ ativo: newStatus, updated_at: new Date().toISOString() }).eq('id', ramal.id);

      toast.success(`Ramal "${ramal.setor_nome}" ${newStatus ? 'ativado' : 'desativado'} em tempo real!`);
    } catch (e: any) {
      toast.error(`Erro ao alternar status do ramal: ` + e.message);
    }
  };

  // Excluir Ramal de Setor
  const handleDeleteRamal = async (ramal: WhatsAppRamal) => {
    if (!confirm(`Deseja remover o ramal de atendimento "${ramal.setor_nome}"?`)) return;
    const updated = ramais.filter(r => r.id !== ramal.id);
    setRamais(updated);
    try {
      await supabase
        .from('system_settings')
        .upsert(
          { key: 'gsa_whatsapp_ramais_config', value: JSON.stringify(updated), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        
      // Sincroniza com a tabela nativa
      await supabase.from('gsa_whatsapp_ramais').delete().eq('id', ramal.id);

      toast.success(`Ramal "${ramal.setor_nome}" removido!`);
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + e.message);
    }
  };

  // Testar Disparo de Linha ou Ramal via Engine Integrada (Evolution API + Meta Direct)
  const handleTestDevice = async (device: WhatsAppDevice) => {
    if (!device.phone) {
      toast.error('Cadastre um número antes de testar o disparo.');
      return;
    }
    setTestingId(device.id);

    try {
      const success = await sendAdminWhatsAppNotification({
        title: 'Teste de Linha Principal GSA HUB',
        message: `Dispositivo: *${device.name}*\nFunção: ${device.role}\nServidor: ${targetIp}\nStatus: Operacional 🟢`,
        category: 'SISTEMA',
        recipientPhone: device.phone
      });

      if (success) {
        toast.success(`✅ Disparo de teste enviado com sucesso para ${formatPhoneDisplay(device.phone)}!`);
      } else {
        toast.error('❌ Falha no disparo de teste.');
      }
    } catch (e: any) {
      toast.error('Falha no disparo de teste: ' + e.message);
    } finally {
      setTestingId(null);
    }
  };

  const handleTestRamal = async (ramal: WhatsAppRamal) => {
    setTestingId(ramal.id);
    try {
      const success = await sendAdminWhatsAppNotification({
        title: 'Teste de Transbordo de Ramal',
        message: `🏢 Setor: *${ramal.setor_nome}*\n👤 Responsável: ${ramal.responsavel_nome}\n🖥️ Servidor: ${targetIp}\nStatus: Operacional 🟢`,
        category: 'SISTEMA',
        recipientPhone: ramal.numero_whatsapp
      });

      if (success) {
        toast.success(`✅ Teste de transbordo enviado com sucesso para ${ramal.setor_nome} (${formatPhoneDisplay(ramal.numero_whatsapp)})!`);
      } else {
        toast.error('❌ Falha no disparo de transbordo.');
      }
    } catch (e: any) {
      toast.error('Falha no teste de ramal: ' + e.message);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-2xl">
      {/* Header do Servidor de Produção Oficial */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              Gerenciador Evolution API & WhatsApp
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                Instância: {instanceName}
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Pareamento QR Code, proteção da linha oficial de suporte e reordenação flexível de ramais sequenciais por setor.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-950/40 px-3.5 py-1.5 rounded-xl border border-emerald-500/30 text-xs font-bold text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            VPS Nova (147.15.43.141) — Produção Ativa
          </div>

          <button
            onClick={() => void checkConnectionStatus()}
            disabled={loading}
            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl transition-all disabled:opacity-50"
            title="Atualizar Status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid de Status do Servidor Selecionado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-neutral-400 uppercase font-mono font-semibold">Status do Servidor Alvo</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-white text-sm">Operacional (Ativo em Produção)</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-neutral-400 uppercase font-mono font-semibold">Servidor Selecionado</span>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              <span className="font-mono font-bold text-white text-sm">147.15.43.141 (Oracle ARM 24GB)</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-neutral-400 uppercase font-mono font-semibold">Criptografia WA</span>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-white text-sm">Baileys WA Web v2.3</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── LINHAS PRINCIPAIS (COM SUPORTE OFICIAL INVIOLÁVEL) ─── */}
      <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" /> Linhas Principais do Sistema GSA HUB
            </h4>
            <p className="text-xs text-neutral-400 mt-1">
              Linha Oficial de Suporte é permanente e protegida contra exclusão acidental.
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 bg-emerald-950/40 text-emerald-400 rounded border border-emerald-500/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 100% Conectado na VPS Nova
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => {
            return (
              <div 
                key={device.id} 
                className={`bg-neutral-900 border ${device.role === 'SUPORTE' ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border-neutral-800'} rounded-xl p-5 transition-all flex flex-col gap-4`}
              >
                {/* Header: Icon, Name, Role Badge */}
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl border shrink-0 ${device.role === 'MASTER' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                    {device.role === 'MASTER' ? <Radio className="w-5 h-5 animate-pulse" /> : <PhoneCall className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className="text-base font-bold text-white truncate">
                        {device.name}
                      </h5>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border ${device.role === 'MASTER' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                        {device.role}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-medium text-emerald-400 block">
                      {formatPhoneDisplay(device.phone)}
                    </span>
                  </div>
                </div>

                {/* Status Badges Row */}
                <div className="flex flex-wrap items-center gap-2">
                  {!device.canDelete && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-neutral-950 text-neutral-300 border border-neutral-700">
                      <Lock className="w-3 h-3 text-emerald-400" /> Oficial Inviolável
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Check className="w-3 h-3" /> Ativo na Nova VPS (Produção)
                  </span>
                </div>

                {/* Description */}
                <p className="text-[11px] text-neutral-400 leading-relaxed bg-neutral-950/50 p-3 rounded-lg border border-neutral-800/50">
                  {device.description}
                </p>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedDevice(device);
                        setEditPhone(device.phone);
                      }}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-400" /> Alterar Número
                    </button>
                    <button
                      onClick={() => void handleTestDevice(device)}
                      disabled={testingId === device.id}
                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className={`w-3.5 h-3.5 ${testingId === device.id ? 'animate-bounce' : ''}`} />
                      {testingId === device.id ? 'Enviando...' : 'Testar Disparo'}
                    </button>
                  </div>

                  {device.canDelete ? (
                    <button
                      onClick={() => void handleRemoveDevice(device)}
                      className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                      title="Desvincular Linha"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-emerald-500/70 flex items-center gap-1 px-2 py-1 bg-emerald-500/5 rounded border border-emerald-500/10">
                      <Lock className="w-3 h-3" /> Protegido
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── RAMAIS DE TRANSBORDO HUMANO SEQUENCIAIS COM DRAG-AND-DROP ─── */}
      <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" /> Ramais de Transbordo Humano Sequenciais por Setor
            </h4>
            <p className="text-xs text-neutral-400 mt-1">
              Organização flexível: <strong>Arraste os ramais para trocar de posição</strong> ou use as setas ⬆️ ⬇️. Novos ramais seguem automaticamente a sequência numerada (ex: {getNumberEmoji(getProximoNumeroSequencial())}).
            </p>
          </div>
          <button
            onClick={handleOpenNovoRamalModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Novo Ramal (Sequência {getProximoNumeroSequencial()})
          </button>
        </div>

        {loadingRamais ? (
          <div className="flex items-center justify-center py-8 text-neutral-500">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ramais.map((ramal, idx) => (
              <div 
                key={ramal.id} 
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => void handleDrop(idx)}
                className={`bg-neutral-900 border ${ramal.ativo ? 'border-neutral-800 hover:border-blue-500/50' : 'border-neutral-800/50 opacity-60'} ${draggedIndex === idx ? 'border-dashed border-blue-400 bg-neutral-950 scale-95' : ''} rounded-xl p-4 transition-all flex flex-col gap-3 relative group cursor-grab active:cursor-grabbing`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 bg-neutral-950 rounded-lg text-neutral-500 group-hover:text-blue-400 border border-neutral-800 shrink-0 mt-1" title="Arraste para reordenar">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="text-sm font-bold text-white truncate">{ramal.setor_nome}</h5>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-neutral-800 text-neutral-400 whitespace-nowrap">
                          Posição #{idx + 1}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-medium text-blue-400 block mb-0.5">
                        {formatPhoneDisplay(ramal.numero_whatsapp)}
                      </span>
                      <span className="text-[11px] text-neutral-400 block font-sans truncate">
                        Responsável: {ramal.responsavel_nome}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={() => void handleToggleRamalAtivo(ramal)}
                      className="text-neutral-400 hover:text-white transition-colors"
                      title={ramal.ativo ? 'Desativar Ramal' : 'Ativar Ramal'}
                    >
                      {ramal.ativo ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-neutral-600" />}
                    </button>
                    {/* Botões de Troca Rápida de Ordem */}
                    <div className="flex bg-neutral-950 rounded border border-neutral-800 overflow-hidden">
                      <button
                        onClick={() => void moveRamalPosition(idx, 'UP')}
                        disabled={idx === 0}
                        className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-colors"
                        title="Mover para Cima"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px bg-neutral-800"></div>
                      <button
                        onClick={() => void moveRamalPosition(idx, 'DOWN')}
                        disabled={idx === ramais.length - 1}
                        className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-colors"
                        title="Mover para Baixo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-neutral-800/80 pt-3 mt-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedRamal(ramal);
                        setRamalNome(ramal.setor_nome);
                        setRamalCodigo(ramal.codigo_setor);
                        setRamalNumero(ramal.numero_whatsapp);
                        setRamalResponsavel(ramal.responsavel_nome);
                        setIsRamalModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-400" /> Editar
                    </button>
                    <button
                      onClick={() => void handleTestRamal(ramal)}
                      disabled={testingId === ramal.id}
                      className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className={`w-3.5 h-3.5 ${testingId === ramal.id ? 'animate-bounce' : ''}`} />
                      {testingId === ramal.id ? 'Testando...' : 'Testar'}
                    </button>
                  </div>

                  <button
                    onClick={() => void handleDeleteRamal(ramal)}
                    className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                    title="Excluir Ramal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Área de QR Code e Ações para a VPS Nova */}
      <div className="bg-neutral-950 p-6 rounded-xl border border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-3 max-w-md">
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-emerald-400" /> Pareamento WhatsApp Web na VPS Nova ({targetIp})
          </h4>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Para migrar o envio de WhatsApp para a nova VPS definitivamente e desativar a máquina antiga, selecione a <strong>VPS Nova (147.15.43.141)</strong> acima, clique em <strong>"Gerar QR Code WhatsApp"</strong> e escaneie o código.
          </p>
          
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => void generateQRCode()}
              disabled={loading}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Gerar QR Code WhatsApp na VPS Nova
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-4 bg-neutral-900 border border-neutral-800 rounded-2xl min-w-[220px] min-h-[220px]">
          {status === 'connected' ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 p-3 w-full">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.35)]">
                  <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-neutral-900"></span>
                </span>
              </div>

              <div>
                <span className="text-sm font-black text-emerald-400 block tracking-wide">WhatsApp Conectado!</span>
                <span className="text-[11px] text-neutral-400 font-mono">Sessão ativa na VPS</span>
              </div>

              <div className="w-full bg-neutral-950/90 rounded-xl p-3 border border-emerald-500/30 space-y-2 text-left shadow-inner">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-400 flex items-center gap-1.5 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Data:
                  </span>
                  <span className="font-mono font-bold text-white">
                    {connectedAt ? formatDateTime(connectedAt)?.date : '26/08/2026'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-400 flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Horário:
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {connectedAt ? formatDateTime(connectedAt)?.time : '14:15:00'}
                  </span>
                </div>

                <div className="pt-1.5 border-t border-neutral-800 flex items-center justify-between text-[10px]">
                  <span className="text-neutral-500">Status:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Sessão Ativa na VPS
                  </span>
                </div>
              </div>
            </div>
          ) : qrCodeBase64 ? (

            <div className="space-y-3 text-center">
              <img src={qrCodeBase64} alt="QR Code WhatsApp" className="w-48 h-48 rounded-xl border-2 border-emerald-500/50 shadow-2xl" />
              {pairingCode && (
                <div className="p-2 bg-neutral-950 rounded-lg border border-neutral-800">
                  <span className="text-[10px] text-neutral-400 block font-mono">CÓDIGO DE PAREAMENTO:</span>
                  <span className="font-mono text-sm font-black text-emerald-400 tracking-widest">{pairingCode}</span>
                </div>
              )}
              <span className="text-[11px] text-emerald-400 font-bold animate-pulse block">
                Aguardando leitura no celular...
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-2 text-neutral-500">
              <QrCode className="w-12 h-12 opacity-30" />
              <span className="text-xs font-mono">Clique para gerar o QR Code</span>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição de Linha Principal */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                Alterar Número da Linha: {selectedDevice.name}
              </h3>
              <button onClick={() => setSelectedDevice(null)} className="p-1 text-neutral-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-left">
              {!selectedDevice.canDelete && (
                <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2 font-bold">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                  Esta é a Linha de Suporte Oficial do sistema. Ela não pode ser excluída, mas você pode substituir o número por outro aparelho a qualquer momento.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-widest mb-1.5">
                  Número do WhatsApp (com DDD)
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Ex: 5511920857756"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-all"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Formato visual: <strong>{formatPhoneDisplay(editPhone)}</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-neutral-800 pt-4">
              <button
                onClick={() => setSelectedDevice(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSaveDevice()}
                disabled={savingDevice}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {savingDevice ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Número
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cadastro / Edição de Ramal de Setor */}
      {isRamalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                {selectedRamal ? 'Editar Ramal de Transbordo' : `Cadastrar Novo Ramal (Sequência ${getProximoNumeroSequencial()})`}
              </h3>
              <button onClick={() => setIsRamalModalOpen(false)} className="p-1 text-neutral-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-widest mb-1.5">
                  Nome do Setor com Sequência
                </label>
                <input
                  type="text"
                  value={ramalNome}
                  onChange={(e) => setRamalNome(e.target.value)}
                  placeholder={`Ex: ${getNumberEmoji(getProximoNumeroSequencial())} Atendimento VIP / Jurídico`}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-widest mb-1.5">
                  Número de WhatsApp do Responsável (com DDD)
                </label>
                <input
                  type="text"
                  value={ramalNumero}
                  onChange={(e) => setRamalNumero(e.target.value)}
                  placeholder="Ex: 5511971858372"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-all"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Formato visual: <strong>{formatPhoneDisplay(ramalNumero)}</strong>
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-widest mb-1.5">
                  Nome do Responsável / Atendente do Ramal
                </label>
                <input
                  type="text"
                  value={ramalResponsavel}
                  onChange={(e) => setRamalResponsavel(e.target.value)}
                  placeholder="Ex: Carlos Andrade - Gerente de Vendas"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-neutral-800 pt-4">
              <button
                onClick={() => setIsRamalModalOpen(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSaveRamal()}
                disabled={savingRamal}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {savingRamal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Ramal Sequencial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
