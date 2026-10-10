import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  ClientesScreen, 
  OrcamentosScreen, 
  DemandasScreen, 
  FinanceiroScreen, 
  LojaScreen, 
  ViagensScreen, 
  AfiliadosScreen, 
  CobrancaScreen, 
  AtendimentoScreen, 
  PromocoesScreen, 
  RelatoriosScreen, 
  ConfiguracoesScreen,
  PrestadoresScreen,
  FornecedoresScreen,
  VendasScreen,
  EmprestimosScreen,
  AreaVIPScreen,
  SegurosScreen,
  SaudeScreen,
  ClassificadosScreen,
  AnunciosScreen,
  AcessosScreen,
  SistemaScreen,
  CarreirasScreen,
  FiscalScreen,
  CreditoLojaScreen,
  CampanhasScreen,
  AutomacoesScreen
} from './src/Screens';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loadingApp, setLoadingApp] = useState(true);
  
  const [pin, setPin] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);
  
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [currentScreen, setCurrentScreen] = useState<
    | 'dashboard'
    | 'clientes'
    | 'orcamentos'
    | 'demandas'
    | 'prestadores'
    | 'fornecedores'
    | 'vendas'
    | 'emprestimos'
    | 'areavip'
    | 'seguros'
    | 'saude'
    | 'financeiro'
    | 'loja'
    | 'viagens'
    | 'afiliados'
    | 'cobranca'
    | 'atendimento'
    | 'promocoes'
    | 'relatorios'
    | 'configuracoes'
    | 'classificados'
    | 'anuncios'
    | 'acessos'
    | 'sistema'
    | 'carreiras'
    | 'fiscal'
    | 'credito_loja'
    | 'campanhas'
    | 'automacoes'
  >('dashboard');

  useEffect(() => {
    const loadSession = async () => {
      try {
        const savedSession = await AsyncStorage.getItem('@gsa_admin_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          const email = parsed?.auth?.email || parsed?.email;
          const password = parsed?.auth?.password || parsed?.password;
          if (email && password) {
            try {
              await supabase.auth.signInWithPassword({ email, password });
            } catch (authErr) {
              console.warn('Re-autenticação em segundo plano:', authErr);
            }
          }
          setSession(parsed);
          fetchDashboardData(parsed);
        }
      } catch (e) {
        console.error('Erro ao carregar sessão:', e);
      } finally {
        setLoadingApp(false);
      }
    };
    loadSession();
  }, []);

  const fetchDashboardData = async (currentSession: any) => {
    setLoadingDashboard(true);
    try {
      const sessaoId = currentSession?.sessaoId || currentSession?.sessao_id;
      const sessionToken = currentSession?.sessionToken || currentSession?.session_token;

      let rpcStats: any = null;
      if (sessaoId && sessionToken) {
        try {
          const { data } = await supabase.rpc('gsa_admin_dashboard_snapshot', {
            p_sessao_id: sessaoId,
            p_session_token: sessionToken
          });
          rpcStats = data?.stats;
        } catch (rpcErr) {
          // Ignora erro de RPC para fallback direto nas tabelas
        }
      }

      const [cRes, oRes, dRes, fRes] = await Promise.allSettled([
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('orcamentos').select('id', { count: 'exact', head: true }),
        supabase.from('prestador_demandas').select('id', { count: 'exact', head: true }),
        supabase.from('faturas').select('valor_total').eq('status', 'pendente')
      ]);

      const clientesCount = cRes.status === 'fulfilled' && !cRes.value.error ? cRes.value.count : null;
      const orcamentosCount = oRes.status === 'fulfilled' && !oRes.value.error ? oRes.value.count : null;
      const demandasCount = dRes.status === 'fulfilled' && !dRes.value.error ? dRes.value.count : null;
      const faturasPendentes = fRes.status === 'fulfilled' && !fRes.value.error ? fRes.value.data : null;

      const valorPendente = faturasPendentes?.reduce((acc: number, f: any) => acc + (Number(f.valor_total) || 0), 0) || 0;

      setDashboardData({
        clientes: clientesCount ?? rpcStats?.clientes_total ?? 0,
        orcamentos: orcamentosCount ?? rpcStats?.orcamentos_total ?? 0,
        demandas: demandasCount ?? rpcStats?.demandas_total ?? 0,
        financeiro_pendente: valorPendente || rpcStats?.faturas_pendentes_total || 0
      });

    } catch (e: any) {
      console.warn('Aviso silencioso ao carregar dashboard:', e);
    } finally {
      setLoadingDashboard(false);
    }
  };

  const handleLogin = async () => {
    if (pin.trim() === '' || pin.length < 4) {
      Alert.alert('Erro', 'Informe um PIN válido.');
      return;
    }
    
    setLoadingLogin(true);
    try {
      let resultData: any = null;

      // 1. Tentar Edge Function no VPS
      try {
        const { data, error } = await supabase.functions.invoke('gsa-auth-session', {
          body: { action: 'login_admin', payload: { code: pin.trim() } },
        });
        if (!error && data?.valid) {
          resultData = data;
        }
      } catch (edgeErr) {
        console.warn('Falha na Edge Function, tentando RPC direta:', edgeErr);
      }

      // 2. Fallback direto via RPC PostgreSQL no Supabase VPS
      if (!resultData?.valid) {
        try {
          const { data: rpcData } = await supabase.rpc('gsa_login_admin', { p_code: pin.trim() });
          if (rpcData?.valid) {
            resultData = rpcData;
          }
        } catch (rpcErr) {
          console.warn('Falha no RPC direto:', rpcErr);
        }
      }

      if (!resultData?.valid) {
        throw new Error('PIN inválido ou acesso negado.');
      }

      const sessionData = resultData.session || resultData;

      const email = sessionData?.auth?.email || sessionData?.email;
      const password = sessionData?.auth?.password || sessionData?.password;
      
      if (email && password) {
        try {
          const { error: authErr } = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (authErr) {
            console.warn('Aviso de login seguro Supabase:', authErr);
          }
        } catch (authCatch) {
          console.warn('Falha na reautenticação GoTrue:', authCatch);
        }
      }

      setSession(sessionData);
      await AsyncStorage.setItem('@gsa_admin_session', JSON.stringify(sessionData));
      
      fetchDashboardData(sessionData);

    } catch (err: any) {
      Alert.alert('Erro no Login', err.message || 'Credencial inválida.');
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleLogout = async () => {
    setSession(null);
    setPin('');
    setDashboardData(null);
    setCurrentScreen('dashboard');
    await AsyncStorage.removeItem('@gsa_admin_session');
    await supabase.auth.signOut();
  };

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getHeaderTitle = () => {
    switch(currentScreen) {
      case 'clientes': return 'Lista de Clientes';
      case 'orcamentos': return 'Meus Orçamentos';
      case 'demandas': return 'Fila de Demandas';
      case 'prestadores': return 'Prestadores';
      case 'fornecedores': return 'Fornecedores';
      case 'vendas': return 'Vendas & Pedidos';
      case 'emprestimos': return 'Empréstimos';
      case 'areavip': return 'Área VIP';
      case 'seguros': return 'GSA Seguros';
      case 'saude': return 'GSA Saúde';
      case 'financeiro': return 'Fin. Pendente';
      case 'loja': return 'Loja';
      case 'viagens': return 'Viagens';
      case 'afiliados': return 'Afiliados';
      case 'cobranca': return 'Cobrança';
      case 'atendimento': return 'Atendimento';
      case 'promocoes': return 'Promoções';
      case 'relatorios': return 'Relatórios';
      case 'configuracoes': return 'Configurações';
      case 'classificados': return 'Classificados GSA';
      case 'anuncios': return 'GSA Anúncios';
      case 'acessos': return 'Gestão de Acessos';
      case 'sistema': return 'Saúde do Sistema';
      case 'carreiras': return 'Trabalhe Conosco';
      case 'fiscal': return 'Gestão Fiscal (NF-e)';
      case 'credito_loja': return 'Crédito da Loja';
      case 'campanhas': return 'Avisos e Campanhas';
      case 'automacoes': return 'Automações & Scraping';
      default: return 'GSA Admin';
    }
  };

  const superDomains = [
    {
      num: 'SD1',
      name: 'Operações & Orçamentos',
      color: '#4f46e5',
      modules: [
        { title: 'Orçamentos e OS', id: 'orcamentos', icon: '📝' },
        { title: 'Demandas (Prestadores)', id: 'demandas', icon: '📋' },
        { title: 'GSA Store (Loja)', id: 'loja', icon: '🛒' },
        { title: 'Vendas e Pedidos', id: 'vendas', icon: '📦' },
        { title: 'GSA Viagens', id: 'viagens', icon: '✈️' },
        { title: 'Classificados GSA', id: 'classificados', icon: '🏷️' },
        { title: 'GSA Anúncios (Mídia)', id: 'anuncios', icon: '📢' },
      ],
    },
    {
      num: 'SD2',
      name: 'Gestão Financeira & Faturamento',
      color: '#059669',
      modules: [
        { title: 'Financeiro', id: 'financeiro', icon: '💰' },
        { title: 'Cobrança', id: 'cobranca', icon: '⚖️' },
        { title: 'Gestão Fiscal (NF-e)', id: 'fiscal', icon: '🧾' },
        { title: 'Empréstimos', id: 'emprestimos', icon: '💳' },
        { title: 'Crédito da Loja', id: 'credito_loja', icon: '💳' },
      ],
    },
    {
      num: 'SD3',
      name: 'Pessoas, RH & Prestadores',
      color: '#d97706',
      modules: [
        { title: 'Rede de Prestadores', id: 'prestadores', icon: '🛠️' },
        { title: 'Fornecedores', id: 'fornecedores', icon: '🏭' },
        { title: 'Trabalhe Conosco (Vagas)', id: 'carreiras', icon: '💼' },
        { title: 'GSA Afiliados', id: 'afiliados', icon: '🤝' },
        { title: 'Promoções e Fidelidade', id: 'promocoes', icon: '⭐' },
      ],
    },
    {
      num: 'SD4',
      name: 'Contratos, Clientes & Jurídico',
      color: '#2563eb',
      modules: [
        { title: 'Cadastros e Clientes', id: 'clientes', icon: '👥' },
        { title: 'Área VIP & Fidelidade', id: 'areavip', icon: '👑' },
        { title: 'GSA Saúde e Benefícios', id: 'saude', icon: '🩺' },
        { title: 'GSA Seguros e Proteção', id: 'seguros', icon: '🛡️' },
        { title: 'Atendimento (Tickets)', id: 'atendimento', icon: '🎧' },
        { title: 'Avisos e Campanhas', id: 'campanhas', icon: '🔔' },
      ],
    },
    {
      num: 'SD5',
      name: 'Governança & Configurações',
      color: '#7c3aed',
      modules: [
        { title: 'Dashboard', id: 'dashboard', icon: '📊' },
        { title: 'Gestão de Acessos (RBAC)', id: 'acessos', icon: '🛡️' },
        { title: 'Saúde & Monitor VPS', id: 'sistema', icon: '🖥️' },
        { title: 'Automações & Scraping', id: 'automacoes', icon: '🤖' },
        { title: 'Relatórios', id: 'relatorios', icon: '📈' },
        { title: 'Configurações', id: 'configuracoes', icon: '⚙️' },
      ],
    },
  ];

  const menuModules = superDomains.flatMap(d => d.modules);

  const handleMenuClick = (id: string) => {
    setIsMenuOpen(false);
    const validScreens = [
      'dashboard', 'clientes', 'orcamentos', 'demandas', 'prestadores', 
      'fornecedores', 'vendas', 'emprestimos', 'areavip', 'seguros', 
      'saude', 'financeiro', 'loja', 'viagens', 'afiliados', 'cobranca', 
      'atendimento', 'promocoes', 'relatorios', 'configuracoes',
      'classificados', 'anuncios', 'acessos', 'sistema', 'carreiras',
      'fiscal', 'credito_loja', 'campanhas', 'automacoes'
    ];
    if (validScreens.includes(id)) {
      setCurrentScreen(id as any);
    } else {
      Alert.alert('Módulo', 'Este módulo estará disponível em breve no mobile.');
    }
  };

  if (loadingApp) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#17345f" />
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f0f2f5" />
        <View style={styles.loginContainer}>
          <Text style={styles.logoText}>GSA Admin</Text>
          <Text style={styles.subtitle}>Conectado à VPS (Acesso Master)</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>PIN de Acesso (6 dígitos)</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite seu PIN"
              value={pin}
              onChangeText={setPin}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loadingLogin}>
            {loadingLogin ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Acessar Painel</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#17345f" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setIsMenuOpen(true)} style={{ paddingRight: 16 }}>
          <Text style={{ fontSize: 24, color: '#fff' }}>☰</Text>
        </TouchableOpacity>
        
        {currentScreen !== 'dashboard' ? (
          <TouchableOpacity onPress={() => setCurrentScreen('dashboard')} style={{ flexDirection: 'row', alignItems: 'center', padding: 8, flex: 1 }}>
            <Text style={styles.logoutText}>← Voltar</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.headerTitle, { flex: 1 }]}>{getHeaderTitle()}</Text>
        )}

        {currentScreen !== 'dashboard' ? (
          <Text style={[styles.headerTitle, { flex: 2 }]}>{getHeaderTitle()}</Text>
        ) : null}

        <TouchableOpacity onPress={handleLogout} style={{ padding: 8 }}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {isMenuOpen && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={styles.menuCloseArea} onPress={() => setIsMenuOpen(false)} />
          <View style={styles.menuContent}>
            <View style={styles.menuHeader}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={styles.menuHeaderTitle}>Grupo GSA OS</Text>
                  <Text style={{ color: '#93c5fd', fontSize: 11, marginTop: 4 }}>Enterprise Light • 5 Super-Domínios</Text>
                </View>
                <TouchableOpacity onPress={() => setIsMenuOpen(false)} style={{ padding: 6 }}>
                  <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' }}>
                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
                  {session?.ator_nome || session?.ator_tipo || 'Administrador Master'}
                </Text>
                <Text style={{ color: '#93c5fd', fontSize: 11 }}>VPS Conectada • 29 Módulos</Text>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              {superDomains.map((domain) => (
                <View key={domain.num} style={{ marginBottom: 10 }}>
                  <View style={[styles.domainHeader, { borderLeftColor: domain.color }]}>
                    <Text style={[styles.domainNumBadge, { backgroundColor: domain.color + '1f', color: domain.color }]}>
                      {domain.num}
                    </Text>
                    <Text style={styles.domainTitle} numberOfLines={1}>
                      {domain.name}
                    </Text>
                  </View>
                  {domain.modules.map((mod) => {
                    const isSelected = currentScreen === mod.id;
                    return (
                      <TouchableOpacity
                        key={mod.id}
                        style={[styles.menuItem, isSelected && styles.menuItemSelected]}
                        onPress={() => handleMenuClick(mod.id)}
                      >
                        <Text style={styles.menuItemIcon}>{mod.icon}</Text>
                        <Text style={[styles.menuItemText, isSelected && styles.menuItemTextSelected]}>
                          {mod.title}
                        </Text>
                        {isSelected && <Text style={{ color: '#17345f', fontWeight: 'bold', marginRight: 8 }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <View style={styles.menuFooter}>
              <TouchableOpacity style={styles.menuLogoutBtn} onPress={handleLogout}>
                <Text style={styles.menuLogoutIcon}>🚪</Text>
                <Text style={styles.menuLogoutText}>Sair do Painel Master</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {currentScreen === 'dashboard' ? (
        <ScrollView
          style={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={loadingDashboard}
              onRefresh={() => fetchDashboardData(session)}
              colors={['#17345f']}
              tintColor="#17345f"
            />
          }
        >
          <View style={styles.welcomeContainer}>
            <Text style={styles.welcomeText}>
              Olá, {session.ator_nome || session.ator_tipo || 'Administrador'}
            </Text>
            <TouchableOpacity onPress={() => fetchDashboardData(session)} style={styles.refreshButton}>
              <Text style={styles.refreshText}>↻ Atualizar</Text>
            </TouchableOpacity>
          </View>

          {/* Super-Domínios Selector */}
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Super-Domínios GSA Enterprise
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
              {superDomains.map((domain) => (
                <TouchableOpacity
                  key={domain.num}
                  style={[styles.domainChip, { borderLeftColor: domain.color }]}
                  onPress={() => handleMenuClick(domain.modules[0].id)}
                >
                  <Text style={[styles.domainChipNum, { color: domain.color }]}>{domain.num}</Text>
                  <Text style={styles.domainChipText} numberOfLines={1}>{domain.name}</Text>
                  <Text style={styles.domainChipCount}>{domain.modules.length} módulos</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        
          {loadingDashboard ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#17345f" />
              <Text style={{ marginTop: 10, color: '#666' }}>Buscando dados da VPS...</Text>
            </View>
          ) : (
            <View style={styles.dashboardGrid}>
              <DashboardCard 
                title="Clientes" 
                count={dashboardData?.clientes?.toString() || '0'} 
                icon="👥" 
                color="#4f46e5"
                caption="Cadastros Ativos"
                onPress={() => setCurrentScreen('clientes')}
              />
              <DashboardCard 
                title="Orçamentos" 
                count={dashboardData?.orcamentos?.toString() || '0'} 
                icon="📝" 
                color="#3b82f6"
                caption="Orçamentos Gerados"
                onPress={() => setCurrentScreen('orcamentos')}
              />
              <DashboardCard 
                title="Demandas" 
                count={dashboardData?.demandas?.toString() || '0'} 
                icon="📋" 
                color="#8b5cf6"
                caption="Serviços dos Prest."
                onPress={() => setCurrentScreen('demandas')}
              />
              <DashboardCard 
                title="Fin. Pendente" 
                count={`R$ ${(dashboardData?.financeiro_pendente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
                icon="💰" 
                color="#ef4444"
                caption="Faturas pendentes"
                onPress={() => setCurrentScreen('financeiro')}
              />
            </View>
          )}

          <Text style={styles.sectionTitle}>Ações Rápidas</Text>
          <View style={styles.actionList}>
            <ActionListItem title="📋 Orçamentos e Ordens de Serviço" onPress={() => setCurrentScreen('orcamentos')} />
            <ActionListItem title="🛠️ Fila de Demandas dos Prestadores" onPress={() => setCurrentScreen('demandas')} />
            <ActionListItem title="🧾 Gestão Fiscal & Notas Fiscais (NF-e)" onPress={() => setCurrentScreen('fiscal')} />
            <ActionListItem title="🤝 Aprovar novos parceiros / afiliados" onPress={() => setCurrentScreen('afiliados')} />
            <ActionListItem title="🛒 Gerenciar produtos e catálogo (Loja)" onPress={() => setCurrentScreen('loja')} />
            <ActionListItem title="🔔 Avisos, Campanhas e Banners" onPress={() => setCurrentScreen('campanhas')} />
            <ActionListItem title="🤖 Automações & Scraping VPS" onPress={() => setCurrentScreen('automacoes')} />
            <ActionListItem title="🖥️ Saúde do Sistema & Monitor VPS" onPress={() => setCurrentScreen('sistema')} />
            <ActionListItem title="⚙️ Configurações gerais do sistema" onPress={() => setCurrentScreen('configuracoes')} />
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {currentScreen === 'clientes' && <ClientesScreen />}
          {currentScreen === 'orcamentos' && <OrcamentosScreen />}
          {currentScreen === 'demandas' && <DemandasScreen />}
          {currentScreen === 'prestadores' && <PrestadoresScreen />}
          {currentScreen === 'fornecedores' && <FornecedoresScreen />}
          {currentScreen === 'vendas' && <VendasScreen />}
          {currentScreen === 'emprestimos' && <EmprestimosScreen />}
          {currentScreen === 'areavip' && <AreaVIPScreen />}
          {currentScreen === 'seguros' && <SegurosScreen />}
          {currentScreen === 'saude' && <SaudeScreen />}
          {currentScreen === 'financeiro' && <FinanceiroScreen />}
          {currentScreen === 'loja' && <LojaScreen />}
          {currentScreen === 'viagens' && <ViagensScreen />}
          {currentScreen === 'afiliados' && <AfiliadosScreen />}
          {currentScreen === 'cobranca' && <CobrancaScreen />}
          {currentScreen === 'atendimento' && <AtendimentoScreen />}
          {currentScreen === 'promocoes' && <PromocoesScreen />}
          {currentScreen === 'relatorios' && <RelatoriosScreen />}
          {currentScreen === 'configuracoes' && <ConfiguracoesScreen />}
          {currentScreen === 'classificados' && <ClassificadosScreen />}
          {currentScreen === 'anuncios' && <AnunciosScreen />}
          {currentScreen === 'acessos' && <AcessosScreen />}
          {currentScreen === 'sistema' && <SistemaScreen />}
          {currentScreen === 'carreiras' && <CarreirasScreen />}
          {currentScreen === 'fiscal' && <FiscalScreen />}
          {currentScreen === 'credito_loja' && <CreditoLojaScreen />}
          {currentScreen === 'campanhas' && <CampanhasScreen />}
          {currentScreen === 'automacoes' && <AutomacoesScreen />}
        </View>
      )}
    </SafeAreaView>
  );
}

const DashboardCard = ({ title, count, icon, color, caption, onPress }: { title: string, count: string, icon: string, color: string, caption?: string, onPress?: () => void }) => (
  <TouchableOpacity style={[styles.card, { borderLeftColor: color, borderLeftWidth: 4 }]} onPress={onPress}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardIcon}>{icon}</Text>
    </View>
    <Text style={styles.cardCount}>{count}</Text>
    {caption ? <Text style={[styles.cardCaption, { color: caption.includes('+') ? '#10b981' : '#6b7280' }]}>{caption}</Text> : null}
  </TouchableOpacity>
);

const ActionListItem = ({ title, onPress }: { title: string, onPress?: () => void }) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress}>
    <Text style={styles.actionItemTitle}>{title}</Text>
    <Text style={styles.actionItemArrow}>→</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#17345f',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 4,
  },
  button: {
    backgroundColor: '#17345f',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    height: 54,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    backgroundColor: '#17345f',
    padding: 20,
    paddingTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  welcomeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  refreshButton: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  refreshText: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
  },
  cardTitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
    flexShrink: 1,
  },
  cardCaption: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  actionList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionItemTitle: {
    fontSize: 16,
    color: '#333',
  },
  actionItemArrow: {
    fontSize: 16,
    color: '#ccc',
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    flexDirection: 'row',
  },
  menuCloseArea: {
    flex: 1,
  },
  menuContent: {
    width: '80%',
    maxWidth: 300,
    backgroundColor: '#fff',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  menuHeader: {
    padding: 24,
    paddingTop: 55,
    backgroundColor: '#17345f',
  },
  menuHeaderTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  domainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderLeftWidth: 4,
    marginTop: 6,
  },
  domainNumBadge: {
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  domainTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItemSelected: {
    backgroundColor: '#eff6ff',
  },
  menuItemIcon: {
    fontSize: 18,
    marginRight: 14,
    width: 24,
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  menuItemTextSelected: {
    color: '#17345f',
    fontWeight: 'bold',
  },
  domainChip: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    minWidth: 160,
  },
  domainChipNum: {
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 2,
  },
  domainChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  domainChipCount: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  menuFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  menuLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  menuLogoutIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  menuLogoutText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
});
