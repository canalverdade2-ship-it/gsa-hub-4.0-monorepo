import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface ConfiguracoesModuleScreenProps {
  onNavigate?: (screen: string) => void;
}

type TabKey = 'empresa' | 'financeiro' | 'whatsapp' | 'seguranca' | 'portal';

export const ConfiguracoesModuleScreen: React.FC<ConfiguracoesModuleScreenProps> = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('empresa');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingWa, setTestingWa] = useState(false);

  // Form states
  const [companyForm, setCompanyForm] = useState({
    razao_social: '',
    cnpj: '',
    telefone: '',
    email: '',
    responsavel: '',
    endereco: '',
  });

  const [financeiroForm, setFinanceiroForm] = useState({
    chave_pix: '',
    banco_nome: '',
    multa_atraso_percentual: '2.0',
    juros_mora_mensal: '1.0',
    dias_carencia_cobranca: '3',
    pagamento_pix_ativo: true,
  });

  const [whatsappForm, setWhatsappForm] = useState({
    evolution_api_url: 'https://api.147-15-43-141.nip.io',
    instance_name: 'gsa_oficial',
    api_key: '',
    webhook_url: 'https://api.147-15-43-141.nip.io/webhook',
    admin_notify_phone: '',
  });

  const [segurancaForm, setSegurancaForm] = useState({
    session_timeout_minutes: '120',
    require_2fa_admin: false,
    max_login_attempts: '5',
    block_suspicious_ip: true,
  });

  const [portalForm, setPortalForm] = useState({
    portal_name: 'GSA Gestão de Serviços',
    support_email: 'contato@grupogsa.com.br',
    service_fee_percent: '10.0',
    maintenance_mode: false,
  });

  const loadSettings = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Tentar RPC snapshot
      const { data: rpcData, error: rpcError } = await supabase.rpc('gsa_admin_settings_snapshot', {});

      if (!rpcError && rpcData) {
        if (rpcData.company) {
          setCompanyForm((prev) => ({
            ...prev,
            razao_social: rpcData.company.razao_social || '',
            cnpj: rpcData.company.cnpj || '',
            telefone: rpcData.company.telefone || '',
            email: rpcData.company.email || '',
            responsavel: rpcData.company.responsavel || '',
            endereco: rpcData.company.endereco || '',
          }));
        }
        if (rpcData.settings) {
          const s = rpcData.settings;
          setFinanceiroForm((prev) => ({
            ...prev,
            chave_pix: s.chave_pix || prev.chave_pix,
            banco_nome: s.banco_nome || prev.banco_nome,
            multa_atraso_percentual: s.multa_atraso_percentual || prev.multa_atraso_percentual,
            juros_mora_mensal: s.juros_mora_mensal || prev.juros_mora_mensal,
          }));
          setWhatsappForm((prev) => ({
            ...prev,
            evolution_api_url: s.evolution_api_url || prev.evolution_api_url,
            instance_name: s.evolution_instance_name || prev.instance_name,
            api_key: s.evolution_api_key || prev.api_key,
            admin_notify_phone: s.admin_notify_phone || prev.admin_notify_phone,
          }));
          setSegurancaForm((prev) => ({
            ...prev,
            session_timeout_minutes: s.session_timeout_minutes || prev.session_timeout_minutes,
            require_2fa_admin: s.require_2fa_admin === 'true',
          }));
        }
      } else {
        // Fallback: carregar de system_settings
        const { data: settingsList } = await supabase.from('system_settings').select('*');
        if (settingsList && Array.isArray(settingsList)) {
          const dict: Record<string, string> = {};
          settingsList.forEach((row: any) => {
            if (row.key) dict[row.key] = String(row.value || '');
          });

          setFinanceiroForm((prev) => ({
            ...prev,
            chave_pix: dict.chave_pix || prev.chave_pix,
            banco_nome: dict.banco_nome || prev.banco_nome,
            multa_atraso_percentual: dict.multa_atraso_percentual || prev.multa_atraso_percentual,
          }));
          setWhatsappForm((prev) => ({
            ...prev,
            evolution_api_url: dict.evolution_api_url || prev.evolution_api_url,
            instance_name: dict.instance_name || prev.instance_name,
            api_key: dict.api_key || prev.api_key,
            admin_notify_phone: dict.admin_notify_phone || prev.admin_notify_phone,
          }));
        }

        // Empresa
        const { data: comp } = await supabase.from('configuracoes_empresa').select('*').limit(1).maybeSingle();
        if (comp) {
          setCompanyForm({
            razao_social: comp.razao_social || '',
            cnpj: comp.cnpj || '',
            telefone: comp.telefone || '',
            email: comp.email || '',
            responsavel: comp.responsavel || '',
            endereco: comp.endereco || '',
          });
        }
      }
    } catch (e: any) {
      console.error('Erro ao ler configurações:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('configuracoes_empresa').upsert({
        id: 1,
        ...companyForm,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        // Tentar via rpc
        await supabase.rpc('gsa_admin_update_company_profile_secure', {
          p_company: companyForm,
        });
      }
      Alert.alert('Sucesso', 'Dados da empresa atualizados com sucesso!');
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e?.message || 'Falha ao salvar dados.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFinanceiro = async () => {
    setSaving(true);
    try {
      const entries = [
        { key: 'chave_pix', value: financeiroForm.chave_pix },
        { key: 'banco_nome', value: financeiroForm.banco_nome },
        { key: 'multa_atraso_percentual', value: financeiroForm.multa_atraso_percentual },
        { key: 'juros_mora_mensal', value: financeiroForm.juros_mora_mensal },
        { key: 'dias_carencia_cobranca', value: financeiroForm.dias_carencia_cobranca },
      ];
      for (const item of entries) {
        await supabase.from('system_settings').upsert({ key: item.key, value: item.value });
      }
      Alert.alert('Sucesso', 'Parâmetros financeiros salvos com sucesso!');
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e?.message || 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    setSaving(true);
    try {
      const entries = [
        { key: 'evolution_api_url', value: whatsappForm.evolution_api_url },
        { key: 'instance_name', value: whatsappForm.instance_name },
        { key: 'evolution_api_key', value: whatsappForm.api_key },
        { key: 'admin_notify_phone', value: whatsappForm.admin_notify_phone },
      ];
      for (const item of entries) {
        await supabase.from('system_settings').upsert({ key: item.key, value: item.value });
      }
      Alert.alert('Sucesso', 'Configurações do WhatsApp Evolution API salvas!');
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e?.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!whatsappForm.admin_notify_phone) {
      Alert.alert('Atenção', 'Informe o telefone do administrador para teste.');
      return;
    }
    setTestingWa(true);
    try {
      // Disparo de teste via RPC ou tabela de fila
      const { error } = await supabase.from('whatsapp_fila_disparos').insert({
        telefone: whatsappForm.admin_notify_phone,
        mensagem: `*GSA HUB - Notificação de Teste*\nHorário: ${new Date().toLocaleTimeString('pt-BR')}\nConexão móvel validada!`,
        tipo: 'teste_sistema',
        status: 'pendente',
      });

      if (error) {
        // Tentar via rpc
        await supabase.rpc('gsa_admin_test_whatsapp_notification', {
          p_telefone: whatsappForm.admin_notify_phone,
        });
      }

      Alert.alert('Disparo Enviado', 'Mensagem de teste enfileirada no WhatsApp com sucesso!');
    } catch (e: any) {
      Alert.alert('Erro no teste', e?.message || 'Falha ao acionar teste.');
    } finally {
      setTestingWa(false);
    }
  };

  const handleSaveSeguranca = async () => {
    setSaving(true);
    try {
      const entries = [
        { key: 'session_timeout_minutes', value: segurancaForm.session_timeout_minutes },
        { key: 'require_2fa_admin', value: String(segurancaForm.require_2fa_admin) },
        { key: 'max_login_attempts', value: segurancaForm.max_login_attempts },
      ];
      for (const item of entries) {
        await supabase.from('system_settings').upsert({ key: item.key, value: item.value });
      }
      Alert.alert('Sucesso', 'Políticas de segurança aplicadas!');
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePortal = async () => {
    setSaving(true);
    try {
      const entries = [
        { key: 'portal_name', value: portalForm.portal_name },
        { key: 'support_email', value: portalForm.support_email },
        { key: 'service_fee_percent', value: portalForm.service_fee_percent },
        { key: 'maintenance_mode', value: String(portalForm.maintenance_mode) },
      ];
      for (const item of entries) {
        await supabase.from('system_settings').upsert({ key: item.key, value: item.value });
      }
      Alert.alert('Sucesso', 'Parâmetros do portal salvos!');
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadSettings(true)} colors={['#17345f']} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>Governança & Plataforma</Text>
        <Text style={styles.headerTitle}>Configurações Globais</Text>
      </View>

      {/* Horizontal Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'empresa' && styles.tabBtnActive]}
          onPress={() => setActiveTab('empresa')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'empresa' && styles.tabBtnTextActive]}>
            🏢 Empresa
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'financeiro' && styles.tabBtnActive]}
          onPress={() => setActiveTab('financeiro')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'financeiro' && styles.tabBtnTextActive]}>
            💳 Financeiro
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'whatsapp' && styles.tabBtnActive]}
          onPress={() => setActiveTab('whatsapp')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'whatsapp' && styles.tabBtnTextActive]}>
            💬 WhatsApp
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'seguranca' && styles.tabBtnActive]}
          onPress={() => setActiveTab('seguranca')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'seguranca' && styles.tabBtnTextActive]}>
            🔐 Segurança
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'portal' && styles.tabBtnActive]}
          onPress={() => setActiveTab('portal')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'portal' && styles.tabBtnTextActive]}>
            🌐 Portal & Loja
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {loading && !refreshing ? (
        <View style={styles.loaderArea}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loaderText}>Carregando configurações...</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {/* TAB 1: EMPRESA */}
          {activeTab === 'empresa' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Dados Cadastrais da Empresa</Text>

              <Text style={styles.inputLabel}>Razão Social</Text>
              <TextInput
                style={styles.textInput}
                value={companyForm.razao_social}
                onChangeText={(t) => setCompanyForm((p) => ({ ...p, razao_social: t }))}
                placeholder="Ex: GRUPO GSA SERVICOS LTDA"
              />

              <Text style={styles.inputLabel}>CNPJ</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={companyForm.cnpj}
                onChangeText={(t) => setCompanyForm((p) => ({ ...p, cnpj: t }))}
                placeholder="00.000.000/0000-00"
              />

              <Text style={styles.inputLabel}>Telefone Comercial</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="phone-pad"
                value={companyForm.telefone}
                onChangeText={(t) => setCompanyForm((p) => ({ ...p, telefone: t }))}
                placeholder="(00) 00000-0000"
              />

              <Text style={styles.inputLabel}>E-mail Oficial</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="email-address"
                autoCapitalize="none"
                value={companyForm.email}
                onChangeText={(t) => setCompanyForm((p) => ({ ...p, email: t }))}
                placeholder="contato@grupogsa.com.br"
              />

              <Text style={styles.inputLabel}>Responsável Técnico / Administrador</Text>
              <TextInput
                style={styles.textInput}
                value={companyForm.responsavel}
                onChangeText={(t) => setCompanyForm((p) => ({ ...p, responsavel: t }))}
                placeholder="Nome do diretor responsável"
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSaveCompany}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Salvar Dados da Empresa</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* TAB 2: FINANCEIRO */}
          {activeTab === 'financeiro' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Parâmetros Financeiros & PIX</Text>

              <Text style={styles.inputLabel}>Chave PIX Recebedora Principal</Text>
              <TextInput
                style={styles.textInput}
                value={financeiroForm.chave_pix}
                onChangeText={(t) => setFinanceiroForm((p) => ({ ...p, chave_pix: t }))}
                placeholder="CNPJ, E-mail ou Chave Aleatória"
              />

              <Text style={styles.inputLabel}>Instituição Financeira / Banco</Text>
              <TextInput
                style={styles.textInput}
                value={financeiroForm.banco_nome}
                onChangeText={(t) => setFinanceiroForm((p) => ({ ...p, banco_nome: t }))}
                placeholder="Ex: Banco Inter / Cora / Nubank"
              />

              <Text style={styles.inputLabel}>Multa por Atraso (%)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={financeiroForm.multa_atraso_percentual}
                onChangeText={(t) => setFinanceiroForm((p) => ({ ...p, multa_atraso_percentual: t }))}
              />

              <Text style={styles.inputLabel}>Juros de Mora Mensal (%)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={financeiroForm.juros_mora_mensal}
                onChangeText={(t) => setFinanceiroForm((p) => ({ ...p, juros_mora_mensal: t }))}
              />

              <Text style={styles.inputLabel}>Dias de Tolerância para Cobrança</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={financeiroForm.dias_carencia_cobranca}
                onChangeText={(t) => setFinanceiroForm((p) => ({ ...p, dias_carencia_cobranca: t }))}
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSaveFinanceiro}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Salvar Parâmetros Financeiros</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* TAB 3: WHATSAPP */}
          {activeTab === 'whatsapp' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Integração Evolution API</Text>

              <Text style={styles.inputLabel}>URL da Evolution API VPS</Text>
              <TextInput
                style={styles.textInput}
                value={whatsappForm.evolution_api_url}
                onChangeText={(t) => setWhatsappForm((p) => ({ ...p, evolution_api_url: t }))}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Nome da Instância</Text>
              <TextInput
                style={styles.textInput}
                value={whatsappForm.instance_name}
                onChangeText={(t) => setWhatsappForm((p) => ({ ...p, instance_name: t }))}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>API Key / Token de Acesso</Text>
              <TextInput
                style={styles.textInput}
                value={whatsappForm.api_key}
                onChangeText={(t) => setWhatsappForm((p) => ({ ...p, api_key: t }))}
                secureTextEntry
                placeholder="Insira a chave da Evolution API"
              />

              <Text style={styles.inputLabel}>Telefone Admin para Alertas (com DDD)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="phone-pad"
                value={whatsappForm.admin_notify_phone}
                onChangeText={(t) => setWhatsappForm((p) => ({ ...p, admin_notify_phone: t }))}
                placeholder="Ex: 5511999999999"
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSaveWhatsApp}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Salvar Credenciais WhatsApp</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.testWaButton}
                onPress={handleTestWhatsApp}
                disabled={testingWa}
              >
                {testingWa ? (
                  <ActivityIndicator color="#17345f" />
                ) : (
                  <Text style={styles.testWaButtonText}>📲 Enviar Mensagem de Teste</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* TAB 4: SEGURANÇA */}
          {activeTab === 'seguranca' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Políticas de Acesso & Sessão</Text>

              <Text style={styles.inputLabel}>Tempo Limite de Sessão (minutos)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={segurancaForm.session_timeout_minutes}
                onChangeText={(t) => setSegurancaForm((p) => ({ ...p, session_timeout_minutes: t }))}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchTitle}>Exigir 2FA para Administradores</Text>
                  <Text style={styles.switchDesc}>Autenticação em duas etapas via WhatsApp/Email</Text>
                </View>
                <Switch
                  value={segurancaForm.require_2fa_admin}
                  onValueChange={(val) => setSegurancaForm((p) => ({ ...p, require_2fa_admin: val }))}
                  thumbColor={segurancaForm.require_2fa_admin ? '#17345f' : '#cbd5e1'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchTitle}>Bloqueio Preventivo de IP</Text>
                  <Text style={styles.switchDesc}>Bloquear acessos após 5 tentativas inválidas de PIN</Text>
                </View>
                <Switch
                  value={segurancaForm.block_suspicious_ip}
                  onValueChange={(val) => setSegurancaForm((p) => ({ ...p, block_suspicious_ip: val }))}
                  thumbColor={segurancaForm.block_suspicious_ip ? '#17345f' : '#cbd5e1'}
                />
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSaveSeguranca}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Aplicar Regras de Segurança</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* TAB 5: PORTAL & LOJA */}
          {activeTab === 'portal' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Portal Público & GSA Store</Text>

              <Text style={styles.inputLabel}>Nome do Portal Público</Text>
              <TextInput
                style={styles.textInput}
                value={portalForm.portal_name}
                onChangeText={(t) => setPortalForm((p) => ({ ...p, portal_name: t }))}
              />

              <Text style={styles.inputLabel}>E-mail de Suporte ao Cliente</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="email-address"
                autoCapitalize="none"
                value={portalForm.support_email}
                onChangeText={(t) => setPortalForm((p) => ({ ...p, support_email: t }))}
              />

              <Text style={styles.inputLabel}>Taxa de Intermediação de Serviço (%)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={portalForm.service_fee_percent}
                onChangeText={(t) => setPortalForm((p) => ({ ...p, service_fee_percent: t }))}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchTitle}>Modo Manutenção</Text>
                  <Text style={styles.switchDesc}>Exibir aviso de manutenção temporária no portal</Text>
                </View>
                <Switch
                  value={portalForm.maintenance_mode}
                  onValueChange={(val) => setPortalForm((p) => ({ ...p, maintenance_mode: val }))}
                  thumbColor={portalForm.maintenance_mode ? '#ef4444' : '#cbd5e1'}
                />
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSavePortal}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Salvar Parâmetros do Portal</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 14,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  tabsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  tabBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  loaderArea: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  formSection: {
    gap: 12,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    marginTop: 6,
  },
  textInput: {
    minHeight: 44,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0f172a',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 8,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  switchDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  primaryButton: {
    minHeight: 48,
    backgroundColor: '#17345f',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  testWaButton: {
    minHeight: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginTop: 8,
  },
  testWaButtonText: {
    color: '#17345f',
    fontSize: 14,
    fontWeight: '700',
  },
});
