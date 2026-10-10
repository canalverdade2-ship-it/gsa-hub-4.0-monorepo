import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../../supabase';
import {
  COLORS,
  commonStyles,
  formatDateTime,
} from './financialTheme';

export const CalculatorProPaymentConfigurationScreen: React.FC = () => {
  const [handle, setHandle] = useState('');
  const [ready, setReady] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Tenta buscar da RPC gsa_admin_calculator_pro_snapshot
      const { data: rpcData, error: rpcError } = await supabase.rpc('gsa_admin_calculator_pro_snapshot');

      if (!rpcError && rpcData?.runtime_config) {
        const config = rpcData.runtime_config;
        setHandle(config.infinitepay_handle || '');
        setReady(Boolean(config.checkout_ready));
        setUpdatedAt(config.updated_at || null);
      } else {
        // Fallback: consulta em system_settings
        const { data: settingsData } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['infinitepay_handle', 'calculator_checkout_ready', 'calculator_payment_updated_at']);

        if (settingsData) {
          const map = settingsData.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
          const h = map.infinitepay_handle || '';
          setHandle(h);
          setReady(Boolean(h && h.trim().length > 0));
          setUpdatedAt(map.calculator_payment_updated_at || null);
        }
      }
    } catch (e: any) {
      console.error('Erro ao consultar InfinitePay:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConfig();
    setRefreshing(false);
  };

  const handleSave = async () => {
    const cleanHandle = handle.trim().replace(/^\$/, '');
    if (cleanHandle && !/^[A-Za-z0-9._-]{2,100}$/.test(cleanHandle)) {
      Alert.alert('Atenção', 'Informe uma InfiniteTag válida (apenas letras, números, hífen, underline ou ponto).');
      return;
    }

    setSaving(true);
    try {
      const isReady = cleanHandle.length > 0;
      const now = new Date().toISOString();

      // Salva via RPC se existir
      const { error: rpcErr } = await supabase.rpc('gsa_admin_save_calculator_pro_runtime_config', {
        p_infinitepay_handle: cleanHandle || null,
      });

      if (rpcErr) {
        // Fallback para system_settings
        await Promise.all([
          supabase.from('system_settings').upsert({ key: 'infinitepay_handle', value: cleanHandle }),
          supabase.from('system_settings').upsert({ key: 'calculator_checkout_ready', value: String(isReady) }),
          supabase.from('system_settings').upsert({ key: 'calculator_payment_updated_at', value: now }),
        ]);
      }

      setHandle(cleanHandle);
      setReady(isReady);
      setUpdatedAt(now);

      Alert.alert(
        'Sucesso',
        isReady
          ? 'InfinitePay configurada com sucesso! O checkout móvel e web das Calculadoras Pro foi habilitado.'
          : 'InfinitePay desvinculada. Pagamentos online desabilitados.'
      );
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message || 'Falha na comunicação com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Configuração de Pagamento</Text>
        <Text style={commonStyles.headerSubtitle}>Integração InfinitePay para Calculadoras Pro</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && !refreshing ? (
          <View style={commonStyles.emptyState}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={commonStyles.emptyStateText}>Consultando integração InfinitePay...</Text>
          </View>
        ) : (
          <View>
            {/* Status Card */}
            <View
              style={[
                commonStyles.card,
                {
                  backgroundColor: ready ? COLORS.successLight : COLORS.warningLight,
                  borderColor: ready ? COLORS.success : COLORS.warning,
                  borderWidth: 2,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: ready ? COLORS.success : COLORS.warning,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Status da Integração
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: ready ? '#065f46' : '#92400e',
                  marginTop: 4,
                }}
              >
                {ready ? '✓ Checkout Habilitado' : '⚠ Checkout Desabilitado'}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: ready ? '#065f46' : '#92400e',
                  marginTop: 6,
                  lineHeight: 18,
                }}
              >
                {ready
                  ? 'A aplicação está autorizada a receber pagamentos instantâneos via InfinitePay para as ferramentas trabalhistas e previdenciárias.'
                  : 'Nenhuma InfiniteTag configurada. O checkout das Calculadoras Pro ficará bloqueado para os clientes até que uma conta recebedora seja informada.'}
              </Text>

              {updatedAt && (
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 10 }}>
                  Última atualização: {formatDateTime(updatedAt)}
                </Text>
              )}
            </View>

            {/* Form Card */}
            <View style={commonStyles.card}>
              <Text style={[commonStyles.cardTitle, { marginBottom: 8 }]}>Conta Recebedora InfinitePay</Text>
              <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 18 }}>
                Informe a InfiniteTag da conta empresarial que receberá os pagamentos. Digite apenas o identificador exibido após o símbolo <Text style={{ fontWeight: 'bold' }}>$</Text> no app da InfinitePay.
              </Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>InfiniteTag da Conta</Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: COLORS.background,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: '#e2e8f0',
                      borderRightWidth: 1,
                      borderRightColor: COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textSecondary }}>$</Text>
                  </View>
                  <TextInput
                    style={{
                      flex: 1,
                      minHeight: 44,
                      paddingHorizontal: 12,
                      fontSize: 15,
                      fontWeight: '700',
                      color: COLORS.textPrimary,
                    }}
                    placeholder="sua-infinite-tag"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={handle}
                    onChangeText={(val) => setHandle(val.replace(/^\$/, ''))}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[commonStyles.btnPrimary, { marginTop: 10 }]}
                disabled={saving}
                onPress={handleSave}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnPrimaryText}>Salvar Integração de Pagamento</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Security Notice */}
            <View
              style={{
                backgroundColor: COLORS.card,
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                marginTop: 8,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 4 }}>
                🔒 Proteção e Segurança Bancária
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 }}>
                A InfiniteTag é uma chave pública identificadora da conta de recebimento. Nenhuma credencial bancária, token secreto ou senha pessoal é solicitada por este painel.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};
