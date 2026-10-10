import type React from 'react';
import { useEffect, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { PinInput } from '../ui/PinInput';
import { sessionService } from '../../lib/sessionService';
import { logService } from '../../lib/logService';
import { supabase } from '../../lib/supabase';
import { maskCNPJ, maskCPF, maskPhone } from '../../lib/utils';
import { validarCNPJ, validarCPF, validarEmail } from '../../utils/cpfValidator';

export type RestrictedTab = 'prestador' | 'colaborador' | 'gestao';
type ProviderStage = 'document' | 'pin' | 'first_access' | 'register';

interface RestrictedAccessModalProps {
  isOpen: boolean;
  initialTab?: RestrictedTab;
  onClose: () => void;
  onLoginAdmin: (details: { type: 'admin' | 'colaborador'; id?: string; nome?: string; modulos?: string[] }) => void;
  onLoginPrestador: (id: string) => void;
}

const emptyProvider = {
  tipo_cadastro: 'cpf' as 'cpf' | 'cnpj',
  nome_razao: '',
  nome_responsavel: '',
  documento: '',
  email: '',
  telefone: '',
  cep: '',
  numero: '',
  area_servico: '',
  observacoes: '',
};

export function RestrictedAccessModal({ isOpen, initialTab = 'prestador', onClose, onLoginAdmin, onLoginPrestador }: RestrictedAccessModalProps) {
  const [tab, setTab] = useState<RestrictedTab>(initialTab);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerStage, setProviderStage] = useState<ProviderStage>('document');
  const [providerDocument, setProviderDocument] = useState('');
  const [providerPin, setProviderPin] = useState('');
  const [providerPinConfirm, setProviderPinConfirm] = useState('');
  const [providerPhone, setProviderPhone] = useState('');
  const [pinError, setPinError] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [providerData, setProviderData] = useState(emptyProvider);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setCode('');
    resetProvider();
  }, [initialTab, isOpen]);

  const resetProvider = () => {
    setProviderStage('document');
    setProviderDocument('');
    setProviderPin('');
    setProviderPinConfirm('');
    setProviderPhone('');
    setPinError(false);
    setAttemptsLeft(null);
  };

  const switchTab = (nextTab: RestrictedTab) => {
    setTab(nextTab);
    setCode('');
    resetProvider();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: RestrictedTab) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: RestrictedTab[] = ['prestador', 'colaborador', 'gestao'];
    const currentIndex = tabs.indexOf(current);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    switchTab(nextTab);
    document.getElementById(`restricted-tab-${nextTab}`)?.focus();
  };

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await sessionService.loginAdmin(code);
      if (!data?.valid) throw new Error('Código inválido.');
      await logService.logAction({ ator_tipo: 'admin', acao: 'LOGIN', detalhes: 'Acesso Master' });
      toast.success('Acesso autorizado.');
      onLoginAdmin({ type: 'admin' });
    } catch (error: any) {
      toast.error(error?.message || 'Credencial inválida.');
    } finally {
      setLoading(false);
    }
  };

  const handleCollaboratorLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await sessionService.loginColaborador(code);
      if (!data?.valid) throw new Error('Código inválido.');
      await logService.logAction({ ator_tipo: 'colaborador', ator_id: data.id, ator_nome: data.nome, acao: 'LOGIN', detalhes: 'Acesso ao painel administrativo' });
      toast.success('Acesso autorizado.');
      onLoginAdmin({ type: 'colaborador', id: data.id, nome: data.nome, modulos: data.modulos || [] });
    } catch (error: any) {
      toast.error(error?.message || 'Credencial inválida ou usuário inativo.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderDocument = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = providerDocument.replace(/\D/g, '');
    if (![11, 14].includes(clean.length)) {
      toast.error('Informe um CPF ou CNPJ válido.');
      return;
    }
    setProviderStage('pin');
  };

  const handleProviderLogin = async () => {
    if (providerPin.length !== 4 || loading) return;
    setLoading(true);
    setPinError(false);
    try {
      const data = await sessionService.loginWithPin(providerDocument.replace(/\D/g, ''), providerPin, 'prestador');
      if (!data?.valid) {
        setAttemptsLeft(typeof data?.attempts_left === 'number' ? data.attempts_left : null);
        throw new Error(data?.error === 'blocked' ? 'Acesso temporariamente bloqueado.' : 'Documento ou senha inválidos.');
      }
      await logService.logAction({ ator_tipo: 'prestador', ator_id: data.id, ator_nome: data.nome, acao: 'LOGIN', detalhes: 'Acesso ao portal do prestador' });
      toast.success('Acesso autorizado.');
      onLoginPrestador(data.id);
    } catch (error: any) {
      setPinError(true);
      setProviderPin('');
      toast.error(error?.message || 'Documento ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderFirstAccess = () => {
    setProviderPhone('');
    setProviderPin('');
    setProviderPinConfirm('');
    toast('O primeiro acesso do prestador é liberado pelo suporte após a confirmação de identidade.');
  };

  const handleProviderRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanDocument = providerData.documento.replace(/\D/g, '');
    const validDocument = providerData.tipo_cadastro === 'cpf' ? validarCPF(cleanDocument) : validarCNPJ(cleanDocument);
    if (!validDocument || !validarEmail(providerData.email)) {
      toast.error('Documento ou e-mail inválido.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.rpc('gsa_public_register_provider', {
        p_payload: {
          ...providerData,
          documento: cleanDocument,
          telefone: providerData.telefone.replace(/\D/g, ''),
          cep: providerData.cep.replace(/\D/g, ''),
        },
      });
      if (error) throw error;
      toast.success('Pré-cadastro enviado. Aguarde a análise.');
      setProviderData(emptyProvider);
      resetProvider();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar o pré-cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Acesso Restrito">
      <div className="mb-6 flex gap-2 rounded-lg bg-neutral-100 p-1" role="tablist" aria-label="Tipo de acesso">
        {(['prestador', 'colaborador', 'gestao'] as RestrictedTab[]).map((item) => (
          <button key={item} id={`restricted-tab-${item}`} type="button" role="tab" aria-selected={tab === item} aria-controls={`restricted-panel-${item}`} tabIndex={tab === item ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, item)} onClick={() => switchTab(item)} className={`flex-1 rounded-md py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${tab === item ? 'bg-white text-neutral-900 shadow' : 'text-neutral-500'}`}>
            {item === 'prestador' ? 'Prestador' : item === 'colaborador' ? 'Equipe' : 'Gestão'}
          </button>
        ))}
      </div>

      {tab === 'gestao' && <div role="tabpanel" id="restricted-panel-gestao" aria-labelledby="restricted-tab-gestao"><CodeLoginForm label="Código Master" value={code} onChange={setCode} loading={loading} onSubmit={handleAdminLogin} buttonLabel="Entrar Master" /></div>}
      {tab === 'colaborador' && <div role="tabpanel" id="restricted-panel-colaborador" aria-labelledby="restricted-tab-colaborador"><CodeLoginForm label="Credencial de Equipe" value={code} onChange={setCode} loading={loading} onSubmit={handleCollaboratorLogin} buttonLabel="Entrar como Equipe" /></div>}

      {tab === 'prestador' && providerStage === 'document' && (
        <form role="tabpanel" id="restricted-panel-prestador" aria-labelledby="restricted-tab-prestador" onSubmit={handleProviderDocument} className="space-y-5">
          <label className="grid gap-2 text-sm font-medium text-neutral-600">CPF ou CNPJ<input required name="provider-document" autoComplete="off" inputMode="numeric" value={providerDocument} onChange={(event) => setProviderDocument(event.target.value.replace(/\D/g, '').length <= 11 ? maskCPF(event.target.value) : maskCNPJ(event.target.value))} placeholder="000.000.000-00" className="input-field" /></label>
          <button type="submit" className="btn-primary w-full">Continuar</button>
          <div className="grid gap-2 border-t border-neutral-100 pt-4 text-center text-sm"><button type="button" onClick={() => setProviderStage('first_access')} className="font-semibold text-[#8a651f] hover:underline">Ainda não tenho senha</button><button type="button" onClick={() => setProviderStage('register')} className="font-semibold text-[#142030] hover:underline">Realizar pré-cadastro</button></div>
        </form>
      )}

      {tab === 'prestador' && providerStage === 'pin' && (
        <div role="tabpanel" id="restricted-panel-prestador" aria-labelledby="restricted-tab-prestador" className="space-y-6">
          <div className="text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#142030]/5"><Lock className="h-8 w-8 text-[#142030]" /></div><p className="text-sm text-neutral-600">Digite sua senha numérica de quatro dígitos.</p></div>
          <PinInput value={providerPin} onChange={(value) => { setProviderPin(value); setPinError(false); }} error={pinError} disabled={loading} onEnter={handleProviderLogin} />
          {attemptsLeft !== null && attemptsLeft <= 2 && <p className="text-center text-xs font-semibold text-red-600">{attemptsLeft} tentativa(s) restante(s).</p>}
          <div className="flex gap-3"><button type="button" onClick={() => { setProviderStage('document'); setProviderPin(''); }} className="btn-secondary flex-1">Voltar</button><button type="button" onClick={handleProviderLogin} disabled={loading || providerPin.length !== 4} className="btn-primary flex-1">{loading ? 'Verificando...' : 'Acessar'}</button></div>
        </div>
      )}

      {tab === 'prestador' && providerStage === 'first_access' && (
        <div role="tabpanel" id="restricted-panel-prestador" aria-labelledby="restricted-tab-prestador" className="space-y-5">
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="mb-2 h-5 w-5" />Por segurança, documento e telefone não criam mais a senha diretamente. Solicite ao suporte a liberação do primeiro acesso após a confirmação da identidade.</div>
          <div className="flex gap-3"><button type="button" onClick={() => setProviderStage('document')} className="btn-secondary flex-1">Voltar</button><button type="button" onClick={handleProviderFirstAccess} className="btn-primary flex-1">Como liberar</button></div>
        </div>
      )}

      {tab === 'prestador' && providerStage === 'register' && (
        <form role="tabpanel" id="restricted-panel-prestador" aria-labelledby="restricted-tab-prestador" onSubmit={handleProviderRegister} className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-neutral-100 p-1" role="group" aria-label="Tipo de documento"><button type="button" aria-pressed={providerData.tipo_cadastro === 'cpf'} onClick={() => setProviderData({ ...providerData, tipo_cadastro: 'cpf', documento: '' })} className={`flex-1 rounded-md py-2 text-sm ${providerData.tipo_cadastro === 'cpf' ? 'bg-white shadow' : 'text-neutral-500'}`}>CPF</button><button type="button" aria-pressed={providerData.tipo_cadastro === 'cnpj'} onClick={() => setProviderData({ ...providerData, tipo_cadastro: 'cnpj', documento: '' })} className={`flex-1 rounded-md py-2 text-sm ${providerData.tipo_cadastro === 'cnpj' ? 'bg-white shadow' : 'text-neutral-500'}`}>CNPJ</button></div>
          <label className="grid gap-2 text-sm font-medium text-neutral-600">{providerData.tipo_cadastro === 'cpf' ? 'Nome completo' : 'Razão social'}<input required name="nome-razao" autoComplete={providerData.tipo_cadastro === 'cpf' ? 'name' : 'organization'} value={providerData.nome_razao} onChange={(event) => setProviderData({ ...providerData, nome_razao: event.target.value })} className="input-field" maxLength={180} /></label>
          {providerData.tipo_cadastro === 'cnpj' && <label className="grid gap-2 text-sm font-medium text-neutral-600">Nome do responsável<input required name="nome-responsavel" autoComplete="name" value={providerData.nome_responsavel} onChange={(event) => setProviderData({ ...providerData, nome_responsavel: event.target.value })} className="input-field" maxLength={180} /></label>}
          <label className="grid gap-2 text-sm font-medium text-neutral-600">{providerData.tipo_cadastro === 'cpf' ? 'CPF' : 'CNPJ'}<input required name="documento" autoComplete="off" inputMode="numeric" value={providerData.documento} onChange={(event) => setProviderData({ ...providerData, documento: providerData.tipo_cadastro === 'cpf' ? maskCPF(event.target.value) : maskCNPJ(event.target.value) })} className="input-field" /></label>
          <label className="grid gap-2 text-sm font-medium text-neutral-600">E-mail<input required type="email" name="email" autoComplete="email" value={providerData.email} onChange={(event) => setProviderData({ ...providerData, email: event.target.value })} className="input-field" maxLength={254} /></label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium text-neutral-600">Telefone<input required name="telefone" type="tel" inputMode="tel" autoComplete="tel" value={providerData.telefone} onChange={(event) => setProviderData({ ...providerData, telefone: maskPhone(event.target.value) })} className="input-field" maxLength={15} /></label>
            <label className="grid gap-2 text-sm font-medium text-neutral-600">CEP<input required name="cep" inputMode="numeric" autoComplete="postal-code" value={providerData.cep} onChange={(event) => setProviderData({ ...providerData, cep: event.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2') })} className="input-field" maxLength={9} /></label>
            <label className="grid gap-2 text-sm font-medium text-neutral-600">Número<input required name="numero" inputMode="numeric" autoComplete="address-line2" value={providerData.numero} onChange={(event) => setProviderData({ ...providerData, numero: event.target.value })} className="input-field" maxLength={20} /></label>
          </div>
          <label className="grid gap-2 text-sm font-medium text-neutral-600">Área de prestação de serviço<input required name="area-servico" value={providerData.area_servico} onChange={(event) => setProviderData({ ...providerData, area_servico: event.target.value })} className="input-field" maxLength={180} /></label>
          <label className="grid gap-2 text-sm font-medium text-neutral-600">Observações<textarea name="observacoes" rows={2} maxLength={2000} value={providerData.observacoes} onChange={(event) => setProviderData({ ...providerData, observacoes: event.target.value })} className="input-field resize-none" /></label>
          <div className="flex gap-3"><button type="button" onClick={() => setProviderStage('document')} className="btn-secondary flex-1">Voltar</button><button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Enviando...' : 'Enviar cadastro'}</button></div>
        </form>
      )}

    </Modal>
  );
}

function CodeLoginForm({ label, value, onChange, loading, onSubmit, buttonLabel }: { label: string; value: string; onChange: (value: string) => void; loading: boolean; onSubmit: (event: React.FormEvent) => void; buttonLabel: string }) {
  const inputId = `restricted-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return <form onSubmit={onSubmit} className="space-y-6"><div><label htmlFor={inputId} className="mb-2 block text-sm font-black uppercase tracking-widest text-neutral-500">{label}</label><input id={inputId} type="password" name="access-code" autoComplete="current-password" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} className="input-field text-center text-2xl font-mono tracking-[0.5em]" required /></div><button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Entrando...' : buttonLabel}</button></form>;
}
