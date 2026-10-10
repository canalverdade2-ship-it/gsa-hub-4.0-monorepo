import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface AdminNavigationScreenProps {
  onNavigate?: (screenName: string, params?: any) => void;
  activeSuperDomain?: string;
}

interface SuperDomainItem {
  id: string;
  code: string;
  name: string;
  tagline: string;
  color: string;
  modules: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
  }>;
}

const SUPER_DOMAINS: SuperDomainItem[] = [
  {
    id: 'operacoes',
    code: 'SD1',
    name: 'Operações & Orçamentos',
    tagline: 'Orçamentos, OS, Demandas, Loja & Mídia',
    color: '#4f46e5',
    modules: [
      { id: 'orcamentos', name: 'Orçamentos', description: 'Cotações e propostas comerciais', icon: '📝' },
      { id: 'os', name: 'Ordens de Serviço', description: 'Acompanhamento e execução de serviços', icon: '📋' },
      { id: 'demandas', name: 'Demandas Operacionais', description: 'Fila de distribuição para prestadores', icon: '⚡' },
      { id: 'loja', name: 'GSA Store & Catálogo', description: 'Produtos, variantes e estoque', icon: '🛍️' },
      { id: 'viagens', name: 'GSA Viagens', description: 'Pacotes turísticos e passagens', icon: '✈️' },
      { id: 'classificados', name: 'Classificados', description: 'Anúncios de terceiros e moderação', icon: '🏷️' },
    ],
  },
  {
    id: 'financeiro',
    code: 'SD2',
    name: 'Gestão Financeira & Faturamento',
    tagline: 'Faturamento, Cobrança, Fiscal & Fluxo',
    color: '#059669',
    modules: [
      { id: 'financeiro', name: 'Faturamento Geral', description: 'Faturas, baixas e conciliação bancária', icon: '💳' },
      { id: 'cobranca', name: 'Cobrança Ativa', description: 'Régua de cobrança e inadimplência', icon: '🛡️' },
      { id: 'fiscal', name: 'Módulo Fiscal', description: 'Notas fiscais de serviço e emissões', icon: '📄' },
      { id: 'emprestimos', name: 'Crédito & Empréstimos', description: 'Simulações e contratos de crédito', icon: '🏦' },
      { id: 'saques', name: 'Gestão de Saques', description: 'Liberação de PIX para afiliados e prestadores', icon: '💸' },
    ],
  },
  {
    id: 'pessoas',
    code: 'SD3',
    name: 'Pessoas, RH & Prestadores',
    tagline: 'Prestadores, Fornecedores, Afiliados & RH',
    color: '#d97706',
    modules: [
      { id: 'prestadores', name: 'Prestadores de Serviço', description: 'Credenciamento, documentos e avaliações', icon: '🔧' },
      { id: 'fornecedores', name: 'Fornecedores', description: 'Homologação e pedidos de compra', icon: '🏢' },
      { id: 'afiliados', name: 'Programa de Afiliados', description: 'Rede de indicação e comissionamento', icon: '🤝' },
      { id: 'fidelidade', name: 'Clube Fidelidade', description: 'Pontos, vouchers e recompensas', icon: '⭐' },
      { id: 'trabalhe-conosco', name: 'Carreiras & Vagas', description: 'Candidaturas e triagem de talentos', icon: '💼' },
    ],
  },
  {
    id: 'contratos',
    code: 'SD4',
    name: 'Contratos, Clientes & Jurídico',
    tagline: 'CRM 360º, Minutas, VIP, Saúde & Seguros',
    color: '#0284c7',
    modules: [
      { id: 'clientes', name: 'Base de Clientes (CRM)', description: 'Cadastro PF/PJ e histórico de relacionamento', icon: '👥' },
      { id: 'contratos', name: 'Contratos & Minutas', description: 'Assinaturas digitais e termos legais', icon: '📑' },
      { id: 'area_vip', name: 'Área VIP & Benefícios', description: 'Planos exclusivos e parcerias corporativas', icon: '💎' },
      { id: 'saude', name: 'GSA Saúde', description: 'Planos médicos e telemedicina', icon: '🩺' },
      { id: 'seguros', name: 'GSA Seguros', description: 'Apólices e coberturas integradas', icon: '☂️' },
      { id: 'atendimento', name: 'Central de Atendimento', description: 'Tickets de suporte e ouvidoria', icon: '💬' },
    ],
  },
  {
    id: 'governanca',
    code: 'SD5',
    name: 'Governança & Infraestrutura',
    tagline: 'Cockpit Executivo, RBAC, VPS & Relatórios',
    color: '#7c3aed',
    modules: [
      { id: 'dashboard', name: 'Cockpit Executivo', description: 'Visão executiva com KPIs e pendências', icon: '📊' },
      { id: 'colab-dashboard', name: 'Painel do Colaborador', description: 'Metas operacionais e demandas da fila', icon: '🧑‍💻' },
      { id: 'configuracoes', name: 'Configurações Globais', description: 'Parâmetros, chaves de API e empresa', icon: '⚙️' },
      { id: 'acessos', name: 'Permissões RBAC', description: 'Colaboradores, cargos e PINs de acesso', icon: '🔐' },
      { id: 'relatorios', name: 'Relatórios Analíticos', description: 'Gerador consolidado de relatórios operacionais', icon: '📈' },
      { id: 'system-monitor', name: 'Monitor VPS & Banco', description: 'CPU, memória, latência e tabelas', icon: '🖥️' },
      { id: 'system-status', name: 'Indicador de Saúde', description: 'Sondas de conectividade e testes de rede', icon: '🩺' },
      { id: 'whatsapp-health', name: 'Monitor Evolution API', description: 'Instância WhatsApp e fila de mensagens', icon: '📱' },
      { id: 'scraping-admin', name: 'Robôs de Automação', description: 'Agendamentos e sincronização de dados', icon: '🤖' },
      { id: 'site-campaigns', name: 'Campanhas do Portal', description: 'Banners, popups e avisos no portal', icon: '📢' },
    ],
  },
];

