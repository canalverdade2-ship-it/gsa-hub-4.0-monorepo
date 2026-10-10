import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileCheck2,
  ListChecks,
  Wallet,
  Folder,
  MessageCircle,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileText,
  Plus,
  Edit,
  Download,
  Eye,
  Check,
  X,
  CreditCard,
  DollarSign,
  Trash2
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { Client } from '../../types';
import { api, date as formatDate, isDemoMode } from '../../api';

interface Client360Props {
  client: Client;
  onBack: () => void;
  onNavigateToOrder?: (orderCode: string) => void;
}

type InternalNote = {
  id: string | number;
  folder: string;
  text: string;
  date: string;
  file?: string;
  personalDocumentId?: string | null;
  personalDocument?: {
    id: string;
    title: string;
    category?: string;
    status?: string;
    fileId?: string | null;
    fileName?: string | null;
  } | null;
};

export function Client360({ client: initialClient, onBack, onNavigateToOrder }: Client360Props) {
  const [client, setClient] = useState<Client>(initialClient);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'data' | 'proposals' | 'contracts' | 'orders' | 'finance' | 'wallet' | 'documents' | 'tickets' | 'history' | 'information'
  >('overview');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteClientModalOpen, setIsDeleteClientModalOpen] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [isPermanentDeleteModalOpen, setIsPermanentDeleteModalOpen] = useState(false);
  const [isPermanentlyDeletingClient, setIsPermanentlyDeletingClient] = useState(false);
  const [accountDeletionRequest, setAccountDeletionRequest] = useState<any | null>(null);
  const [isDeletionRequestModalOpen, setIsDeletionRequestModalOpen] = useState(false);
  const [isApprovingDeletion, setIsApprovingDeletion] = useState(false);
  const [isNewProposalModalOpen, setIsNewProposalModalOpen] = useState(false);
  const [selectedProposalModal, setSelectedProposalModal] = useState<any | null>(null);
  const [selectedContractModal, setSelectedContractModal] = useState<any | null>(null);
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState<any | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [isPersonalDocumentModalOpen, setIsPersonalDocumentModalOpen] = useState(false);
  const [editingPersonalDocument, setEditingPersonalDocument] = useState<any | null>(null);
  const [personalDocumentToDelete, setPersonalDocumentToDelete] = useState<any | null>(null);
  const [personalDocumentTitle, setPersonalDocumentTitle] = useState('');
  const [personalDocumentCategory, setPersonalDocumentCategory] = useState('Cadastro pessoal');
  const [isSavingPersonalDocument, setIsSavingPersonalDocument] = useState(false);
  const [isDeletingPersonalDocument, setIsDeletingPersonalDocument] = useState(false);
  const [payModalState, setPayModalState] = useState<{ invId: string, instNum: number, date: string, val: number } | null>(null);
  const [internalInfo, setInternalInfo] = useState('');
  const [internalFiles, setInternalFiles] = useState<string[]>([]);
  const [internalFolders, setInternalFolders] = useState<string[]>(['Geral', 'Contratos internos']);
  const [internalFolderIds, setInternalFolderIds] = useState<Record<string, string>>({});
  const [internalFolder, setInternalFolder] = useState('Geral');
  const [internalSaved, setInternalSaved] = useState(false);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [walletEntries, setWalletEntries] = useState<Array<{ id: string | number; type: 'Crédito' | 'Débito'; amount: number; description: string; date: string }>>([]);
  const [walletType, setWalletType] = useState<'Crédito' | 'Débito'>('Crédito');
  const [walletAmount, setWalletAmount] = useState('');
  const [walletDescription, setWalletDescription] = useState('');
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteFile, setNoteFile] = useState('');
  const [selectedPersonalDocumentId, setSelectedPersonalDocumentId] = useState('');
  const [folderEditModalOpen, setFolderEditModalOpen] = useState(false);
  const [folderEditDraft, setFolderEditDraft] = useState('');
  const [folderDeleteModalOpen, setFolderDeleteModalOpen] = useState(false);
  const [noteEditModalOpen, setNoteEditModalOpen] = useState(false);
  const [noteEditDraft, setNoteEditDraft] = useState('');
  const [noteDeleteModalOpen, setNoteDeleteModalOpen] = useState(false);
  const [noteActionTarget, setNoteActionTarget] = useState<InternalNote | null>(null);

  const reloadWallet = async () => {
    try {
      const result = await api(`/wallet/${client.id}`);
      if (Array.isArray(result.entries)) setWalletEntries(result.entries);
    } catch {
      // Wallet entries remain visible after the last confirmed load.
    }
  };

  useEffect(() => {
    void reloadWallet();
    const handleReload = () => { void reloadWallet(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, [client.id]);

  // Edit Client Form State
  const [editName, setEditName] = useState(client.name);
  const [editTradeName, setEditTradeName] = useState(client.tradeName || '');
  const [editContact, setEditContact] = useState(client.contact || '');
  const [editEmail, setEditEmail] = useState(client.email);
  const [editPhone, setEditPhone] = useState(client.phone);
  const [editCity, setEditCity] = useState(client.city || 'São Paulo');
  const [editState, setEditState] = useState(client.state || 'SP');

  // New Proposal Form State
  const [propService, setPropService] = useState('SRV101 — Abertura de empresa');
  const [propRps, setPropRps] = useState('RPS100 — João Carlos da Silva');
  const [propBasePrice, setPropBasePrice] = useState('2500,00');
  const [propExtra, setPropExtra] = useState('0,00');
  const [propDiscount, setPropDiscount] = useState('0');
  const [propInstallments, setPropInstallments] = useState('2');
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [availableRps, setAvailableRps] = useState<any[]>([]);

  const formatProposalInputPrice = (cents: unknown) => {
    const value = Number(cents);
    if (!Number.isFinite(value)) return '';
    return (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Mocked dynamic lists for this client
  const [proposals, setProposals] = useState(isDemoMode ? [
    {
      id: 'prop-1',
      code: 'PROP-2024-0015',
      title: 'Abertura de Empresa (LTDA)',
      serviceCode: 'SRV101',
      rpsName: 'João Carlos da Silva',
      total: 250000,
      subtotal: 250000,
      discount: 0,
      date: '28/09/2026',
      status: 'Aceita'
    }
  ] : []);

  const [contracts, setContracts] = useState(isDemoMode ? [
    {
      id: 'cont-1',
      code: 'CONT-2024-00157',
      title: 'Prestação de Serviços — Abertura Empresarial',
      serviceCode: 'SRV101',
      start: '01/10/2026',
      end: '31/10/2026',
      total: 250000,
      status: 'Assinado',
      fileName: 'contrato_social_alfa.pdf'
    }
  ] : []);

  const [invoices, setInvoices] = useState(isDemoMode ? [
    {
      id: 'fat-1',
      code: 'FAT-2024-00101',
      title: 'Honorários — Abertura de Empresa',
      due: '05/10/2026',
      total: 250000,
      status: 'Pendente',
      installments: [
        { num: 1, due: '05/10/2026', val: 125000, status: 'Pendente' },
        { num: 2, due: '05/11/2026', val: 125000, status: 'Pendente' }
      ]
    }
  ] : []);
  const [orders, setOrders] = useState<any[]>(isDemoMode ? [{
    id: 'os-105', code: 'OS105', title: 'Abertura de empresa', status: 'Em andamento', priority: 'Alta',
    start: '2026-10-01', rpsName: 'João Carlos da Silva', end: '2026-10-15'
  }] : []);
  const [personalDocuments, setPersonalDocuments] = useState<any[]>(isDemoMode ? [{
    id: 'doc-1', name: 'RG e CPF dos Sócios (Frente e Verso)', folder: 'Documentos societários', status: 'Em análise'
  }, { id: 'doc-2', name: 'Comprovante de Endereço Comercial (IPTU)', folder: 'Documentos societários', status: 'Aguardando envio' }] : []);
  const [tickets, setTickets] = useState<any[]>(isDemoMode ? [{ id: 'TK-108', code: 'TK-108', subject: 'Dúvida sobre enquadramento CNAE', status: 'Em atendimento', lastReply: 'João Carlos da Silva às 10:45' }] : []);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);

  // A client may not have a contract or an invoice yet. The API-backed
  // collections can therefore be empty, so the overview must not assume that
  // an item exists at index zero.
  const primaryContract = contracts[0];
  const primaryInvoice = invoices[0];
  const activeOrders = orders.filter((order: any) => !['Concluída', 'Concluido', 'Cancelada', 'Cancelado'].includes(String(order.status || '')));
  const primaryOrder = activeOrders[0] || orders[0];
  const pendingPersonalDocuments = personalDocuments.filter((document: any) => !['Aprovado', 'Rejeitado'].includes(String(document.status || '')));
  const pendingDocumentLabel = pendingPersonalDocuments.some((document: any) => document.status === 'Aguardando envio')
    ? 'Aguardando envio →'
    : pendingPersonalDocuments.length
      ? 'Em análise →'
      : 'Nenhuma pendência documental';

  const reloadClientData = async () => {
    try {
      const state = await api('/state');
      const clientId = String(client.id);
      const remoteProposals = (Array.isArray(state.proposals) ? state.proposals : [])
        .filter((proposal: any) => String(proposal.clientId) === clientId)
        .map((proposal: any) => ({
          ...proposal,
          id: String(proposal.id),
          serviceCode: proposal.service?.code || `SRV${proposal.serviceId || ''}`,
          rpsName: proposal.rpsName || proposal.rps?.name || '—',
          date: formatDate(proposal.createdAt || proposal.created || proposal.updatedAt),
          subtotal: Number(proposal.subtotal || proposal.total || 0),
          discount: Number(proposal.discount || 0),
          total: Number(proposal.total || 0)
        }));
      const remoteContracts = (Array.isArray(state.contracts) ? state.contracts : [])
        .filter((contract: any) => String(contract.clientId) === clientId)
        .map((contract: any) => ({
          ...contract,
          id: String(contract.id),
          start: formatDate(contract.start),
          end: contract.end ? formatDate(contract.end) : '—',
          fileName: contract.fileName || `${contract.code || 'contrato'}.pdf`,
          total: Number(contract.total || 0)
        }));
      const remoteInvoices = (Array.isArray(state.invoices) ? state.invoices : [])
        .filter((invoice: any) => String(invoice.clientId) === clientId)
        .map((invoice: any) => ({
          ...invoice,
          id: String(invoice.id),
          due: formatDate(invoice.due),
          total: Number(invoice.total || 0),
          installments: (Array.isArray(invoice.installments) ? invoice.installments : []).map((installment: any, index: number) => ({
            ...installment,
            num: installment.number ?? installment.id ?? index + 1,
            due: formatDate(installment.due),
            val: Number(installment.amount ?? installment.val ?? 0),
            status: installment.status || 'Pendente'
          }))
        }));
      const remoteOrders = (Array.isArray(state.orders) ? state.orders : [])
        .filter((order: any) => String(order.clientId) === clientId)
        .map((order: any) => ({
          ...order,
          start: order.start ? formatDate(order.start) : '—',
          end: order.end ? formatDate(order.end) : '—'
        }));
      let remotePersonalDocuments: any[] = [];
      try {
        const personalState = await api(`/clients/${clientId}/personal-documents`);
        remotePersonalDocuments = Array.isArray(personalState.documents) ? personalState.documents : [];
      } catch {
        // The profile remains usable if the personal-document endpoint is temporarily unavailable.
      }
      let remoteInternalInfo: any = null;
      try {
        remoteInternalInfo = await api(`/clients/${clientId}/internal-info`);
      } catch {
        // Internal information remains usable with the local draft if unavailable.
      }
      const remoteTickets = (Array.isArray(state.tickets) ? state.tickets : [])
        .filter((ticket: any) => String(ticket.clientId) === clientId);
      const remoteHistory = (Array.isArray(state.history) ? state.history : [])
        .filter((entry: any) => String(entry.clientId || '') === clientId);

      if (Array.isArray(state.services)) setAvailableServices(state.services);
      if (Array.isArray(state.rps)) setAvailableRps(state.rps);
      if (Array.isArray(state.services) && state.services.length) {
        const currentService = state.services.find((service: any) => `${service.code} — ${service.name}` === propService);
        if (!currentService) {
          const firstService = state.services.find((service: any) => service.active !== false) || state.services[0];
          setPropService(`${firstService.code} — ${firstService.name}`);
          setPropBasePrice(formatProposalInputPrice(firstService.price));
        } else if (propBasePrice.trim() === '' || propBasePrice === '2500,00') {
          setPropBasePrice(formatProposalInputPrice(currentService.price));
        }
      }
      if (Array.isArray(state.rps) && state.rps.length) {
        const currentRps = state.rps.find((rps: any) => `${rps.code} — ${rps.name}` === propRps);
        if (!currentRps) {
          const firstRps = state.rps.find((rps: any) => rps.active !== false) || state.rps[0];
          setPropRps(`${firstRps.code} — ${firstRps.name}`);
        }
      }
      setProposals(remoteProposals);
      setContracts(remoteContracts);
      setInvoices(remoteInvoices);
      setOrders(remoteOrders);
      setPersonalDocuments(remotePersonalDocuments);
      setTickets(remoteTickets);
      setHistoryEntries(remoteHistory);
      if (remoteInternalInfo) {
        const remoteFolderRecords = Array.isArray(remoteInternalInfo.folders)
          ? remoteInternalInfo.folders.filter((folder: any) => String(folder.name || '').trim())
          : [];
        const folders: string[] = Array.from(new Set<string>(remoteFolderRecords.map((folder: any) => String(folder.name).trim())));
        setInternalFolderIds(Object.fromEntries(remoteFolderRecords.map((folder: any) => [String(folder.name).trim(), String(folder.id)])));
        setInternalFolders(folders);
        setInternalNotes(Array.isArray(remoteInternalInfo.notes) ? remoteInternalInfo.notes : []);
        setInternalFolder((current) => folders.includes(current) ? current : (folders[0] || ''));
      }
      const deletionRequests = (Array.isArray(state.accountDeletionRequests) ? state.accountDeletionRequests : [])
        .filter((request: any) => String(request.clientId) === clientId)
        .sort((a: any, b: any) => String(b.requestedAt || b.createdAt).localeCompare(String(a.requestedAt || a.createdAt)));
      setAccountDeletionRequest(deletionRequests.find((request: any) => request.status === 'pending') || deletionRequests[0] || null);
    } catch {
      // Keep the last confirmed data visible if the shared API is temporarily unavailable.
    }
  };

  useEffect(() => {
    void reloadClientData();
    const handleReload = () => { void reloadClientData(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, [client.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const openPersonalDocumentForm = (document: any | null = null) => {
    setEditingPersonalDocument(document);
    setPersonalDocumentTitle(document?.title || document?.name || '');
    setPersonalDocumentCategory(document?.category || 'Cadastro pessoal');
    setIsPersonalDocumentModalOpen(true);
  };

  const closePersonalDocumentForm = (force = false) => {
    if (isSavingPersonalDocument && !force) return;
    setIsPersonalDocumentModalOpen(false);
    setEditingPersonalDocument(null);
    setPersonalDocumentTitle('');
    setPersonalDocumentCategory('Cadastro pessoal');
  };

  const handleSavePersonalDocument = async () => {
    const title = personalDocumentTitle.trim();
    if (!title) {
      showToast('Informe qual documento pessoal deve ser enviado.');
      return;
    }
    setIsSavingPersonalDocument(true);
    try {
      const payload = {
        title,
        category: personalDocumentCategory.trim() || 'Cadastro pessoal'
      };
      if (editingPersonalDocument) {
        await api(`/personal-documents/${editingPersonalDocument.id}`, payload, 'PATCH');
      } else {
        await api(`/clients/${client.id}/personal-documents`, payload);
      }
      await reloadClientData();
      const message = editingPersonalDocument
        ? 'Solicitação de documento pessoal atualizada.'
        : 'Solicitação de documento pessoal criada.';
      closePersonalDocumentForm(true);
      showToast(message);
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível salvar o documento pessoal.');
    } finally {
      setIsSavingPersonalDocument(false);
    }
  };

  const handleDeletePersonalDocument = async () => {
    if (!personalDocumentToDelete || isDeletingPersonalDocument) return;
    setIsDeletingPersonalDocument(true);
    try {
      await api(`/personal-documents/${personalDocumentToDelete.id}`, undefined, 'DELETE');
      await reloadClientData();
      setPersonalDocumentToDelete(null);
      showToast('Solicitação de documento pessoal excluída.');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível excluir o documento pessoal.');
    } finally {
      setIsDeletingPersonalDocument(false);
    }
  };

  const resetInternalNoteDraft = () => {
    setNoteDraft('');
    setNoteFile('');
    setSelectedPersonalDocumentId('');
  };

  const handleCreateInternalFolder = async () => {
    const name = window.prompt('Nome da nova pasta');
    if (!name?.trim()) return;
    const normalizedName = name.trim();
    if (internalFolders.some((folder) => folder.toLowerCase() === normalizedName.toLowerCase())) {
      setInternalFolder(internalFolders.find((folder) => folder.toLowerCase() === normalizedName.toLowerCase()) || normalizedName);
      showToast('Esta pasta já existe.');
      return;
    }
    if (isDemoMode) {
      setInternalFolders((items) => [...items, normalizedName]);
      setInternalFolderIds((items) => ({ ...items, [normalizedName]: `demo-${Date.now()}` }));
      setInternalFolder(normalizedName);
      return;
    }
    try {
      const created = await api(`/clients/${client.id}/internal-info/folders`, { name: normalizedName });
      const createdName = String(created?.name || normalizedName);
      setInternalFolders((items) => items.includes(createdName) ? items : [...items, createdName]);
      setInternalFolder(createdName);
      showToast('Pasta interna criada.');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível criar a pasta interna.');
    }
  };

  const handleRenameInternalFolder = async () => {
    const folderId = internalFolderIds[internalFolder];
    const nextName = folderEditDraft.trim();
    if (!folderId || !nextName || nextName === internalFolder) return;
    if (internalFolders.some((folder) => folder.toLowerCase() === nextName.toLowerCase())) {
      showToast('Já existe uma pasta com esse nome.');
      return;
    }
    try {
      if (!isDemoMode) await api(`/clients/${client.id}/internal-info/folders/${folderId}`, { name: nextName }, 'PATCH');
      setInternalFolders((items) => items.map((folder) => folder === internalFolder ? nextName : folder));
      setInternalFolderIds((items) => { const next = { ...items, [nextName]: folderId }; delete next[internalFolder]; return next; });
      setInternalFolder(nextName);
      setInternalNotes((items) => items.map((note) => note.folder === internalFolder ? { ...note, folder: nextName } : note));
      setFolderEditModalOpen(false);
      setFolderEditDraft('');
      showToast('Pasta interna renomeada.');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível renomear a pasta.');
    }
  };

  const handleDeleteInternalFolder = async () => {
    const folderId = internalFolderIds[internalFolder];
    if (!folderId) {
      showToast('Não foi possível identificar esta pasta. Atualize a tela e tente novamente.');
      return;
    }
    try {
      if (!isDemoMode) {
        await api(`/clients/${client.id}/internal-info/folders/${folderId}`, undefined, 'DELETE');
        await reloadClientData();
        setFolderDeleteModalOpen(false);
        showToast('Pasta interna excluída.');
        return;
      }
      const nextFolders = internalFolders.filter((folder) => folder !== internalFolder);
      const nextFolder = nextFolders[0] || '';
      setInternalFolders(nextFolders);
      setInternalFolderIds((items) => { const next = { ...items }; delete next[internalFolder]; return next; });
      setInternalFolder(nextFolder);
      setFolderDeleteModalOpen(false);
      showToast('Pasta interna excluída.');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível excluir a pasta. Verifique se ela possui registros.');
    }
  };

  const handleSaveInternalNote = async () => {
    const text = noteDraft.trim();
    if (!text) return;
    if (!internalFolder) {
      showToast('Crie ou selecione uma pasta interna antes de adicionar um registro.');
      return;
    }
    const personalDocument = personalDocuments.find((document: any) => String(document.id) === String(selectedPersonalDocumentId));
    const localNote: InternalNote = {
      id: Date.now(),
      folder: internalFolder,
      text,
      date: new Date().toLocaleDateString('pt-BR'),
      file: noteFile || undefined,
      personalDocumentId: personalDocument ? String(personalDocument.id) : null,
      personalDocument: personalDocument ? {
        id: String(personalDocument.id),
        title: personalDocument.title || personalDocument.name || 'Documento pessoal',
        category: personalDocument.category || 'Cadastro pessoal',
        status: personalDocument.status || 'Aguardando envio',
        fileId: personalDocument.versions?.[personalDocument.versions.length - 1]?.fileId || null,
        fileName: personalDocument.versions?.[personalDocument.versions.length - 1]?.fileName || null
      } : null
    };
    try {
      if (isDemoMode) {
        setInternalNotes((items) => [...items, localNote]);
      } else {
        const result = await api(`/clients/${client.id}/internal-info/notes`, {
          folder: internalFolder,
          text,
          file: noteFile || undefined,
          personalDocumentId: personalDocument ? String(personalDocument.id) : undefined
        });
        setInternalNotes((items) => [...items, result?.note || localNote]);
      }
      resetInternalNoteDraft();
      setNoteModalOpen(false);
      showToast(personalDocument ? 'Observação salva com documento pessoal anexado.' : 'Observação interna salva.');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível salvar a observação interna.');
    }
  };

  const handleEditInternalNote = async () => {
    const target = noteActionTarget || selectedNote;
    if (!target) return;
    const nextText = noteEditDraft.trim();
    if (!nextText || nextText === target.text) return;
    try {
      let updated = { ...target, text: nextText };
      if (!isDemoMode) {
        const result = await api(`/clients/${client.id}/internal-info/notes/${target.id}`, { text: nextText }, 'PATCH');
        updated = result?.note || updated;
      }
      setInternalNotes((items) => items.map((note) => String(note.id) === String(target.id) ? updated : note));
      setNoteEditModalOpen(false);
      setNoteEditDraft('');
      setNoteActionTarget(null);
      showToast('Registro interno atualizado.');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível editar o registro.');
    }
  };

  const handleDeleteInternalNote = async () => {
    const target = noteActionTarget || selectedNote;
    if (!target) return;
    try {
      if (!isDemoMode) await api(`/clients/${client.id}/internal-info/notes/${target.id}`, undefined, 'DELETE');
      setInternalNotes((items) => items.filter((note) => String(note.id) !== String(target.id)));
      setSelectedNote(null);
      setNoteDeleteModalOpen(false);
      setNoteActionTarget(null);
      showToast('Registro interno excluído.');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível excluir o registro.');
    }
  };

  const parseWalletAmount = (value: string) => {
    const normalized = String(value || '').trim().replace(/\s/g, '');
    if (!normalized) return NaN;
    const brazilian = normalized.includes(',')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized;
    return Number(brazilian);
  };

  const handleSaveClientEdit = async () => {
    const updated = {
      ...client,
      name: editName,
      tradeName: editTradeName,
      contact: editContact,
      email: editEmail,
      phone: editPhone,
      city: editCity,
      state: editState
    };
    try {
      await api(`/clients/${client.id}`, updated, 'PATCH');
      setClient(updated);
      setIsEditModalOpen(false);
      showToast('Dados cadastrais do cliente atualizados com sucesso!');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível atualizar o cadastro do cliente.');
    }
  };

  const handleDeleteClient = async () => {
    if (isDeletingClient) return;
    setIsDeletingClient(true);
    try {
      await api(`/clients/${client.id}`, undefined, 'DELETE');
      setIsDeleteClientModalOpen(false);
      setIsEditModalOpen(false);
      window.dispatchEvent(new Event('gsa:reload'));
      showToast('Cadastro do cliente desativado com sucesso.');
      onBack();
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível excluir o cadastro do cliente.');
    } finally {
      setIsDeletingClient(false);
    }
  };

  const handleApproveAccountDeletion = async () => {
    if (!accountDeletionRequest || isApprovingDeletion) return;
    setIsApprovingDeletion(true);
    try {
      await api(`/account-deletion-requests/${accountDeletionRequest.id}/approve`, {}, 'PATCH');
      setClient((current) => ({ ...current, active: false }));
      setAccountDeletionRequest({ ...accountDeletionRequest, status: 'approved', approvedAt: new Date().toISOString() });
      setIsDeletionRequestModalOpen(false);
      showToast('Exclusão aprovada. A conta do cliente foi desativada.');
      window.dispatchEvent(new Event('gsa:reload'));
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível aprovar a exclusão da conta.');
    } finally {
      setIsApprovingDeletion(false);
    }
  };

  const handlePermanentDeleteClient = async () => {
    if (isPermanentlyDeletingClient) return;
    setIsPermanentlyDeletingClient(true);
    try {
      await api(`/clients/${client.id}/permanent`, undefined, 'DELETE');
      setIsPermanentDeleteModalOpen(false);
      setIsEditModalOpen(false);
      window.dispatchEvent(new Event('gsa:reload'));
      showToast('Cadastro e dados vinculados excluídos definitivamente.');
      onBack();
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível excluir definitivamente o cadastro.');
    } finally {
      setIsPermanentlyDeletingClient(false);
    }
  };

  const handleCreateProposal = async () => {
    const cleanBase = parseFloat(propBasePrice.replace(/\./g, '').replace(',', '.')) || 0;
    const cleanExtra = parseFloat(propExtra.replace(/\./g, '').replace(',', '.')) || 0;
    const cleanDisc = parseFloat(propDiscount) || 0;

    const serviceCode = propService.split(' — ')[0] || 'SRV101';
    const rpsCode = propRps.split(' — ')[0] || 'RPS100';
    try {
      await api('/proposals', {
        clientId: Number(client.id),
        serviceId: Number(serviceCode.replace(/\D/g, '')),
        rpsId: Number(rpsCode.replace(/\D/g, '')),
        rpsName: propRps.split(' — ')[1] || '—',
        title: propService.split(' — ')[1] || 'Novo Serviço',
        description: propService.split(' — ')[1] || 'Novo Serviço',
        base: cleanBase,
        extra: cleanExtra,
        extraName: '',
        discount: cleanDisc,
        discountType: 'percent',
        term: 'fixed',
        start: new Date().toISOString().slice(0, 10),
        end: ''
      });
      await reloadClientData();
      setIsNewProposalModalOpen(false);
      setActiveTab('proposals');
      showToast('Proposta comercial criada e enviada ao cliente!');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível criar a proposta no servidor.');
    }
  };

  const promptPayInstallment = (invId: string, instNum: number, val: number) => {
    // Current date format YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    setPayModalState({ invId, instNum, date: today, val });
  };

  const handlePayInstallment = async () => {
    if (!payModalState) return;
    const { invId, instNum, date } = payModalState;
    try {
      await api(`/invoices/${invId}/pay/${instNum}`, {
        amount: payModalState.val,
        walletAmount: 0,
        date,
        method: 'Pix',
        installments: 1,
        walletRemainder: 'pending'
      }, 'PATCH');
      await reloadClientData();
      setSelectedInvoiceModal(null);
      setPayModalState(null);
      showToast(`Pagamento da parcela ${instNum} registrado com sucesso!`);
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível registrar o pagamento.');
    }
  };

  const handleDownloadPdf = (fileName: string) => {
    showToast(`Download iniciado: ${fileName}`);
    // Trigger virtual download
    const blob = new Blob([`Documento oficial gerado pelo GSA HUB 3.0 para ${client.name}.`], {
      type: 'application/pdf'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const tabs = [
    { id: 'overview', label: 'Resumo 360°' },
    { id: 'data', label: 'Dados Cadastrais' },
    { id: 'proposals', label: 'Propostas' },
    { id: 'contracts', label: 'Contratos' },
    { id: 'orders', label: 'Ordens de Serviço' },
    { id: 'finance', label: 'Financeiro' },
    { id: 'wallet', label: 'Carteira' },
    { id: 'documents', label: 'Documentos Pessoais' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'history', label: 'Histórico' },
    { id: 'information', label: 'Informações' }
  ];

  return (
    <div className="client360-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#10b981',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontWeight: 600,
            fontSize: 14
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Back button */}
      <button
        type="button"
        className="back-btn"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#2563eb',
          fontWeight: 700,
          fontSize: 13,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          marginBottom: 16
        }}
      >
        <ArrowLeft size={16} /> Voltar para lista de clientes
      </button>

      {/* Header Banner */}
      <div className="responsive-row client360-header"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: 24,
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div className="responsive-row client360-identity" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="client360-avatar"
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {client.type === 'PJ' ? <Building2 size={28} /> : <User size={28} />}
          </div>
          <div className="client360-info">
            <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{client.name}</h1>
              <span className="pill pill--blue" style={{ fontSize: 12, fontWeight: 800 }}>
                {client.code}
              </span>
              <span className="pill pill--gray" style={{ fontSize: 12 }}>
                {client.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
              </span>
              <Badge status={client.active ? 'Ativo' : 'Inativo'} variant={client.active ? 'green' : 'gray'} />
            </div>
            <div className="responsive-row client360-contacts" style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, fontSize: 13, color: '#64748b' }}>
              <span>CNPJ/CPF: <strong>{client.tax}</strong></span>
              <span>•</span>
              <span className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Mail size={14} /> {client.email}
              </span>
              <span>•</span>
              <span className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={14} /> {client.phone}
              </span>
            </div>
          </div>
        </div>

        <div className="responsive-row client360-actions" style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Edit size={14} />}
            onClick={() => setIsEditModalOpen(true)}
          >
            Editar Cadastro
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setIsNewProposalModalOpen(true)}
          >
            Nova Proposta
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="responsive-row client360-tabs" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 20, overflowX: 'auto' }}>
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                color: isActive ? '#2563eb' : '#64748b',
                fontWeight: isActive ? 800 : 500,
                fontSize: 14,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 150ms ease'
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Overview / Resumo 360° */}
      {activeTab === 'overview' && (
        <div>
          {/* Quick Metrics */}
          <div className="grid-4-cols client360-metrics" style={{ marginBottom: 20 }}>
            <Card style={{ padding: 18, cursor: 'pointer' }} onClick={() => setActiveTab('orders')}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>OS em Andamento</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{activeOrders.length} Ativa{activeOrders.length === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 12, color: '#2563eb', marginTop: 2 }}>{activeOrders[0] ? `${activeOrders[0].code} — Ver etapas →` : primaryOrder ? `${primaryOrder.code} — Ver histórico →` : 'Nenhuma OS em andamento'}</div>
            </Card>
            <Card style={{ padding: 18, cursor: 'pointer' }} onClick={() => setActiveTab('contracts')}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Contratos Vigentes</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                {contracts.length} Contrato
              </div>
              <div style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>
                {primaryContract ? `${primaryContract.code} →` : 'Nenhum contrato vigente'}
              </div>
            </Card>
            <Card style={{ padding: 18, cursor: 'pointer' }} onClick={() => setActiveTab('finance')}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Faturas em Aberto</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                {formatMoney(primaryInvoice?.total ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>
                {primaryInvoice?.due ? `Vencimento em ${primaryInvoice.due} →` : 'Nenhuma fatura em aberto'}
              </div>
            </Card>
            <Card style={{ padding: 18, cursor: 'pointer' }} onClick={() => setActiveTab('documents')}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Pendências pessoais</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{pendingPersonalDocuments.length}</div>
              <div style={{ fontSize: 12, color: pendingPersonalDocuments.length ? '#ef4444' : '#10b981', marginTop: 2 }}>{pendingDocumentLabel}</div>
            </Card>
          </div>

          {accountDeletionRequest?.status === 'pending' && (
            <Card className="client360-deletion-request-card" style={{ padding: 18, marginBottom: 20 }}>
              <div className="client360-deletion-request-content">
                <div className="client360-deletion-request-icon"><Trash2 size={18} /></div>
                <div className="client360-deletion-request-copy">
                  <strong>Solicitação de exclusão da conta pendente</strong>
                  <span>Recebida em {formatDate(accountDeletionRequest.requestedAt || accountDeletionRequest.createdAt)}. Revise o motivo antes de aprovar.</span>
                </div>
                <Button variant="danger" size="sm" onClick={() => setIsDeletionRequestModalOpen(true)}>Ver solicitação</Button>
              </div>
            </Card>
          )}

          {/* Active OS Highlight */}
          {primaryOrder ? <Card className="client360-order" style={{ padding: 24, marginBottom: 20 }}>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pill pill--blue" style={{ fontSize: 12 }}>{primaryOrder.code}</span>
                <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                  {primaryOrder.title || primaryOrder.serviceName || 'Ordem de Serviço'}
                </span>
              </div>
              <Badge
                status={primaryOrder.status || 'Em andamento'}
                variant={primaryOrder.status === 'Concluída' || primaryOrder.status === 'Concluido' ? 'green' : primaryOrder.status === 'Cancelada' || primaryOrder.status === 'Cancelado' ? 'red' : 'yellow'}
              />
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Responsável pelo Serviço (RPS): <strong>{primaryOrder.rpsName || '—'}</strong> • Prazo final: <strong>{primaryOrder.end || '—'}</strong>
            </p>
            <div className="responsive-row client360-progress" style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Progresso Operacional das Etapas:
                </div>
                <div className="responsive-row" style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>✓ 1. Coleta documental</span>
                  <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>● 2. Elaboração do Contrato</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>○ 3. Registro e Alvará</span>
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={() => setActiveTab('orders')}>
                Gerenciar Etapas
              </Button>
            </div>
          </Card> : <Card style={{ padding: 24, marginBottom: 20, color: '#64748b' }}>Nenhuma Ordem de Serviço vinculada a este cliente.</Card>}
        </div>
      )}

      {/* Tab: Dados Cadastrais */}
      {activeTab === 'data' && (
        <Card style={{ padding: 24 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              Ficha Cadastral Completa
            </h2>
            <Button
              variant="secondary"
              size="sm"
              icon={<Edit size={14} />}
              onClick={() => setIsEditModalOpen(true)}
            >
              Editar Informações
            </Button>
          </div>
          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14 }}>
            <div>
              <span style={{ color: '#64748b', fontSize: 12 }}>Razão Social / Nome:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{client.name}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: 12 }}>Nome Fantasia:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{client.tradeName || '—'}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: 12 }}>CNPJ / CPF:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{client.tax}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: 12 }}>Pessoa de Contato:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{client.contact || '—'}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: 12 }}>E-mail:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{client.email}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: 12 }}>Telefone / WhatsApp:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{client.phone}</div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#64748b', fontSize: 12 }}>Endereço Completo:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                {[client.street, client.number].filter(Boolean).join(', ') || 'Endereço não informado'}
                {client.district ? ` — ${client.district}` : ''}{client.city || client.state ? `, ${client.city || '—'}/${client.state || '—'}` : ''}{client.cep ? ` — CEP: ${client.cep}` : ''}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab: Propostas */}
      {activeTab === 'proposals' && (
        <Card style={{ padding: 24 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Histórico de Propostas Comerciais</h2>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setIsNewProposalModalOpen(true)}
            >
              Nova Proposta
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {proposals.map((p) => (
              <div className="responsive-row"
                key={p.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc'
                }}
              >
                <div>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill pill--blue" style={{ fontSize: 11 }}>{p.code}</span>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{p.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Enviada em {p.date} • Responsável: {p.rpsName}
                  </div>
                </div>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                    {formatMoney(p.total)}
                  </span>
                  <Badge status={p.status} variant={p.status === 'Aceita' ? 'green' : 'yellow'} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedProposalModal(p)}
                  >
                    Ver Detalhes
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab: Contratos */}
      {activeTab === 'contracts' && (
        <Card style={{ padding: 24 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Contratos Vinculados</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {contracts.map((c) => (
              <div className="responsive-row"
                key={c.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc'
                }}
              >
                <div>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill pill--blue" style={{ fontSize: 11 }}>{c.code}</span>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{c.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Vigência: {c.start} até {c.end} • Arquivo: {c.fileName}
                  </div>
                </div>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Badge status={c.status} variant="green" />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Download size={14} />}
                    onClick={() => handleDownloadPdf(c.fileName)}
                  >
                    Baixar PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab: Ordens de Serviço */}
      {activeTab === 'orders' && (
        <Card style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Ordens de Serviço do Cliente</h2>
          {orders.length === 0 ? <div style={{ color: '#64748b' }}>Nenhuma Ordem de Serviço vinculada a este cliente.</div> : orders.map((order) => (
            <div key={order.id || order.code} className="responsive-row" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pill pill--blue" style={{ fontSize: 11 }}>{order.code || `OS${order.id}`}</span>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{order.title || order.serviceName || 'Ordem de Serviço'}</span>
                  {order.priority && <span className="pill pill--red" style={{ fontSize: 10 }}>Prioridade {order.priority}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Início: {order.start || '—'} • RPS: {order.rpsName || '—'}
                </div>
              </div>
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Badge status={order.status || 'Em andamento'} variant="yellow" />
                <Button variant="primary" size="sm" onClick={() => { onNavigateToOrder?.(order.code || String(order.id)); showToast(`Acessando o fluxo operacional da ${order.code || order.id}...`); }}>
                  Abrir OS
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Tab: Financeiro */}
      {activeTab === 'finance' && (
        <Card style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Faturas e Parcelas</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {invoices.map((inv) => (
              <div className="responsive-row"
                key={inv.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc'
                }}
              >
                <div>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill pill--blue" style={{ fontSize: 11 }}>{inv.code}</span>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{inv.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Vencimento: {inv.due} • Total: {formatMoney(inv.total)} ({inv.installments.length} parcelas)
                  </div>
                </div>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Badge
                    status={inv.status}
                    variant={inv.status === 'Pago' ? 'green' : 'yellow'}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedInvoiceModal(inv)}
                  >
                    Ver Fatura & Parcelas
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'wallet' && (
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}><Wallet size={20} color="#2563eb" /><h2 style={{ margin: 0, fontSize: 18 }}>Carteira do Cliente</h2></div>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 150px 1fr auto', gap: 10, alignItems: 'end', marginBottom: 18 }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Tipo</label><select className="form-input" value={walletType} onChange={(e) => setWalletType(e.target.value as 'Crédito' | 'Débito')}><option>Crédito</option><option>Débito</option></select></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Valor (R$)</label><input className="form-input" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} placeholder="0,00" /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Descrição</label><input className="form-input" value={walletDescription} onChange={(e) => setWalletDescription(e.target.value)} placeholder="Motivo do lançamento" /></div>
            <Button variant="primary" onClick={async () => {
              const amount = parseWalletAmount(walletAmount);
              const centsValue = Math.round(amount * 100);
              if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9 || !Number.isSafeInteger(centsValue) || centsValue <= 0) {
                showToast('Informe um valor válido entre R$ 0,01 e R$ 1.000.000.000,00.');
                return;
              }
              try {
                await api(`/wallet/${client.id}`, { type: walletType, amount, description: walletDescription || 'Saldo da carteira' });
                await reloadWallet();
                setWalletAmount('');
                setWalletDescription('');
              } catch (error: any) {
                showToast(error?.message || 'Não foi possível lançar na carteira.');
              }
            }}>Lançar</Button>
          </div>
          <div style={{ padding: 16, borderRadius: 10, background: '#eff6ff', marginBottom: 16, fontWeight: 800 }}>Saldo disponível: {formatMoney(walletEntries.reduce((sum, e) => sum + (e.type === 'Crédito' ? e.amount : -e.amount), 0))}</div>
          {walletEntries.map((entry) => <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}><span><strong style={{ color: entry.type === 'Crédito' ? '#047857' : '#dc2626' }}>{entry.type}</strong> · {entry.description}<small style={{ display: 'block', color: '#64748b' }}>{new Date(entry.date).toLocaleString('pt-BR')}</small></span><strong>{entry.type === 'Crédito' ? '+' : '-'} {formatMoney(entry.amount)}</strong></div>)}
        </Card>
      )}

      {/* Tab: Documentos Pessoais do cliente */}
      {activeTab === 'documents' && (
        <Card style={{ padding: 24 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Documentos Pessoais e pendências</h2>
              <p style={{ color: '#64748b', fontSize: 13, margin: '5px 0 0' }}>
                Documentos cadastrais solicitados diretamente a este cliente.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => openPersonalDocumentForm()}
            >
              Solicitar Documento Pessoal
            </Button>
          </div>
          <div style={{ padding: '11px 13px', borderRadius: 9, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: 12, marginBottom: 16 }}>
            Os documentos de serviços ficam no módulo <strong>Documentos</strong> e continuam sendo exibidos ao cliente por lá. Esta área contém somente documentos pessoais deste perfil.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {personalDocuments.length === 0 ? <div style={{ color: '#64748b' }}>Nenhum documento pessoal solicitado para este cliente.</div> : personalDocuments.map((document) => (
              <div key={document.id} className="responsive-row" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{document.name || document.title || 'Documento'}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Categoria: {document.category || 'Cadastro pessoal'}</div>
                </div>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status={document.status || 'Aguardando envio'} variant={document.status === 'Em análise' ? 'yellow' : 'gray'} />
                  <Button variant="secondary" size="sm" icon={<Edit size={14} />} onClick={() => openPersonalDocumentForm(document)}>Editar</Button>
                  <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setPersonalDocumentToDelete(document)}>Excluir</Button>
                  {(document.fileId || document.fileName || document.name) && <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => setSelectedDocument(document.name || document.title || 'Documento')}>Visualizar</Button>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={isPersonalDocumentModalOpen} onClose={closePersonalDocumentForm} title={editingPersonalDocument ? 'Editar Documento Pessoal' : 'Solicitar Documento Pessoal'}>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
          Esta solicitação ficará vinculada somente ao perfil de {client.name}. Para documentos de um serviço, use o módulo Documentos.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Documento solicitado *</label>
            <input
              className="form-input"
              value={personalDocumentTitle}
              onChange={(event) => setPersonalDocumentTitle(event.target.value)}
              placeholder="Ex.: Documento de identificação do responsável"
              autoFocus
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Categoria</label>
            <input
              className="form-input"
              value={personalDocumentCategory}
              onChange={(event) => setPersonalDocumentCategory(event.target.value)}
              placeholder="Ex.: Cadastro pessoal"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
            <Button variant="secondary" style={{ flex: 1 }} disabled={isSavingPersonalDocument} onClick={() => closePersonalDocumentForm()}>Cancelar</Button>
            <Button variant="primary" style={{ flex: 1.4 }} disabled={isSavingPersonalDocument || !personalDocumentTitle.trim()} onClick={() => void handleSavePersonalDocument()}>
              {isSavingPersonalDocument ? 'Salvando...' : editingPersonalDocument ? 'Salvar alterações' : 'Solicitar documento'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!personalDocumentToDelete} onClose={() => { if (!isDeletingPersonalDocument) setPersonalDocumentToDelete(null); }} title="Excluir solicitação">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>
            Deseja excluir a solicitação <strong>{personalDocumentToDelete?.title || personalDocumentToDelete?.name}</strong> deste perfil?
          </p>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            A solicitação será removida da lista do cliente e do painel administrativo.
          </p>
          <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
            <Button variant="secondary" style={{ flex: 1 }} disabled={isDeletingPersonalDocument} onClick={() => setPersonalDocumentToDelete(null)}>Cancelar</Button>
            <Button variant="danger" style={{ flex: 1.4 }} disabled={isDeletingPersonalDocument} icon={<Trash2 size={15} />} onClick={() => void handleDeletePersonalDocument()}>
              {isDeletingPersonalDocument ? 'Excluindo...' : 'Excluir solicitação'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!selectedDocument} onClose={() => setSelectedDocument(null)} title="Visualizar documento">
        <div className="document-preview-modal"><div className="document-preview-toolbar"><FileText size={20} /><strong>{selectedDocument}</strong></div><div className="document-preview-sheet"><FileText size={42} /><h3>Pré-visualização do documento</h3><p>Este arquivo está disponível para conferência antes do download.</p></div><Button variant="primary" icon={<Download size={15} />} style={{ width:'100%', marginTop:14 }} onClick={() => selectedDocument && handleDownloadPdf('documentos_socios_alfa.pdf')}>Baixar arquivo</Button></div>
      </Modal>

      {/* Tab: Tickets */}
      {activeTab === 'tickets' && (
        <Card style={{ padding: 24 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Chamados de Suporte</h2>
          </div>
          {tickets.length === 0 ? <div style={{ color: '#64748b' }}>Nenhum chamado vinculado a este cliente.</div> : tickets.map((ticket) => (
            <div key={ticket.id || ticket.code} className="responsive-row" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>#{ticket.code || ticket.id} — {ticket.subject || ticket.title || 'Chamado de suporte'}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Última atualização: {ticket.lastReply || formatDate(ticket.updatedAt || ticket.createdAt)}</div>
              </div>
              <Badge status={ticket.status || 'Aberto'} variant={ticket.status === 'Concluído' ? 'green' : 'yellow'} />
            </div>
          ))}
        </Card>
      )}

      {activeTab === 'information' && (
        <Card className="admin-client-information-card" style={{ padding: 24 }}>
          <div className="responsive-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}><div><h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:0 }}>Informações internas</h2><p style={{ color:'#64748b', fontSize:13, margin:'5px 0 0' }}>Dados exclusivos do painel administrativo.</p></div><div className="responsive-row" style={{display:'flex',gap:8,alignItems:'center'}}><Badge status="Uso interno" variant="blue" /><Button size="sm" onClick={() => void handleCreateInternalFolder()}>Nova Pasta</Button></div></div>
          <div className="internal-folder-tabs">{internalFolders.map((folder) => <button type="button" className={internalFolder === folder ? 'active' : ''} key={folder} onClick={() => setInternalFolder(folder)}><Folder size={15} />{folder}</button>)}</div>
          {internalFolders.length > 0 ? <>
            <div className="internal-folder-management"><span>Pasta atual: <strong>{internalFolder}</strong></span><div><Button variant="secondary" size="sm" icon={<Edit size={13} />} onClick={() => { setFolderEditDraft(internalFolder); setFolderEditModalOpen(true); }}>Editar pasta</Button><Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => setFolderDeleteModalOpen(true)}>Excluir pasta</Button></div></div>
            <div className="responsive-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><label className="form-label" style={{margin:0}}>Registros da pasta</label><Button size="sm" icon={<Plus size={14} />} onClick={() => setNoteModalOpen(true)}>Nova observação</Button></div>
            <div className="internal-note-grid">{internalNotes.filter((note) => note.folder === internalFolder).map((note) => <button type="button" className="internal-note-card" key={note.id} onClick={() => setSelectedNote(note)}><span>{note.date}</span><strong>{note.text}</strong>{note.personalDocument && <small><FileCheck2 size={13} />Documento pessoal: {note.personalDocument.title}</small>}{note.file && <small><FileText size={13} />{note.file}</small>}</button>)}{internalNotes.filter((note) => note.folder === internalFolder).length === 0 && <div className="internal-empty">Nenhuma observação cadastrada nesta pasta.</div>}</div>
          </> : <div className="internal-empty internal-folder-empty">Nenhuma pasta interna cadastrada. Clique em Nova Pasta para criar uma pasta.</div>}
          <div style={{ marginTop:16, padding:12, borderRadius:10, background:'#eff6ff', color:'#1d4ed8', fontSize:12 }}>Estas informações permanecem disponíveis somente para a equipe administrativa.</div>
        </Card>
      )}

      <Modal open={noteModalOpen} onClose={() => { setNoteModalOpen(false); resetInternalNoteDraft(); }} title="Nova observação interna"><div className="internal-note-modal"><div className="internal-note-modal-intro"><Folder size={18} /><span>Registro interno · Pasta {internalFolder}</span></div><div className="form-group"><label className="form-label">Observação <em>*</em></label><textarea className="form-textarea internal-note-textarea" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Descreva a informação importante sobre este cliente..." /><small>Esta observação ficará visível somente para a equipe administrativa.</small></div><div className="form-group internal-note-personal-document"><label className="form-label">Anexar documento pessoal <span>(opcional)</span></label><select className="form-input" value={selectedPersonalDocumentId} onChange={(e) => setSelectedPersonalDocumentId(e.target.value)}><option value="">Nenhum documento pessoal</option>{personalDocuments.map((document: any) => <option key={document.id} value={String(document.id)}>{document.title || document.name || 'Documento pessoal'}{document.category ? ` · ${document.category}` : ''}</option>)}</select><small>Cria um vínculo interno com o documento da aba Documentos pessoais. O original continua disponível no perfil do cliente.</small>{selectedPersonalDocumentId && (() => { const document = personalDocuments.find((item: any) => String(item.id) === String(selectedPersonalDocumentId)); return document ? <div className="internal-note-personal-selected"><FileCheck2 size={15} /><span><strong>{document.title || document.name || 'Documento pessoal'}</strong><small>{document.category || 'Cadastro pessoal'} · {document.status || 'Aguardando envio'}</small></span></div> : null; })()}</div><div className="form-group internal-note-upload"><label className="form-label">Documento anexo <span>(opcional)</span></label><input type="file" className="form-input" onChange={(e) => setNoteFile(e.target.files?.[0]?.name || '')} />{noteFile && <div className="internal-note-selected-file"><FileText size={15} />{noteFile}</div>}</div><div className="internal-note-modal-actions"><Button variant="secondary" onClick={() => { setNoteModalOpen(false); resetInternalNoteDraft(); }}>Cancelar</Button><Button disabled={!noteDraft.trim()} onClick={() => void handleSaveInternalNote()}>Salvar observação</Button></div></div></Modal>
      <Modal open={!!selectedNote} onClose={() => setSelectedNote(null)} title="Detalhes da observação">{selectedNote && <div className="internal-note-detail"><span> criada em {selectedNote.date} · Pasta: {selectedNote.folder}</span><p>{selectedNote.text}</p>{selectedNote.personalDocument && <div className="internal-note-personal-detail"><FileCheck2 size={16} /><span><strong>Documento pessoal anexado</strong><small>{selectedNote.personalDocument.title} · {selectedNote.personalDocument.category || 'Cadastro pessoal'} · {selectedNote.personalDocument.status || 'Aguardando envio'}</small></span></div>}{selectedNote.file && <div><FileText size={16} />{selectedNote.file}</div>}<div className="internal-note-detail-actions"><Button variant="secondary" icon={<Edit size={14} />} onClick={() => { setNoteActionTarget(selectedNote); setNoteEditDraft(selectedNote.text || ''); setSelectedNote(null); setNoteEditModalOpen(true); }}>Editar registro</Button><Button variant="danger" icon={<Trash2 size={14} />} onClick={() => { setNoteActionTarget(selectedNote); setSelectedNote(null); setNoteDeleteModalOpen(true); }}>Excluir registro</Button></div><Button style={{width:'100%',marginTop:16}} onClick={() => setSelectedNote(null)}>Fechar</Button></div>}</Modal>

      <Modal open={folderEditModalOpen} onClose={() => { setFolderEditModalOpen(false); setFolderEditDraft(''); }} title="Editar pasta interna">
        <div className="internal-management-modal">
          <p>Você está editando somente a pasta atual: <strong>{internalFolder}</strong>. Os registros continuarão vinculados a ela.</p>
          <div className="form-group"><label className="form-label">Nome da pasta</label><input className="form-input" autoFocus value={folderEditDraft} onChange={(event) => setFolderEditDraft(event.target.value)} /></div>
          <div className="internal-note-modal-actions"><Button variant="secondary" onClick={() => { setFolderEditModalOpen(false); setFolderEditDraft(''); }}>Cancelar</Button><Button disabled={!folderEditDraft.trim()} onClick={() => void handleRenameInternalFolder()}>Salvar alterações</Button></div>
        </div>
      </Modal>

      <Modal open={folderDeleteModalOpen} onClose={() => setFolderDeleteModalOpen(false)} title="Excluir pasta interna">
        <div className="internal-management-modal">
          <p>Você está excluindo somente a pasta <strong>{internalFolder}</strong>.</p>
          <p className="internal-management-warning">Pastas que possuem registros não podem ser excluídas. Os demais registros e pastas permanecem intactos.</p>
          <div className="internal-note-modal-actions"><Button variant="secondary" onClick={() => setFolderDeleteModalOpen(false)}>Cancelar</Button><Button variant="danger" onClick={() => void handleDeleteInternalFolder()}>Excluir pasta</Button></div>
        </div>
      </Modal>

      <Modal open={noteEditModalOpen} onClose={() => { setNoteEditModalOpen(false); setNoteEditDraft(''); setNoteActionTarget(null); }} title="Editar registro">
        <div className="internal-management-modal">
          <p>Somente este registro será alterado. Os demais registros da pasta permanecerão intactos.</p>
          <div className="form-group"><label className="form-label">Texto do registro</label><textarea className="form-textarea internal-note-textarea" autoFocus value={noteEditDraft} onChange={(event) => setNoteEditDraft(event.target.value)} /></div>
          <div className="internal-note-modal-actions"><Button variant="secondary" onClick={() => { setNoteEditModalOpen(false); setNoteEditDraft(''); setNoteActionTarget(null); }}>Cancelar</Button><Button disabled={!noteEditDraft.trim()} onClick={() => void handleEditInternalNote()}>Salvar alterações</Button></div>
        </div>
      </Modal>

      <Modal open={noteDeleteModalOpen} onClose={() => { setNoteDeleteModalOpen(false); setNoteActionTarget(null); }} title="Excluir registro">
        <div className="internal-management-modal">
          <p>Somente o registro selecionado será excluído. Os demais registros continuarão disponíveis na pasta.</p>
          <div className="internal-note-modal-actions"><Button variant="secondary" onClick={() => { setNoteDeleteModalOpen(false); setNoteActionTarget(null); }}>Cancelar</Button><Button variant="danger" onClick={() => void handleDeleteInternalNote()}>Excluir registro</Button></div>
        </div>
      </Modal>

      {/* Tab: Histórico */}
      {activeTab === 'history' && (
        <Card style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>
            Histórico Permanente de Rastreabilidade (Auditoria CL)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {historyEntries.length === 0 ? <div style={{ color: '#64748b' }}>Nenhuma movimentação registrada para este cliente.</div> : historyEntries.map((entry) => (
              <div key={entry.id} className="responsive-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{entry.message || 'Movimentação registrada'}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{formatDate(entry.createdAt || entry.updatedAt)} • Autor: {entry.actor || 'Sistema'}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDITAR CADASTRO DO CLIENTE */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODAL: EDITAR CADASTRO DO CLIENTE */}
      {/* ========================================================================= */}
      <Modal open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Cadastro do Cliente">
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Mantenha os dados do cliente sempre atualizados.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Razão Social / Nome Completo *</label>
            <input
              type="text"
              className="form-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome Fantasia</label>
            <input
              type="text"
              className="form-input"
              value={editTradeName}
              onChange={(e) => setEditTradeName(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Contato Responsável</label>
              <input
                type="text"
                className="form-input"
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Telefone / WhatsApp</label>
              <input
                type="text"
                className="form-input"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">E-mail Principal de Contato</label>
            <input
              type="email"
              className="form-input"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cidade</label>
              <input
                type="text"
                className="form-input"
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">UF</label>
              <input
                type="text"
                className="form-input"
                value={editState}
                onChange={(e) => setEditState(e.target.value)}
              />
            </div>
          </div>

          <div className={`client-edit-danger-zone${client.active ? '' : ' client-edit-danger-zone--permanent'}`}>
            <div className="client-edit-danger-copy">
              <strong>{client.active ? 'Excluir cadastro' : 'Excluir definitivamente'}</strong>
              <span>
                {client.active
                  ? 'Desativa o acesso do cliente e mantém o histórico registrado.'
                  : 'Apaga definitivamente os dados vinculados. Esta ação não pode ser desfeita.'}
              </span>
            </div>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={() => client.active ? setIsDeleteClientModalOpen(true) : setIsPermanentDeleteModalOpen(true)}
            >
              {client.active ? 'Excluir cadastro' : 'Excluir definitivamente'}
            </Button>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" style={{ flex: 2 }} onClick={handleSaveClientEdit}>
              Salvar Alterações
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={isDeleteClientModalOpen}
        onClose={() => { if (!isDeletingClient) setIsDeleteClientModalOpen(false); }}
        title="Excluir cadastro"
      >
        <div className="client-delete-confirm">
          <div className="client-delete-confirm-icon" aria-hidden="true">
            <Trash2 size={20} />
          </div>
          <p>
            Tem certeza que deseja excluir o cadastro de <strong>{client.name}</strong>?
            O cliente será desativado e o histórico permanecerá registrado no sistema.
          </p>
          <div className="client-delete-confirm-actions">
            <Button
              variant="secondary"
              style={{ flex: 1 }}
              disabled={isDeletingClient}
              onClick={() => setIsDeleteClientModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              style={{ flex: 1.4 }}
              disabled={isDeletingClient}
              icon={<Trash2 size={15} />}
              onClick={() => void handleDeleteClient()}
            >
              {isDeletingClient ? 'Excluindo...' : 'Excluir cadastro'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={isPermanentDeleteModalOpen}
        onClose={() => { if (!isPermanentlyDeletingClient) setIsPermanentDeleteModalOpen(false); }}
        title="Excluir definitivamente"
      >
        <div className="client-delete-confirm client-delete-confirm--permanent">
          <div className="client-delete-confirm-icon" aria-hidden="true">
            <Trash2 size={20} />
          </div>
          <p>
            Esta ação apagará definitivamente o cadastro de <strong>{client.name}</strong> e todos os dados vinculados do banco de dados. Ela não pode ser desfeita.
          </p>
          <div className="client-delete-confirm-actions">
            <Button
              variant="secondary"
              style={{ flex: 1 }}
              disabled={isPermanentlyDeletingClient}
              onClick={() => setIsPermanentDeleteModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              style={{ flex: 1.4 }}
              disabled={isPermanentlyDeletingClient}
              icon={<Trash2 size={15} />}
              onClick={() => void handlePermanentDeleteClient()}
            >
              {isPermanentlyDeletingClient ? 'Excluindo...' : 'Excluir definitivamente'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={isDeletionRequestModalOpen}
        onClose={() => { if (!isApprovingDeletion) setIsDeletionRequestModalOpen(false); }}
        title="Solicitação de exclusão da conta"
      >
        <div className="account-deletion-review-modal">
          <div className="account-deletion-review-meta">
            <span>Cliente</span>
            <strong>{client.name} ({client.code})</strong>
          </div>
          <div className="account-deletion-review-meta">
            <span>Solicitada em</span>
            <strong>{formatDate(accountDeletionRequest?.requestedAt || accountDeletionRequest?.createdAt)}</strong>
          </div>
          <div className="account-deletion-review-reason">
            <span>Motivo informado</span>
            <p>{accountDeletionRequest?.reason || 'Nenhum motivo informado.'}</p>
          </div>
          <div className="account-deletion-review-warning">
            <AlertCircle size={17} />
            <span>Ao aprovar, o acesso do cliente será desativado imediatamente. Os dados continuarão disponíveis para o administrador até uma exclusão definitiva.</span>
          </div>
          <div className="account-deletion-review-actions">
            <Button variant="secondary" disabled={isApprovingDeletion} onClick={() => setIsDeletionRequestModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" disabled={isApprovingDeletion} icon={<Check size={15} />} onClick={() => void handleApproveAccountDeletion()}>
              {isApprovingDeletion ? 'Aprovando...' : 'Aprovar exclusão'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: NOVA PROPOSTA COMERCIAL */}
      {/* ========================================================================= */}
      <Modal open={isNewProposalModalOpen} onClose={() => setIsNewProposalModalOpen(false)} title="Criar Nova Proposta Comercial">
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Defina os parâmetros do serviço e envie a proposta para aprovação do cliente.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cliente Selecionado</label>
            <input type="text" className="form-input" value={`${client.name} (${client.code})`} disabled />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Serviço *</label>
              <select
                className="form-select"
                value={propService}
                onChange={(e) => {
                  const value = e.target.value;
                  setPropService(value);
                  const selected = availableServices.find((service: any) => `${service.code} — ${service.name}` === value);
                  if (selected) setPropBasePrice(formatProposalInputPrice(selected.price));
                }}
              >
                {(availableServices.length ? availableServices : [
                  { code: 'SRV101', name: 'Abertura de empresa' },
                  { code: 'SRV102', name: 'Alteração Contratual' }
                ]).map((service) => (
                  <option key={service.code} value={`${service.code} — ${service.name}`}>
                    {service.code} — {service.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Responsável pelo Serviço (RPS) *</label>
              <select
                className="form-select"
                value={propRps}
                onChange={(e) => setPropRps(e.target.value)}
              >
                {(availableRps.length ? availableRps : [
                  { code: 'RPS100', name: 'João Carlos da Silva' }
                ]).map((rps) => (
                  <option key={rps.code} value={`${rps.code} — ${rps.name}`}>
                    {rps.code} — {rps.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Valor Base (R$)</label>
              <input
                type="text"
                className="form-input"
                value={propBasePrice}
                onChange={(e) => setPropBasePrice(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Desconto (%)</label>
              <input
                type="text"
                className="form-input"
                value={propDiscount}
                onChange={(e) => setPropDiscount(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Número de Parcelas Padrão</label>
            <select
              className="form-select"
              value={propInstallments}
              onChange={(e) => setPropInstallments(e.target.value)}
            >
              <option value="1">1x (À vista)</option>
              <option value="2">2x mensais</option>
              <option value="3">3x mensais</option>
              <option value="4">4x mensais</option>
            </select>
          </div>

          <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', color: '#1e40af', marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Total Estimado</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {formatMoney(Math.max(0, Math.round((parseFloat(propBasePrice.replace(/\./g, '').replace(',', '.')) || 0) * (1 - (parseFloat(propDiscount.replace(',', '.')) || 0) / 100)) * 100))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setIsNewProposalModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" style={{ flex: 2 }} onClick={handleCreateProposal}>
              Gerar e Enviar Proposta
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: VER DETALHES DA PROPOSTA */}
      {/* ========================================================================= */}
      {selectedProposalModal && (
        <Modal
          open={!!selectedProposalModal}
          onClose={() => setSelectedProposalModal(null)}
          title={`Proposta Comercial ${selectedProposalModal.code}`}
        >
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Verifique os valores e o status da proposta enviada ao cliente.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                  {selectedProposalModal.title}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Emitida em {selectedProposalModal.date} • RPS: {selectedProposalModal.rpsName}
                </div>
              </div>
              <Badge
                status={selectedProposalModal.status}
                variant={selectedProposalModal.status === 'Aceita' ? 'green' : 'yellow'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>Valor Subtotal</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{formatMoney(selectedProposalModal.subtotal)}</span>
              </div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>Desconto Aplicado</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>-{formatMoney(selectedProposalModal.discount)}</span>
              </div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', padding: 16, borderRadius: 8, margin: '16px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>Total da Proposta</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8' }}>{formatMoney(selectedProposalModal.total)}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setSelectedProposalModal(null)}>
                Fechar
              </Button>
              <Button
                variant="primary"
                style={{ flex: 2 }}
                icon={<Download size={14} />}
                onClick={() => handleDownloadPdf(`${selectedProposalModal.code}.pdf`)}
              >
                Baixar PDF da Proposta
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VER FATURA & LIQUIDAR PARCELAS */}
      {/* ========================================================================= */}
      {selectedInvoiceModal && (
        <Modal
          open={!!selectedInvoiceModal}
          onClose={() => setSelectedInvoiceModal(null)}
          title={`Fatura ${selectedInvoiceModal.code} — Parcelamento`}
        >
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Verifique as parcelas e registre recebimentos individuais.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              {selectedInvoiceModal.title}
            </div>

            <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Parcelas da fatura" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Parcela</th>
                  <th style={{ padding: '8px' }}>Vencimento</th>
                  <th style={{ padding: '8px' }}>Valor</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoiceModal.installments.map((inst: any) => (
                  <tr key={inst.num} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td data-label="Parcela" style={{ padding: '10px 8px', fontWeight: 700 }}>Parcela {inst.num}</td>
                    <td data-label="Vencimento" style={{ padding: '10px 8px' }}>{inst.due}</td>
                    <td data-label="Valor" style={{ padding: '10px 8px', fontWeight: 800 }}>{formatMoney(inst.val)}</td>
                    <td data-label="Status" style={{ padding: '10px 8px' }}>
                      <Badge status={inst.status} variant={inst.status === 'Pago' ? 'green' : 'yellow'} />
                    </td>
                    <td data-label="Ação" style={{ padding: '10px 8px', textAlign: 'right' }}>
                      {inst.status !== 'Pago' ? (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => promptPayInstallment(selectedInvoiceModal.id, inst.num, inst.val)}
                        >
                          Registrar Pagamento
                        </Button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontSize: 12, color: '#047857', fontWeight: 700 }}>✓ Liquidado</span>
                          {inst.paidAt && (
                            <span style={{ fontSize: 10, color: '#64748b' }}>em {new Date(inst.paidAt).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex' }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setSelectedInvoiceModal(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de Pagamento */}
      {payModalState && (
        <Modal
          open={true}
          onClose={() => setPayModalState(null)}
          title={`Baixa de Parcela ${payModalState.instNum}`}
        >
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Confirme a data e o valor recebido para dar baixa na parcela.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data do Pagamento</label>
                <input
                  type="date"
                  className="form-input"
                  value={payModalState.date}
                  onChange={(e) => setPayModalState({ ...payModalState, date: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Valor Recebido (R$)</label>
                <input
                  type="number"
                  className="form-input"
                  disabled
                  value={(payModalState.val / 100).toFixed(2)}
                />
                <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>* Valor original faturado</span>
              </div>
            </div>
            
            <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', color: '#166534', marginTop: 4 }}>
               <div style={{ fontSize: 13, fontWeight: 600 }}>Total a ser baixado</div>
               <div style={{ fontSize: 18, fontWeight: 800 }}>R$ {(payModalState.val / 100).toFixed(2).replace('.', ',')}</div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', gap: 12 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setPayModalState(null)}>Cancelar</Button>
              <Button variant="success" style={{ flex: 2 }} icon={<CheckCircle2 size={16} />} onClick={handlePayInstallment}>Confirmar Recebimento</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Client360;
