import React, { useState } from 'react';
import { UserPlus, Building2, User, Phone, Mail, MapPin, Briefcase, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { CommandSlideOver } from '../shared';
import { callAdminRpc, createAdminRequestId } from '../../../../lib/adminRpc';
import { logService } from '../../../../lib/logService';
import { notificationService } from '../../../../lib/notificationService';
import { maskCPF, maskCNPJ, maskPhone, maskCEP } from '../../../../lib/utils';
import { validarCPF, validarCNPJ, validarEmail } from '../../../../utils/cpfValidator';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

export interface NovoPrestadorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function NovoPrestadorDrawer({
  isOpen,
  onClose,
  onSuccess,
  colaboradorId,
  colaboradorNome
}: NovoPrestadorDrawerProps) {
  useRealtimeSubscription({ table: 'prestadores', enabled: isOpen });
  const [formData, setFormData] = useState({
    tipo_cadastro: 'cpf' as 'cpf' | 'cnpj',
    nome_razao: '',
    nome_responsavel: '',
    documento: '',
    email: '',
    telefone: '',
    cep: '',
    numero: '',
    area_servico: '',
    observacoes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanDoc = formData.documento.replace(/\D/g, '');
    const cleanPhone = formData.telefone.replace(/\D/g, '');
    const cleanCep = formData.cep.replace(/\D/g, '');

    if (!formData.nome_razao.trim()) {
      toast.error('Informe o nome ou razão social.');
      return;
    }

    if (formData.tipo_cadastro === 'cpf' && cleanDoc.length !== 11) {
      toast.error('CPF inválido.');
      return;
    }
    if (formData.tipo_cadastro === 'cnpj' && cleanDoc.length !== 14) {
      toast.error('CNPJ inválido.');
      return;
    }

    if (formData.email && !validarEmail(formData.email)) {
      toast.error('E-mail inválido.');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Cadastrando prestador de serviços...');

    try {
      const data = await callAdminRpc<{ id: string; success: boolean }>('gsa_admin_create_provider', {
        p_payload: {
          tipo_cadastro: formData.tipo_cadastro,
          nome_razao: formData.nome_razao.trim(),
          nome_responsavel: formData.tipo_cadastro === 'cnpj' ? formData.nome_responsavel.trim() : null,
          documento: cleanDoc,
          email: formData.email.trim(),
          telefone: cleanPhone,
          cep: cleanCep,
          numero: formData.numero.trim(),
          area_servico: formData.area_servico.trim(),
          observacoes: formData.observacoes.trim(),
          status: 'ativo',
          nome_completo: formData.nome_razao.trim(),
        },
        p_request_id: createAdminRequestId(),
      });

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Sistema',
        acao: 'CRIAR_PRESTADOR',
        detalhes: `Cadastrou o prestador: ${formData.nome_razao.trim()} (${formData.tipo_cadastro.toUpperCase()}: ${cleanDoc})`
      });

      await notificationService.notifyProvider(
        data.id,
        '👋 Boas-vindas à Rede GSA!',
        'Seu cadastro de prestador foi ativado com sucesso.',
        'perfil',
        'prestador_cadastro_aprovado',
        { tab: 'info' }
      );

      toast.success('Prestador cadastrado e ativado com sucesso!', { id: toastId });
      setFormData({
        tipo_cadastro: 'cpf',
        nome_razao: '',
        nome_responsavel: '',
        documento: '',
        email: '',
        telefone: '',
        cep: '',
        numero: '',
        area_servico: '',
        observacoes: ''
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao cadastrar prestador:', err);
      toast.error(`Falha ao cadastrar: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CommandSlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Credenciar Novo Prestador"
      subtitle="Cadastre um profissional ou empresa terceirizada para alocação em demandas e ordens de serviço"
      width="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Tipo de Pessoa Toggle */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Tipo de Cadastro
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, tipo_cadastro: 'cpf', documento: '' })}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold uppercase tracking-wider transition-all ${
                formData.tipo_cadastro === 'cpf'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <User className="h-4 w-4" />
              Pessoa Física (CPF)
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, tipo_cadastro: 'cnpj', documento: '' })}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold uppercase tracking-wider transition-all ${
                formData.tipo_cadastro === 'cnpj'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Pessoa Jurídica (CNPJ)
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              {formData.tipo_cadastro === 'cnpj' ? 'Razão Social / Nome Fantasia' : 'Nome Completo'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.nome_razao}
              onChange={(e) => setFormData({ ...formData, nome_razao: e.target.value })}
              placeholder={formData.tipo_cadastro === 'cnpj' ? 'Ex: Alpha Serviços Especializados LTDA' : 'Ex: Carlos Eduardo Silva'}
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {formData.tipo_cadastro === 'cnpj' && (
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nome do Responsável Legal / Contato
              </label>
              <input
                type="text"
                value={formData.nome_responsavel}
                onChange={(e) => setFormData({ ...formData, nome_responsavel: e.target.value })}
                placeholder="Ex: Carlos Silva (Sócio / Diretor)"
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              {formData.tipo_cadastro === 'cnpj' ? 'CNPJ' : 'CPF'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={formData.tipo_cadastro === 'cnpj' ? 18 : 14}
              required
              value={formData.tipo_cadastro === 'cnpj' ? maskCNPJ(formData.documento) : maskCPF(formData.documento)}
              onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
              placeholder={formData.tipo_cadastro === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-mono text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Telefone / WhatsApp <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              inputMode="tel"
              maxLength={15}
              required
              value={maskPhone(formData.telefone)}
              onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              placeholder="(00) 00000-0000"
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              E-mail Principal
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="prestador@email.com"
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Especialidade / Área de Serviço
            </label>
            <input
              type="text"
              value={formData.area_servico}
              onChange={(e) => setFormData({ ...formData, area_servico: e.target.value })}
              placeholder="Ex: Elétrica, Hidráulica, TI, Ar Condicionado"
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              CEP
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={maskCEP(formData.cep)}
              onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
              placeholder="00000-000"
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Número / Complemento
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.numero}
              onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
              placeholder="Ex: 120, Sala 4"
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Observações Administrativas
            </label>
            <textarea
              rows={3}
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Anotações internas sobre experiência, certificações ou acordos..."
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 uppercase tracking-wider disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {isSubmitting ? 'Cadastrando...' : 'Cadastrar Prestador'}
          </button>
        </div>
      </form>
    </CommandSlideOver>
  );
}