export const AdminNavigationScreen: React.FC<AdminNavigationScreenProps> = ({
  onNavigate,
  activeSuperDomain: initialDomain = 'governanca',
}) => {
  const [selectedDomain, setSelectedDomain] = useState<string>(initialDomain);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const loadCounts = useCallback(async () => {
    setRefreshing(true);
    try {
      const [
        { count: orcamentosCount },
        { count: clientesCount },
        { count: faturasCount },
        { count: demandasCount },
      ] = await Promise.all([
        supabase.from('orcamentos').select('id', { count: 'exact', head: true }).eq('status', 'aberto'),
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('faturas').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('prestador_demandas').select('id', { count: 'exact', head: true }).eq('status', 'aberto'),
      ]);

      setCounts({
        orcamentos: orcamentosCount || 0,
        clientes: clientesCount || 0,
        financeiro: faturasCount || 0,
        demandas: demandasCount || 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const currentDomain = useMemo(() => {
    return SUPER_DOMAINS.find((d) => d.id === selectedDomain) || SUPER_DOMAINS[4];
  }, [selectedDomain]);

  // Se houver busca, filtra em todos os superdomínios
  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return currentDomain.modules;
    }
    const allMods: Array<{ id: string; name: string; description: string; icon: string; domainName: string }> = [];
    SUPER_DOMAINS.forEach((sd) => {
      sd.modules.forEach((m) => {
        if (m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)) {
          allMods.push({ ...m, domainName: sd.name });
        }
      });
    });
    return allMods;
  }, [search, currentDomain]);

  const handleLaunch = (modId: string) => {
    if (onNavigate) {
      onNavigate(modId);
    } else {
      Alert.alert('Navegação', `Módulo selecionado: ${modId}`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCounts()} colors={['#17345f']} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>Arquitetura de Navegação</Text>
        <Text style={styles.headerTitle}>Diretório de Módulos</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar módulo ou funcionalidade..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94a3b8"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Super Domains Switcher Tabs (when not searching) */}
      {!search && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sdTabsRow}>
          {SUPER_DOMAINS.map((sd) => (
            <TouchableOpacity
              key={sd.id}
              style={[
                styles.sdTab,
                selectedDomain === sd.id && { backgroundColor: sd.color, borderColor: sd.color },
              ]}
              onPress={() => setSelectedDomain(sd.id)}
            >
              <Text style={[styles.sdCode, selectedDomain === sd.id && styles.textWhite]}>
                {sd.code}
              </Text>
              <Text
                style={[
                  styles.sdTabName,
                  selectedDomain === sd.id && styles.textWhite,
                ]}
                numberOfLines={1}
              >
                {sd.name.split('&')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Super Domain Hero Header (when not searching) */}
      {!search && (
        <View style={[styles.sdHeroCard, { borderLeftColor: currentDomain.color }]}>
          <Text style={[styles.sdHeroCode, { color: currentDomain.color }]}>{currentDomain.code}</Text>
          <Text style={styles.sdHeroTitle}>{currentDomain.name}</Text>
          <Text style={styles.sdHeroTagline}>{currentDomain.tagline}</Text>
        </View>
      )}

      {/* Module Cards Grid */}
      <Text style={styles.sectionTitle}>
        {search ? `Resultados da Busca (${filteredModules.length})` : 'Módulos Disponíveis'}
      </Text>

      {filteredModules.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nenhum módulo encontrado</Text>
          <Text style={styles.emptyText}>Tente buscar por outro termo ou navegue pelos Super Domínios.</Text>
        </View>
      ) : (
        filteredModules.map((mod: any) => {
          const badgeCount = counts[mod.id];
          return (
            <TouchableOpacity
              key={mod.id}
              style={styles.moduleCard}
              onPress={() => handleLaunch(mod.id)}
            >
              <View style={styles.moduleIconBox}>
                <Text style={styles.moduleIconText}>{mod.icon}</Text>
              </View>

              <View style={styles.moduleInfo}>
                <View style={styles.moduleTitleRow}>
                  <Text style={styles.moduleName}>{mod.name}</Text>
                  {badgeCount !== undefined && badgeCount > 0 ? (
                    <View style={styles.moduleBadge}>
                      <Text style={styles.moduleBadgeText}>{badgeCount}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.moduleDesc} numberOfLines={2}>
                  {mod.description}
                </Text>
                {mod.domainName ? (
                  <Text style={styles.moduleDomainTag}>Super Domínio: {mod.domainName}</Text>
                ) : null}
              </View>

              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    color: '#0f172a',
  },
  clearBtn: {
    padding: 8,
  },
  clearBtnText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  sdTabsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  sdTab: {
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sdCode: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  sdTabName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 1,
  },
  textWhite: {
    color: '#ffffff',
  },
  sdHeroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 5,
    marginBottom: 14,
  },
  sdHeroCode: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sdHeroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  sdHeroTagline: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748b',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
  moduleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  moduleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  moduleIconText: {
    fontSize: 20,
  },
  moduleInfo: {
    flex: 1,
  },
  moduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moduleName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  moduleBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  moduleBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#dc2626',
  },
  moduleDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  moduleDomainTag: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: '600',
    marginTop: 4,
  },
  chevron: {
    fontSize: 22,
    color: '#94a3b8',
    marginLeft: 8,
    fontWeight: 'bold',
  },
});
