import React, { useState, useEffect, useRef } from 'react';
import { Cliente } from '../../types';
import { useFileViewer } from '../../contexts/FileViewerContext';
import { maskCPF, maskPhone, formatDate, formatDateTime, maskCEP } from '../../lib/utils';
import { 
  User, Shield, Calendar, Phone, FileText, Edit2, Mail, Lock, KeyRound,
  Upload, AlertCircle, CheckCircle, Clock, XCircle, Trash2, MapPin, Home
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { toast } from 'react-hot-toast';
import { validarCPF, validarEmail } from '../../utils/cpfValidator';
import { supabase } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { PinInput } from '../ui/PinInput';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { sessionService } from '../../lib/sessionService';
import { navigate } from '../../routing/navigationService';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Documento {
  id: string;
  nome: string;
  tipo: string;
  urls: string[];
  status: 'pendente' | 'aprovado' | 'reprovado' | 'em_analise';
  created_at: string;
  motivo_rejeicao?: string;
  enviado_por_admin?: boolean;
}

type TabType = 'perfil' | 'documentos';

// ─── Component ────────────────────────────────────────────────────────────────
export function ClientProfile({ 
  cliente, 
  onOpenTicket,
  initialTab,
  initialItemId
}: { 
  cliente: Cliente, 
  onOpenTicket: (assunto: string, descricao: string) => void,
  initialTab?: string,
  initialItemId?: string
}) {
  const { openFile } = useFileViewer();
  const { containerRef: profileTabsRef, setButtonRef: setProfileTabButtonRef } = useAutoFitTabs(16, 10);
  // ── Tab ─────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>(
    initialTab === 'documentos' ? 'documentos' : 'perfil'
  );

  useEffect(() => {
    if (initialTab === 'documentos') setActiveTab('documentos');
  }, [initialTab]);

  // ── Perfil states ────────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<{ label: string, value: string } | null>(null);
  const [newValue, setNewValue] = useState('');
  const [motivo, setMotivo] = useState('');

  // PIN change states
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    const s = sessionService.getCurrentSession();
    if (s?.precisa_trocar_senha) {
      setIsRecoveryMode(true);
      setIsPinModalOpen(true);
      setPinStep('new');
    }
  }, []);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinStep, setPinStep] = useState<'current' | 'new'>('current');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const highlightedItemId = useState<string | null>(null)[0]; // keeping structure
  const setHighlightedItemId = useState<string | null>(null)[1];
  const hasAutoOpened = useRef<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (activeTab !== 'perfil') return;
    const el = titleRef.current;
    if (!el || !cliente?.nome) return;
    const parent = el.parentElement;
    if (!parent) return;

    const resize = () => {
      const width = parent.clientWidth;
      if (!width) return;

      let fontSize = window.innerWidth < 640 ? 30 : 34;
      el.style.fontSize = `${fontSize}px`;

      while (el.scrollWidth > width && fontSize > 15) {
        fontSize -= 1;
        el.style.fontSize = `${fontSize}px`;
      }
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(resize);
    });
    observer.observe(parent);
    resize();

    return () => observer.disconnect();
  }, [cliente?.nome, activeTab]);

  useEffect(() => {
    if (initialItemId && hasAutoOpened.current !== initialItemId) {
      setTimeout(() => {
        const element = document.getElementById(initialItemId);
        if (element) {
          hasAutoOpened.current = initialItemId;
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedItemId(initialItemId);
          setTimeout(() => setHighlightedItemId(null), 3000);
        }
      }, 400);
    }
  }, [initialItemId]);

  // ── Documentos states ────────────────────────────────────────────────────────
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedDocToUpload, setSelectedDocToUpload] = useState<Documento | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);

  useEffect(() => {
    fetchDocumentos();
  }, [cliente.id, monthFilter]);

  useRealtimeSubscription({
    table: 'cliente_documentos',
    filter: `cliente_id=eq.${cliente.id}`,
    onChange: () => {
      fetchDocumentos();
    },
  });

  // Scroll to specific document if initialItemId is a doc
  useEffect(() => {
    if (initialItemId && documentos.length > 0 && hasAutoOpened.current !== initialItemId) {
      const doc = documentos.find(d => d.id === initialItemId);
      if (doc) {
        hasAutoOpened.current = initialItemId;
        setActiveTab('documentos');
        setTimeout(() => {
          const element = document.getElementById(`documento-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedDocId(initialItemId);
            setTimeout(() => setHighlightedDocId(null), 3000);
          }
        }, 400);
      }
    }
  }, [initialItemId, documentos.length]);

  const fetchDocumentos = async () => {
    try {
      setDocsLoading(true);
      let query = supabase
        .from('cliente_documentos')
        .select('*')
        .eq('cliente_id', cliente.id)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      let filtered = (data || []) as Documento[];
      if (monthFilter) {
        filtered = filtered.filter(doc => doc.created_at.startsWith(monthFilter));
      }
      setDocumentos(filtered);
    } catch (err) {
      console.error('Erro ao buscar documentos:', err);
    } finally {
      setDocsLoading(false);
    }
  };

  // ── Perfil handlers ──────────────────────────────────────────────────────────
  const handleEdit = (label: string, value: string) => {
    setEditingField({ label, value });
    setNewValue('');
    setMotivo('');
    setIsModalOpen(true);
  };

  const handleNewValueChange = (val: string) => {
    if (editingField?.label === 'Nome') {
      setNewValue(val.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''));
    } else if (editingField?.label === 'Documento (CPF)') {
      setNewValue(maskCPF(val));
    } else if (editingField?.label === 'Contato (Telefone)') {
      setNewValue(maskPhone(val));
    } else if (editingField?.label === 'CEP') {
      setNewValue(maskCEP(val));
    } else {
      setNewValue(val);
    }
  };

  const handleConfirm = async () => {
    if (!editingField || !newValue || !motivo) return;
    const assunto = `Solicitação de alteração: ${editingField.label}`;
    const descricao = `O cliente solicitou a alteração do campo "${editingField.label}".\n\nValor atual: ${editingField.value}\nNovo valor solicitado: ${newValue}\nMotivo: ${motivo}\n\nPrazo de retorno: até 48 horas.`;
    await onOpenTicket(assunto, descricao);
    setIsModalOpen(false);
    toast.success('Solicitação de alteração enviada com sucesso! Um ticket foi aberto.');
  };

  const resetPinModal = () => {
    if (isRecoveryMode) return;
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
    setPinError(false);
    setPinStep('current');
    setIsPinModalOpen(false);
  };

  const handleChangePin = async () => {
    if (pinStep === 'current') {
      if (currentPin.length !== 4) return;
      setPinLoading(true);
      try {
        const session = sessionService.getCurrentSession();
        if (!session?.sessaoId || !session?.sessionToken) {
          throw new Error('Sessão expirada. Faça login novamente.');
        }
        const { data, error } = await supabase.rpc('gsa_verify_own_pin', {
          p_sessao_id: session.sessaoId,
          p_session_token: session.sessionToken,
          p_pin: currentPin,
        });
        if (error) throw error;

        if (data === true) {
          setPinStep('new');
          setPinError(false);
        } else {
          setPinError(true);
          setCurrentPin('');
          toast.error('Senha atual incorreta.');
        }
      } catch {
        toast.error('Erro ao verificar senha.');
      } finally {
        setPinLoading(false);
      }
      return;
    }

    if (newPin.length !== 4 || confirmNewPin.length !== 4) {
      toast.error('Preencha todos os dígitos.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinError(true);
      setConfirmNewPin('');
      toast.error('As senhas não coincidem.');
      return;
    }

    setPinLoading(true);
    try {
      const session = sessionService.getCurrentSession();
      if (!session?.sessaoId || !session?.sessionToken) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      let rpcName = isRecoveryMode ? 'gsa_update_client_pin' : 'gsa_change_own_pin';
      let rpcParams = isRecoveryMode 
        ? { p_sessao_id: session.sessaoId, p_session_token: session.sessionToken, p_new_pin: newPin }
        : { p_sessao_id: session.sessaoId, p_session_token: session.sessionToken, p_current_pin: currentPin, p_new_pin: newPin };
      const { data, error } = await supabase.rpc(rpcName, rpcParams as any);

      if (error) throw error;
      
      if (isRecoveryMode) {
        if (!data || data.success !== true) {
          throw new Error(data?.error || 'A senha não pôde ser alterada.');
        }
      } else {
        if (data !== true) {
          throw new Error('A senha não pôde ser alterada.');
        }
      }

      toast.success('Senha alterada com sucesso!');
      if (isRecoveryMode) {
        setIsRecoveryMode(false);
        resetPinModal();
        navigate('/cliente/dashboard');
      } else {
        resetPinModal();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao alterar senha.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleRequestDelete = async () => {
    if (!deleteReason.trim()) {
      toast.error('Por favor, informe o motivo.');
      return;
    }
    const assunto = `Solicitação de Exclusão de Conta`;
    const descricao = `O cliente solicitou a EXCLUSÃO PERMANENTE da conta.\n\nMotivo informado:\n${deleteReason}\n\nA solicitação entrou em análise pelo sistema (prazo: 3 dias úteis).`;
    await onOpenTicket(assunto, descricao);
    setIsDeleteModalOpen(false);
    setDeleteReason('');
    toast.success('Solicitação de exclusão enviada! Retornaremos em até 3 dias úteis.');
  };

  // ── Documentos handlers ──────────────────────────────────────────────────────
  const handleOpenUpload = (doc: Documento) => {
    setSelectedDocToUpload(doc);
    setSelectedFiles([]);
    setUploadProgress(0);
    setUploadModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files].slice(0, 5));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || !selectedDocToUpload) {
      toast.error('Por favor, selecione ao menos um arquivo.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const urls: string[] = [];
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = selectedFiles[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${selectedDocToUpload.tipo}-${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const filePath = `${cliente.id}/${fileName}`;

        setUploadProgress(10 + (i / totalFiles) * 60);

        const { error: uploadError } = await supabase.storage
          .from('documentos_cliente')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('documentos_cliente')
          .getPublicUrl(filePath);
        
        urls.push(publicUrlData.publicUrl);
      }

      setUploadProgress(80);

      await clientOperationalWrite(cliente.id, 'cliente_documentos', 'update', {
        urls,
        status: 'em_analise',
        motivo_rejeicao: null
      }, { id: selectedDocToUpload.id });

      // Notificar o admin
      await notificationService.notifyAdmin(
        '📄 Documento de Cliente Recebido',
        `O cliente ${cliente.nome} enviou o documento "${selectedDocToUpload.nome}" para análise.`,
        'cadastro',
        'documento_cliente_enviado',
        { tab: 'clientes', itemId: cliente.id, contexto: { cliente_id: cliente.id, documento_id: selectedDocToUpload.id } }
      );

      setUploadProgress(100);
      toast.success('Documentos enviados com sucesso! Aguardando análise.');
      setUploadModalOpen(false);
      setSelectedFiles([]);
      fetchDocumentos();
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      toast.error('Falha ao enviar documento. Tente novamente.');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handleDeleteDoc = async (id: string, nome: string, urls?: string[]) => {
    if (!confirm(`Deseja realmente excluir o documento "${nome}"?`)) return;
    try {
      if (urls && Array.isArray(urls)) {
        for (const url of urls) {
          try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/');
            const storagePath = pathSegments.slice(pathSegments.indexOf('documentos_cliente') + 1).join('/');
            if (storagePath) {
              await supabase.storage.from('documentos_cliente').remove([storagePath]);
            }
          } catch (storageErr) {
            console.error('Erro ao excluir arquivo do storage:', storageErr);
          }
        }
      }
      await clientOperationalWrite(cliente.id, 'cliente_documentos', 'delete', {}, { id });
      toast.success('Documento excluído com sucesso.');
      fetchDocumentos();
    } catch (err) {
      console.error('Erro ao excluir documento:', err);
      toast.error('Erro ao excluir documento.');
    }
  };

  const pendentes = documentos.filter(d => d.status === 'pendente' || d.status === 'reprovado');
  const enviados = documentos.filter(d => d.status === 'em_analise' || d.status === 'aprovado');

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6">
      {/* Tab Bar */}
      <div ref={profileTabsRef} className="flex w-full gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-neutral-200 sm:w-fit">
        {([
          { key: 'perfil', label: 'Meu Perfil', icon: User },
          { key: 'documentos', label: 'Meus Documentos', icon: FileText },
        ] as { key: TabType; label: string; icon: any }[]).map((tab, index) => (
          <button
            key={tab.key}
            ref={setProfileTabButtonRef(index)}
            onClick={() => setActiveTab(tab.key)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2.5 font-black leading-none transition-all sm:flex-none sm:gap-2 sm:px-5 ${
              activeTab === tab.key
                ? 'bg-[#1a1a1a] text-white shadow-md'
                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Tab: Meu Perfil ────────────────────────────────────────────────── */}
        {activeTab === 'perfil' && (
          <motion.div
            key="perfil"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4 sm:gap-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-lg shadow-black/10 sm:h-24 sm:w-24">
                <User className="h-10 w-10" />
              </div>
              <div className="min-w-0">
                <h2
                  ref={titleRef}
                  className="block max-w-full whitespace-nowrap text-3xl leading-tight tracking-tight text-[#1a1a1a]"
                >
                    {cliente.nome}
                </h2>
                <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-[#1a1a1a]/40">
                  {cliente.codigo_cliente}
                </p>
              </div>
              <button onClick={() => handleEdit('Nome', cliente.nome)} className="shrink-0 p-2 text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <Edit2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300 relative">
                <div className="mb-4 flex items-center gap-3 text-[#1a1a1a]/40">
                  <Shield className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">Documento</span>
                </div>
                <p className="text-lg font-medium text-[#1a1a1a]">{maskCPF(cliente.cpf)}</p>
                <button onClick={() => handleEdit('Documento (CPF)', cliente.cpf)} className="absolute top-6 right-6 p-2 text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300 relative text-left">
                <div className="mb-4 flex items-center gap-3 text-[#1a1a1a]/40">
                  <Phone className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">Contato</span>
                </div>
                <p className="text-lg font-medium text-[#1a1a1a]">{maskPhone(cliente.telefone)}</p>
                <button onClick={() => handleEdit('Contato (Telefone)', cliente.telefone)} className="absolute top-6 right-6 p-2 text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300 relative text-left">
                <div className="mb-4 flex items-center gap-3 text-[#1a1a1a]/40">
                  <Mail className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">E-mail</span>
                </div>
                <p className="text-lg font-medium text-[#1a1a1a] truncate pr-8">{(cliente as any).email || 'Não informado'}</p>
                <button onClick={() => handleEdit('E-mail', (cliente as any).email || '')} className="absolute top-6 right-6 p-2 text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300 relative text-left">
                <div className="mb-4 flex items-center gap-3 text-[#1a1a1a]/40">
                  <MapPin className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">CEP</span>
                </div>
                <p className="text-lg font-medium text-[#1a1a1a]">{cliente.cep ? maskCEP(cliente.cep) : 'Não informado'}</p>
                <button onClick={() => handleEdit('CEP', cliente.cep || '')} className="absolute top-6 right-6 p-2 text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300 relative text-left">
                <div className="mb-4 flex items-center gap-3 text-[#1a1a1a]/40">
                  <Home className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">Número</span>
                </div>
                <p className="text-lg font-medium text-[#1a1a1a]">{cliente.numero || 'Não informado'}</p>
                <button onClick={() => handleEdit('Número', cliente.numero || '')} className="absolute top-6 right-6 p-2 text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300">
                <div className="mb-4 flex items-center gap-3 text-[#1a1a1a]/40">
                  <Calendar className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">Membro desde</span>
                </div>
                <p className="text-lg font-medium text-[#1a1a1a]">{formatDate(cliente.data_cadastro)}</p>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300">
                <div className="mb-4 flex items-center gap-3 text-[#1a1a1a]/40">
                  <FileText className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">Status da Conta</span>
                </div>
                <span className={`inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-black tracking-widest uppercase shadow-lg transition-all ${
                  cliente.status === 'ativo' ? 'bg-emerald-500 text-white shadow-emerald-500/40' : 'bg-red-500 text-white shadow-red-500/40'
                }`}>
                  {(cliente.status === 'inativo' && cliente.cadastro_aprovado === false) ? 'pendente' : cliente.status}
                </span>
              </div>
            </div>

            {/* Segurança */}
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#142030]/5">
                    <Lock className="h-5 w-5 text-[#142030]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1a1a1a]">Senha de Acesso</h3>
                    <p className="text-xs text-[#1a1a1a]/40">Senha numérica de 4 dígitos</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPinModalOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-[#142030] px-4 py-2.5 text-xs font-semibold text-white transition-all hover:bg-[#1a2a3a] shadow-lg shadow-black/10"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Alterar Senha
                </button>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300 border-t-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-red-600">Excluir Conta</h3>
                  <p className="text-xs text-neutral-500 mt-1">Solicite a exclusão permanente da sua conta e dados.</p>
                </div>
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 transition-all hover:bg-red-100 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Solicitar Exclusão
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-100">
              <h3 className="mb-2 text-sm font-medium text-amber-900">Segurança dos Dados</h3>
              <p className="text-sm text-amber-800/80 leading-relaxed">
                Seus dados estão protegidos de acordo com a LGPD.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Tab: Meus Documentos ───────────────────────────────────────────── */}
        {activeTab === 'documentos' && (
          <motion.div
            key="documentos"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Pendentes / Reprovados */}
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
              <div className="p-6 border-b border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-neutral-50/50">
                <div>
                  <h3 className="text-lg font-medium text-neutral-900">Documentos Solicitados</h3>
                  <p className="text-sm text-neutral-500 mt-1">Envie os documentos requisitados pela administração.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-neutral-200">
                    <Clock className="h-4 w-4 text-neutral-400" />
                    <select
                      value={monthFilter}
                      onChange={e => setMonthFilter(e.target.value)}
                      className="text-xs font-bold text-neutral-700 focus:outline-none bg-transparent"
                    >
                      <option value="">Todos os meses</option>
                      {Array.from({ length: 12 }, (_, i) => {
                        const month = (i + 1).toString().padStart(2, '0');
                        const year = new Date().getFullYear();
                        return (
                          <option key={month} value={`${year}-${month}`}>
                            {new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(year, i))}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                    {pendentes.length} pendentes
                  </span>
                </div>
              </div>

              {docsLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-4 border-[#1a1a1a] border-t-transparent animate-spin" />
                </div>
              ) : pendentes.length === 0 ? (
                <div className="p-12 text-center text-neutral-500">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
                  <p className="font-medium text-neutral-900">Tudo certo por aqui!</p>
                  <p className="text-sm mt-1">Você não possui documentos pendentes de envio.</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {pendentes.map(doc => (
                    <div
                      id={`documento-${doc.id}`}
                      key={doc.id}
                      className={`p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-500 ${
                        highlightedDocId === doc.id
                          ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg rounded-xl'
                          : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-4">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                          doc.status === 'reprovado' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {doc.status === 'reprovado' ? <XCircle className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
                        </div>
                        <div>
                          <h4 className="font-medium text-neutral-900 text-base">{doc.nome}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="uppercase text-[10px] tracking-wider font-bold bg-neutral-200 px-2 py-0.5 rounded text-neutral-700">
                              {doc.tipo.replace('_', ' ')}
                            </span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              doc.status === 'reprovado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {doc.status === 'reprovado' ? 'Reprovado / Reenvio' : 'Pendente Envio'}
                            </span>
                          </div>
                          {doc.status === 'reprovado' && doc.motivo_rejeicao && (
                            <p className="text-sm text-red-600 mt-2 bg-red-50 p-3 rounded-lg border border-red-100">
                              <span className="font-bold">Motivo:</span> {doc.motivo_rejeicao}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => handleOpenUpload(doc)}
                          className="flex items-center justify-center gap-2 rounded-xl bg-[#1a1a1a] px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-black shrink-0"
                        >
                          <Upload className="h-4 w-4" />
                          {doc.status === 'reprovado' ? 'Reenviar Arquivo' : 'Enviar Arquivo'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enviados / Aprovados */}
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
              <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
                <h3 className="text-lg font-medium text-neutral-900">Seus Documentos Anexados</h3>
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-800">
                  {enviados.length} anexos
                </span>
              </div>

              {docsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 rounded-full border-4 border-[#1a1a1a] border-t-transparent animate-spin" />
                </div>
              ) : enviados.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-sm">
                  Nenhum documento enviado ou processado ainda.
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {enviados.map(doc => (
                    <div
                      id={`documento-${doc.id}`}
                      key={doc.id}
                      className={`p-4 flex items-center justify-between group transition-all duration-500 ${
                        highlightedDocId === doc.id
                          ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg rounded-xl'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                          doc.status === 'aprovado' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                        }`}>
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-neutral-900">{doc.nome}</span>
                              {doc.enviado_por_admin && (
                                <span className="text-[10px] bg-sky-100 text-sky-700 font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-1">
                                  <Shield className="w-3 h-3" /> Sistema
                                </span>
                              )}
                            </div>
                            {doc.urls && Array.isArray(doc.urls) && (
                              <div className="flex gap-2 flex-wrap">
                                {doc.urls.map((u, i) => (
                                  <button key={i} type="button" onClick={() => openFile(u, `Documento ${i+1}`)} className="text-[10px] font-bold text-indigo-600 hover:underline">
                                    Ver {i + 1}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-neutral-500">
                            <span className="uppercase text-[10px] tracking-wider font-bold bg-neutral-200 px-2 py-0.5 rounded">{doc.tipo.replace('_', ' ')}</span>
                            <span>{formatDateTime(doc.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                        doc.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {doc.status === 'em_analise' && <Clock className="w-3 h-3" />}
                        {doc.status === 'aprovado' && <CheckCircle className="w-3 h-3" />}
                        {doc.status === 'aprovado' ? 'Aprovado' : 'Em Análise'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Alterar ${editingField?.label}`} size="wide">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Valor atual: <span className="font-bold">{editingField?.value}</span>
          </p>
          <input
            type="text"
            inputMode={['Documento (CPF)', 'Contato (Telefone)', 'CEP'].includes(editingField?.label || '') ? 'numeric' : 'text'}
            pattern={['Documento (CPF)', 'Contato (Telefone)', 'CEP'].includes(editingField?.label || '') ? '[0-9]*' : undefined}
            placeholder={`Novo valor para ${editingField?.label}`}
            value={newValue}
            onChange={e => handleNewValueChange(e.target.value)}
            onBlur={(e) => {
              if (editingField?.label === 'Documento (CPF)') {
                const val = e.target.value.replace(/\D/g, '');
                if (val && !validarCPF(val)) {
                  toast.error('CPF inválido');
                  setNewValue('');
                }
              } else if (editingField?.label === 'E-mail') {
                if (e.target.value && !validarEmail(e.target.value)) {
                  toast.error('E-mail inválido');
                  setNewValue('');
                }
              }
            }}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            placeholder="Motivo da solicitação de alteração"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
            rows={3}
          />
          <button
            onClick={handleConfirm}
            className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700"
          >
            Confirmar Alteração
          </button>
        </div>
      </Modal>

      <Modal isOpen={isPinModalOpen} onClose={isRecoveryMode ? () => {} : resetPinModal} title={isRecoveryMode ? 'Criar Nova Senha' : (pinStep === 'current' ? 'Senha Atual' : 'Nova Senha')}>
        <div className="space-y-6">
          {pinStep === 'current' ? (
            <>
              <div className="text-center">
                <div className="w-14 h-14 bg-[#142030]/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-7 h-7 text-[#142030]" />
                </div>
                <p className="text-xs text-[#1a1a1a]/50">Para alterar sua senha, primeiro confirme a senha atual.</p>
              </div>
              <PinInput value={currentPin} onChange={(v) => { setCurrentPin(v); setPinError(false); }} error={pinError} disabled={pinLoading} label="Senha Atual" />
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="text-xs text-[#1a1a1a]/50">Digite a nova senha numérica de 4 dígitos.</p>
              </div>
              <div className="space-y-5">
                <PinInput value={newPin} onChange={(v) => { setNewPin(v); setPinError(false); }} error={pinError} disabled={pinLoading} label="Nova Senha" />
                <PinInput value={confirmNewPin} onChange={(v) => { setConfirmNewPin(v); setPinError(false); }} error={pinError} disabled={pinLoading} autoFocus={false} label="Confirmar Nova Senha" />
              </div>
            </>
          )}
          <div className="flex gap-4 pt-2">
            {!isRecoveryMode && <button onClick={resetPinModal} className="btn-secondary flex-1">Cancelar</button>}
            <button
              onClick={handleChangePin}
              disabled={pinLoading || (pinStep === 'current' ? currentPin.length !== 4 : (newPin.length !== 4 || confirmNewPin.length !== 4))}
              className="btn-primary flex-1"
            >
              {pinLoading ? 'Verificando...' : pinStep === 'current' ? 'Confirmar' : 'Alterar Senha'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Solicitar Exclusão de Conta">
        <div className="space-y-4">
          <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              A exclusão da conta é um processo irreversível. Ao confirmar, sua solicitação entrará em análise pelo sistema e será processada em até <strong>3 dias úteis</strong>.
            </p>
          </div>
          <p className="text-sm font-semibold text-neutral-700">Por favor, informe o motivo da exclusão:</p>
          <textarea
            placeholder="Qual o motivo para excluir sua conta?"
            value={deleteReason}
            onChange={e => setDeleteReason(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-red-500 focus:ring-red-500 focus:outline-none"
            rows={4}
          />
          <div className="flex gap-4 pt-2">
            <button onClick={() => setIsDeleteModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button
              onClick={handleRequestDelete}
              disabled={!deleteReason.trim()}
              className="btn-primary flex-1 bg-red-600 hover:bg-red-700 shadow-red-600/20 disabled:bg-red-300 disabled:shadow-none"
            >
              Confirmar Solicitação
            </button>
          </div>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title={`Enviar: ${selectedDocToUpload?.nome}`} size="wide">
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-4">
            <p className="text-sm text-indigo-800">
              Faça o upload do arquivo solicitado. Formatos suportados: PDF, JPG, PNG (máx 10MB).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Arquivos (Até 5) *</label>
            <div className="space-y-2 mb-3">
              {selectedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2 border border-indigo-100">
                  <CheckCircle className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span className="text-xs font-bold text-indigo-700 truncate flex-1">{f.name}</span>
                  <button type="button" onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-indigo-500 hover:text-indigo-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {selectedFiles.length < 5 && (
              <div className="mt-1 flex justify-center rounded-xl border-2 border-dashed border-neutral-300 px-6 py-6 hover:bg-neutral-50 transition-colors">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-8 w-8 text-neutral-400" />
                  <div className="flex text-sm text-neutral-600 mt-2 justify-center">
                    <label className="relative cursor-pointer rounded-md bg-transparent font-medium text-indigo-600 focus-within:outline-none hover:text-indigo-500">
                      <span>Fazer Upload</span>
                      <input type="file" multiple className="sr-only" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg" />
                    </label>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Selecionados: {selectedFiles.length}/5
                  </p>
                </div>
              </div>
            )}
          </div>
          {isUploading && (
            <div className="w-full bg-neutral-200 rounded-full h-2.5">
              <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setUploadModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={isUploading || selectedFiles.length === 0} className="btn-primary flex-1">
              {isUploading ? 'Enviando...' : 'Enviar Documentos'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
