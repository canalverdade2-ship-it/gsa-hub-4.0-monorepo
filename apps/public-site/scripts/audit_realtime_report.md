# Master Audit Report: Auditoria Técnica Exaustiva da Camada Realtime — GSA HUB

**Data da Auditoria:** 28 de Agosto de 2026  
**Sistema:** GSA HUB — Plataforma SaaS de Gestão de Serviços  
**Auditor:** Teamwork Realtime Auditor & Report Synthesizer  
**Status:** Concluído — 100% dos Componentes e Infraestrutura Auditados  

---

## 1. Sumário Executivo & Diagnóstico Geral

Este laudo técnico consolida os resultados da auditoria estrutural e de conformidade realizada em 100% da camada **Realtime** do ecossistema GSA HUB. A análise cobriu a infraestrutura base de hooks e bibliotecas (`src/hooks/useRealtime.ts`, `src/hooks/useRealtimeTable.ts`, `src/lib/supabaseRealtime.ts`), 98 componentes com subscrições ativas, o serviço daemon de mensageria WhatsApp VPS (`server_webhook_vps_live.cjs`, `lib/antiBanEngine.cjs`), e uma varredura de lacunas em todos os 481 arquivos TypeScript/TSX do frontend.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             GSA HUB REALTIME HEALTH                              │
│                                                                                  │
│   [ 🟢 72 Conformes (73.5%) ]   [ 🟡 17 Alertas (17.3%) ]   [ 🔴 9 Críticos (9.2%) ]  │
│                                                                                  │
│   • 98 Componentes Auditados individualmente                                     │
│   • 4 a 9 Canais WebSocket abertos por sessão de cliente                         │
│   • 2 a 5 Canais WebSocket abertos por sessão de administrador                   │
│   • 97.9% de Taxa de Adoção do Hook Canônico no Core Atual                       │
│   • 29 Oportunidades de Expansão de Realtime Identificadas (Gap Scan)            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Principais Métricas e Indicadores Globais

| Métrica Auditada | Valor / Diagnóstico |
|---|---|
| **Total de Componentes Auditados com Realtime** | **98 componentes** mapeados e analisados individualmente |
| **Componentes Conformes (🟢 OK)** | **72 componentes (73.5%)** |
| **Componentes com Alertas / Riscos (🟡 Alerta)** | **17 componentes (17.3%)** |
| **Componentes com Falhas Críticas (🔴 Crítico)** | **9 componentes (9.2%)** |
| **Média de Conexões WebSocket Simultâneas por Usuário** | **4 a 9 canais** (Portal do Cliente) / **2 a 5 canais** (Portal Admin) |
| **Consumidores do Hook Legado (`useRealtimeTable`)** | **2 componentes residuais** (`ConfiguracoesModule.tsx`, `OrcamentosWorkstation.tsx`) |
| **Componentes com Violação de Regras de Hooks React** | **3 componentes** (`ProdutosModule.tsx`, `OrdensAssinaturaModule.tsx`, `OrdensCompraModule.tsx`) |
| **Componentes Subscritos em Tabelas Inexistentes (Fantasma)** | **4 componentes** (`AdvertisingAdminModule.tsx`, `ServicePackagesModule.tsx`, `TrabalheConoscoSection.tsx`, `CareersAdminModule.tsx`) |
| **Canais com Broadcast sem Filtro em Tabelas de Alto Volume** | **5 componentes** (`useClientNotifications.tsx`, `AfiliadoDashboard.tsx`, `PurchasesPage.tsx`, `CouponsPage.tsx`, `PrestadorDetailDrawer.tsx`) |
| **Uso de Server-Side Realtime CDC no Bot WhatsApp VPS** | **0% (100% REST One-Shot)** |

---

## 2. R1: Auditoria da Infraestrutura Base de Realtime

A camada de infraestrutura é composta por três módulos principais:
1. `src/hooks/useRealtime.ts` — Engine canônica (`useRealtimeSubscription` e `useRealtime`).
2. `src/hooks/useRealtimeTable.ts` — Hook legado / obsoleto.
3. `src/lib/supabaseRealtime.ts` — Helper imperativo `subscribeToTable` e re-exports.

### 2.1 Diagnóstico de Vulnerabilidades e Falhas na Infraestrutura Base

#### 🔴 R1-01: Stale Callback Closure no `callbacksRef` (`src/hooks/useRealtime.ts:59-72`)
* **Mecanismo da Falha:** `rawConfigs` é memoizado via `useMemo` com base em propriedades primitivas (`table`, `filter`, `event`, etc.). Quando um componente pai re-renderiza com um novo callback inline `onChange` ou `onPayload`, a string de dependência do `useMemo` não se altera. Como a linha 70 itera sobre `rawConfigs` em vez do array de opções fresco (`options`), `callbacksRef.current` retém referências de funções antigas, executando callbacks com estado desatualizado (*stale closure*).
* **Severidade:** 🔴 **CRÍTICO**

#### 🔴 R1-02: Dessincronização de Índices com `enabled: false` (`src/hooks/useRealtime.ts:104, 120-146`)
* **Mecanismo da Falha:** Em configurações multi-tabela, `rawConfigs` armazena todas as tabelas (ex: `[Tabela A (enabled: false), Tabela B (enabled: true)]`). O loop de registro itera sobre `enabledConfigs` (comprimento 1), onde o índice `idx` da Tabela B é `0`. Quando um evento chega para a Tabela B, o listener acessa `callbacksRef.current[0]`, executando o callback da Tabela A! Além disso, os temporizadores em `debounceTimersRef` são cancelados na tabela errada.
* **Severidade:** 🔴 **CRÍTICO**

#### 🟡 R1-03: Race Condition em Montagens Rápidas / StrictMode (`src/hooks/useRealtime.ts:188-202`)
* **Mecanismo da Falha:** O callback assíncrono de `channel.subscribe((subStatus) => ...)` valida apenas `if (!isMountedRef.current) return;`. Em remounts rápidos do React 18, o status de um canal anterior que sofreu teardown pode sobrescrever o status do novo canal ativo.
* **Severidade:** 🟡 **ALERTA**

#### 🟡 R1-04: Descarte de Array de Dependências em Sobrecarga de String (`src/hooks/useRealtime.ts:246-271`)
* **Mecanismo da Falha:** Ao invocar `useRealtime('pedidos', fetchPedidos, [statusFilter])`, o parâmetro de dependências é descartado na chamada interna `useRealtimeSubscription(config)`, ignorando o gatilho de re-execução.
* **Severidade:** 🟡 **ALERTA**

#### 🟡 R1-05: Chave de Memoização Omite `channelName` (`src/hooks/useRealtime.ts:61`)
* **Mecanismo da Falha:** A chave serializada de memoização de configuração unitária omite `channelName`, impedindo que alterações dinâmicas de nome de canal reinicializem a subscrição.
* **Severidade:** 🟡 **ALERTA**

#### 🔴 R1-06 a R1-09: Deficiências Estruturais do Hook Legado `useRealtimeTable.ts`
* Ausência de suporte a filtros de linha (`filter`), gerando broadcast global incondicional.
* Ausência de debounce/throttle para proteção contra rajadas de escrita.
* Retorno `void` sem visibilidade de status (`SUBSCRIBED`, `CHANNEL_ERROR`).
* Geração de nomes de canal via `Date.now()` no render loop.
* **Severidade:** 🔴 **CRÍTICO**

#### 🟡 R1-10 e R1-11: Subscrição Silenciosa em `supabaseRealtime.ts:52-61`
* O helper `subscribeToTable` invoca `.subscribe()` sem callback de erro, silenciando falhas de autenticação ou violações de RLS, e não possui parâmetro de debounce.
* **Severidade:** 🟡 **ALERTA**

---

### 2.2 Matriz Comparativa da Infraestrutura Base

| Recurso Técnico | `useRealtimeSubscription` (Canônico) | `useRealtime` (Wrapper) | `useRealtimeTable` (Legado) | `subscribeToTable` (Imperativo) |
|---|:---:|:---:|:---:|:---:|
| **Suporte Multi-Tabela** | ✅ Sim (Multiplexado) | ✅ Sim | ✅ Sim (Loop for) | ❌ Não (Tabela única) |
| **Filtro de Linha (`filter`)** | ✅ Sim (`id=eq.123`) | ✅ Sim | ❌ Não (Broadcast) | ✅ Sim |
| **Evento Granular (`event`)** | ✅ Sim (`INSERT`, `*`...) | ✅ Sim | ❌ Não (`*` fixo) | ✅ Sim |
| **Debounce por Tabela (`debounceMs`)** | ✅ Sim | ✅ Sim | ❌ Não | ⚠️ Requer Adição |
| **Callback com Payload (`onPayload`)** | ✅ Sim (Tipado `T`) | ✅ Sim | ❌ Não | ✅ Sim |
| **Rastreamento de Conexão (`status`)** | ✅ Sim (5 estados) | ✅ Sim | ❌ Não (`void`) | ⚠️ Requer Adição |
| **Controle Condicional (`enabled`)** | ✅ Sim | ✅ Sim | ❌ Não | ❌ Não |
| **Desinscrição Manual (`unsubscribe`)** | ✅ Sim | ✅ Sim | ❌ Não | ✅ Sim |
| **Teardown com `removeChannel`** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim |
| **Imunidade a Stale Closures** | 🔴 Requer Correção | 🔴 Requer Correção | ✅ Sim (Ref direta) | N/A |

---

### 2.3 Código Corrigido da Infraestrutura Base (Drop-in Replacement)

#### Proposta Corrigida: `src/hooks/useRealtime.ts`
```typescript
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { DependencyList } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type RealtimePostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export type RealtimeSubscriptionStatus =
  | 'INITIALIZING'
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

export interface RealtimeSubscriptionConfig<T = any> {
  table: string;
  schema?: string;
  filter?: string;
  event?: RealtimePostgresEvent;
  debounceMs?: number;
  channelName?: string;
  onPayload?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onChange?: () => void | Promise<void>;
  enabled?: boolean;
}

export type RealtimeSubscriptionOptions<T = any> = RealtimeSubscriptionConfig<T>;

export interface RealtimeSubscriptionResult {
  status: RealtimeSubscriptionStatus;
  channel: RealtimeChannel | null;
  unsubscribe: () => void;
}

let channelCounter = 0;

function generateChannelName(configs: RealtimeSubscriptionConfig[]): string {
  channelCounter += 1;
  const tablePart = configs.map((c) => c.table).slice(0, 3).join('-');
  const filterPart = configs[0]?.filter ? `_${configs[0].filter.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20)}` : '';
  return `rt_${tablePart}${filterPart}_${Date.now()}_${channelCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useRealtimeSubscription<T = any>(
  options: RealtimeSubscriptionConfig<T> | RealtimeSubscriptionConfig<T>[],
  deps?: DependencyList
): RealtimeSubscriptionResult {
  const [status, setStatus] = useState<RealtimeSubscriptionStatus>('INITIALIZING');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimersRef = useRef<{ [key: number]: ReturnType<typeof setTimeout> | null }>({});
  const isMountedRef = useRef(true);

  // Normalização direta das opções do render atual para os callbacks (resolve R1-01)
  const incomingConfigs = Array.isArray(options) ? options : [options];

  const callbacksRef = useRef<Array<{
    onPayload?: (payload: RealtimePostgresChangesPayload<any>) => void;
    onChange?: () => void | Promise<void>;
  }>>([]);

  callbacksRef.current = incomingConfigs.map((c) => ({
    onPayload: c.onPayload,
    onChange: c.onChange,
  }));

  // Memoização estrutural para configuração de tópicos
  const rawConfigs = useMemo(() => {
    return Array.isArray(options) ? options : [options];
  }, [
    Array.isArray(options)
      ? JSON.stringify(options.map((o) => ({
          table: o.table,
          filter: o.filter,
          schema: o.schema,
          event: o.event,
          enabled: o.enabled,
          debounceMs: o.debounceMs,
          channelName: o.channelName,
        })))
      : `${options.table}_${options.filter}_${options.schema}_${options.event}_${options.enabled}_${options.debounceMs}_${options.channelName}`
  ]);

  const isEnabled = rawConfigs.length > 0 && rawConfigs.some((c) => c.enabled !== false);

  const unsubscribe = useCallback(() => {
    Object.values(debounceTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    debounceTimersRef.current = {};

    if (channelRef.current) {
      const activeChannel = channelRef.current;
      channelRef.current = null;
      setStatus('CLOSED');
      supabase.removeChannel(activeChannel).catch((err) => {
        console.warn('[useRealtime] Error removing channel during manual unsubscribe:', err);
      });
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!isEnabled) {
      setStatus('CLOSED');
      return () => {
        isMountedRef.current = false;
      };
    }

    // Mapeamento preservando o índice original (resolve R1-02)
    const enabledConfigsWithIdx = rawConfigs
      .map((config, originalIdx) => ({ config, originalIdx }))
      .filter(({ config }) => config.enabled !== false);

    if (enabledConfigsWithIdx.length === 0) {
      setStatus('CLOSED');
      return () => {
        isMountedRef.current = false;
      };
    }

    setStatus('INITIALIZING');

    const customName = enabledConfigsWithIdx.find(({ config }) => config.channelName)?.config.channelName;
    const channelName = customName || generateChannelName(enabledConfigsWithIdx.map(({ config }) => config));

    let channel = supabase.channel(channelName);

    enabledConfigsWithIdx.forEach(({ config, originalIdx }) => {
      const eventType = config.event || '*';
      const schemaName = config.schema || 'public';
      const filterStr = config.filter;

      const changeOptions: {
        event: RealtimePostgresEvent;
        schema: string;
        table: string;
        filter?: string;
      } = {
        event: eventType,
        schema: schemaName,
        table: config.table,
      };

      if (filterStr) {
        changeOptions.filter = filterStr;
      }

      channel = channel.on(
        'postgres_changes',
        changeOptions as any,
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (!isMountedRef.current) return;

          const activeCallbacks = callbacksRef.current[originalIdx];

          if (activeCallbacks?.onPayload) {
            try {
              activeCallbacks.onPayload(payload);
            } catch (payloadErr) {
              console.error(`[useRealtime] Error in onPayload for ${config.table}:`, payloadErr);
            }
          }

          if (activeCallbacks?.onChange) {
            const debounceMs = config.debounceMs ?? 0;
            if (debounceMs > 0) {
              if (debounceTimersRef.current[originalIdx]) {
                clearTimeout(debounceTimersRef.current[originalIdx]!);
              }
              debounceTimersRef.current[originalIdx] = setTimeout(() => {
                debounceTimersRef.current[originalIdx] = null;
                if (isMountedRef.current && callbacksRef.current[originalIdx]?.onChange) {
                  try {
                    void callbacksRef.current[originalIdx]!.onChange!();
                  } catch (changeErr) {
                    console.error(`[useRealtime] Error in debounced onChange for ${config.table}:`, changeErr);
                  }
                }
              }, debounceMs);
            } else {
              try {
                void activeCallbacks.onChange();
              } catch (changeErr) {
                console.error(`[useRealtime] Error in onChange for ${config.table}:`, changeErr);
              }
            }
          }
        }
      );
    });

    channelRef.current = channel;

    channel.subscribe((subStatus, err) => {
      // Proteção contra callbacks de canais anteriores (resolve R1-03)
      if (!isMountedRef.current || channelRef.current !== channel) return;

      if (subStatus === 'SUBSCRIBED') {
        setStatus('SUBSCRIBED');
      } else if (subStatus === 'TIMED_OUT') {
        setStatus('TIMED_OUT');
        console.warn(`[useRealtime] Channel subscription timed out: ${channelName}`);
      } else if (subStatus === 'CLOSED') {
        setStatus('CLOSED');
      } else if (subStatus === 'CHANNEL_ERROR') {
        setStatus('CHANNEL_ERROR');
        console.warn(`[useRealtime] Channel error on ${channelName}:`, err);
      }
    });

    return () => {
      isMountedRef.current = false;

      Object.values(debounceTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      debounceTimersRef.current = {};

      if (channelRef.current) {
        const chan = channelRef.current;
        channelRef.current = null;
        supabase.removeChannel(chan).catch((err) => {
          console.warn(`[useRealtime] Cleanup error on channel ${channelName}:`, err);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ? deps : [isEnabled, JSON.stringify(rawConfigs.map(c => ({
    t: c.table,
    s: c.schema || 'public',
    f: c.filter,
    e: c.event || '*',
    d: c.debounceMs,
    c: c.channelName
  })))]);

  return {
    status,
    channel: channelRef.current,
    unsubscribe,
  };
}

export function useRealtime<T = any>(
  tableOrOptions: string | RealtimeSubscriptionConfig<T> | RealtimeSubscriptionConfig<T>[],
  onChangeOrDeps?: (() => void | Promise<void>) | DependencyList,
  optionsOrDeps?: Partial<RealtimeSubscriptionConfig<T>> | DependencyList
): RealtimeSubscriptionResult {
  if (typeof tableOrOptions === 'string') {
    const table = tableOrOptions;
    const onChange = typeof onChangeOrDeps === 'function' ? onChangeOrDeps : undefined;
    const isArrayDeps = Array.isArray(optionsOrDeps);
    const extraOptions = typeof optionsOrDeps === 'object' && !isArrayDeps
      ? (optionsOrDeps as Partial<RealtimeSubscriptionConfig<T>>)
      : {};
    const deps = isArrayDeps
      ? (optionsOrDeps as DependencyList)
      : (Array.isArray(onChangeOrDeps) ? onChangeOrDeps : undefined);

    const config: RealtimeSubscriptionConfig<T> = {
      table,
      onChange,
      ...extraOptions,
    };

    return useRealtimeSubscription<T>(config, deps);
  }

  const options = tableOrOptions;
  const deps = Array.isArray(onChangeOrDeps) ? onChangeOrDeps : (Array.isArray(optionsOrDeps) ? optionsOrDeps : undefined);

  return useRealtimeSubscription<T>(options, deps);
}
```

---

## 3. R2: Fichas Técnicas dos 98 Componentes Auditados

Abaixo está o registro detalhado de auditoria de cada um dos 98 componentes mapeados na plataforma.

---

### [01] `AcessosModule.tsx`
- **Caminho:** `src/components/admin/AcessosModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `colaboradores`, `solicitacoes_exclusao`, `sistema_logs`
- **Filtros:** Nenhum (Visão Administrativa Geral)
- **Eventos:** `*` | **Cleanup:** ✅ Garantido via unmount
- **Callback:** `loadData` unificado | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as tabelas existem
- **Classificação:** 🟢 **OK**

---

### [02] `AdminPrestadorDocumentos.tsx`
- **Caminho:** `src/components/admin/prestadores/AdminPrestadorDocumentos.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestador_documentos`, `documentos_prestador`
- **Filtros:** `prestador_id=eq.${prestadorId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchDocs` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** `prestador_documentos` (✅), `documentos_prestador` (❌ Storage Bucket)
- **Classificação:** 🟡 **Alerta**
- **Diagnóstico & Correção:** Remover subscrição na pseudo-tabela `documentos_prestador`.

---

### [03] `AdvertiserPortal.tsx`
- **Caminho:** `src/pages/AdvertiserPortal.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `gsa_advertisers`, `gsa_ad_requests`, `gsa_ad_proposals`, `gsa_ad_campaigns`, `gsa_ad_creatives`, `gsa_ad_payments`, `gsa_ad_negotiations`
- **Filtros:** Nenhum (Broadcast geral de publicidade)
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadAdvertiserContext(true)` | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 7 tabelas existem
- **Classificação:** 🟡 **Alerta**
- **Diagnóstico & Correção:** Aplicar `filter: advertiser?.id ? id=eq.${advertiser.id} : undefined` em `gsa_advertisers` e `advertiser_id` nas requisições.

---

### [04] `AdvertisingAdminModule.tsx`
- **Caminho:** `src/components/admin/AdvertisingAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `advertising_requests`, `advertising_proposals`, `advertising_campaigns`, `advertising_creatives`, `advertising_payments`, `advertising_placements`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Estrutural
- **Callback:** `loadSnapshot(true)` | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** ❌ **TABELAS FANTASMAS!** (Nomes reais no PostgreSQL: `gsa_ad_requests`, `gsa_ad_proposals`, `gsa_ad_campaigns`, `gsa_ad_creatives`, `gsa_ad_payments`, `gsa_ad_placements`).
- **Classificação:** 🔴 **Crítico**
- **Diagnóstico & Correção:** Corrigir os nomes das tabelas para o prefixo `gsa_ad_*`. O realtime deste módulo nunca disparava em produção.

---

### [05] `AffiliateAdminModule.tsx`
- **Caminho:** `src/components/admin/AffiliateAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `gsa_afiliados`, `gsa_afiliado_programas`, `gsa_afiliado_comissoes`, `gsa_afiliado_saques`, `gsa_afiliado_links`, `indicacoes`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 6 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [06] `AfiliadoDashboard.tsx`
- **Caminho:** `src/pages/Afiliado/AfiliadoDashboard.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `gsa_afiliados`, `gsa_afiliado_links`, `gsa_afiliado_comissoes`, `gsa_afiliado_saques`, `gsa_afiliado_programas`, `saques`
- **Filtros:** `id=eq.${afData.id}` em `gsa_afiliados`; **SEM FILTRO** em `saques`!
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🔴 **Crítico (AP1 Broadcast)**
- **Diagnóstico & Correção:** Aplicar filtro de linha em `saques` ou remover a subscrição global em `saques`, já que `gsa_afiliado_saques` é a tabela específica do afiliado.

---

### [07] `AfiliadosSection.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/AfiliadosSection.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `gsa_afiliados`, `indicacoes`, `saques`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 0ms (Falta debounce)
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟡 **Alerta**
- **Diagnóstico & Correção:** Configurar `debounceMs: 300` e adicionar `gsa_afiliado_comissoes` e `gsa_afiliado_saques`.

---

### [08] `AreaVipView.tsx`
- **Caminho:** `src/components/admin/super-domains/contratos/AreaVipView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchMembers` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟡 **Alerta**
- **Diagnóstico & Correção:** Configurar `debounceMs: 500` e monitorar `client_levels` e `assinaturas`.

---

### [09] `AssinaturasModule.tsx`
- **Caminho:** `src/components/admin/AssinaturasModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `assinaturas`, `ordens_assinatura`, `loja_categorias`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchAssinaturas`, `fetchCats` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [10] `AtendimentoTicketsView.tsx`
- **Caminho:** `src/components/admin/super-domains/contratos/AtendimentoTicketsView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `tickets`, `ticket_mensagens`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchTickets` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** / 🟡 **Alerta** (Recomenda-se adicionar `debounceMs: 150`).

---

### [11] `CalculadorasGatewayView.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/CalculadorasGatewayView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `vouchers`, `system_settings`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadSnapshot` via RPC | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [12] `CareersAdminModule.tsx`
- **Caminho:** `src/components/admin/CareersAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `gsa_careers_applications`, `trabalhe_conosco`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchApplications(true)` | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** `gsa_careers_applications` (✅), `trabalhe_conosco` (❌ Tabela legada removida)
- **Classificação:** 🟡 **Alerta**
- **Diagnóstico & Correção:** Remover subscrição na tabela inexistente `trabalhe_conosco`.

---

### [13] `CheckoutModal.tsx`
- **Caminho:** `src/components/client/store/CheckoutModal.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`, `cupons_ativados`, `cupons_loja`
- **Filtros:** `id=eq.${clientId}`, `cliente_id=eq.${clientId}`, `enabled: isOpen && !!clientId`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido via `enabled`
- **Callback:** `fetchSaldoPontos`, `fetchCoupons` | **Debounce:** 150ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Padrão de referência para modais de checkout).

---

### [14] `CheckoutPage.tsx`
- **Caminho:** `src/components/client/store/CheckoutPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `loja_carrinhos`, `clientes`, `produtos`, `cupons_loja`
- **Filtros:** `cliente_id=eq.${clientId}`, `id=eq.${clientId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchCartItems`, `fetchDadosCredito`, `fetchCoupons` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [15] `ClassifiedsModule.tsx`
- **Caminho:** `src/components/admin/ClassifiedsModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `classificados_anuncios`, `classificados_propostas`, `classificados_mensagens`, `classificados_transacoes`, `classificados_midias`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 5 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [16] `ClientAffiliatePanel.tsx`
- **Caminho:** `src/components/client/ClientAffiliatePanel.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `gsa_afiliados`, `saques`, `carteira_lancamentos`, `indicacoes`, `points_transactions`, `pontos_movimentacoes`
- **Filtros:** `cliente_id=eq.${_clientId}` em saques, carteira, indicações e pontos
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 6 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [17] `ClientAreaVIP.tsx`
- **Caminho:** `src/components/client/ClientAreaVIP.tsx`
- **Hook:** `useRealtimeSubscription` + Canal Manual Direto (`supabase.channel`)
- **Tabelas:** `client_levels`, `assinaturas`, `level_history`
- **Filtros:** `cliente_id=eq.${cliente.id}` em `level_history`
- **Eventos:** `*`, `INSERT` | **Cleanup:** ✅ Ambos presentes
- **Callback:** `fetchLevels`, `fetchHistory` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟡 **Alerta (AP4 Double Subscription)**
- **Diagnóstico & Correção:** Eliminar canal manual `client-vip-changes` e unificar no `useRealtimeSubscription`.

---

### [18] `ClientAssinaturas.tsx`
- **Caminho:** `src/components/client/ClientAssinaturas.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `ordens_assinatura`, `faturas`, `assinaturas`
- **Filtros:** `cliente_id=eq.${clientId}` em ordens e faturas
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchMinhasAssinaturas` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [19] `ClientFidelidade.tsx`
- **Caminho:** `src/components/client/ClientFidelidade.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`, `vouchers`, `indicacoes`, `pontos_movimentacoes`, `system_settings`
- **Filtros:** `id=eq.${clientId}` e `cliente_id=eq.${clientId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** Re-fetch e hooks de notificação | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [20] `ClientFinanceiro.tsx`
- **Caminho:** `src/components/client/ClientFinanceiro.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`, `faturas`, `saques`, `transferencias`, `carteira_lancamentos`, `ordens_fiscais`, `tickets`, `system_settings`
- **Filtros:** `cliente_id=eq.${clientId}` nas 6 tabelas de usuário
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchSaldo`, `checkFaturas`, `checkActiveRequest` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 8 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [21] `ClientIndiqueGanhe.tsx`
- **Caminho:** `src/components/client/ClientIndiqueGanhe.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `indicacoes`, `vouchers`, `clientes`
- **Filtros:** `indicador_id=eq.${clientId}`, `id=eq.${clientId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchIndicacoes`, mais `onPayload` para live patch do modal sem fechar tela
- **Debounce:** 150ms | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Exemplo excelente de patching via `onPayload`).

---

### [22] `ClientMeuCredito.tsx`
- **Caminho:** `src/components/client/ClientMeuCredito.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `loja_credito_solicitacoes`, `loja_credito_movimentacoes`, `faturas`, `clientes`, `loja_credito_documentos`
- **Filtros:** `cliente_id=eq.${clientId}` nas tabelas de crédito e faturas
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData()`, `onRefreshCliente()` | **Debounce:** 0ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 5 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [23] `ClientOrcamentos.tsx`
- **Caminho:** `src/components/client/ClientOrcamentos.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `orcamentos`, `loja_avaliacoes`, `loja_solicitacoes`
- **Filtros:** `cliente_id=eq.${clientId}` em todas as tabelas
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchOrcamentosRef.current()`, alerta em `onPayload`
- **Debounce:** 300ms em orçamentos | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [24] `ClientPontos.tsx`
- **Caminho:** `src/components/client/ClientPontos.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`, `pontos_movimentacoes`
- **Filtros:** `id=eq.${clienteId}`, `cliente_id=eq.${clienteId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchData()` | **Debounce:** 150ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [25] `ClientProdutos.tsx`
- **Caminho:** `src/components/client/ClientProdutos.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `ordens_compra`, `produtos`, `faturas`
- **Filtros:** `cliente_id=eq.${clientId}` em compras e faturas
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchOrders()`, `fetchProdutos()`, `fetchFaturas()` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** / 🟡 **Alerta** (Falta subscrição em `orcamentos` que é consultada em `fetchOrders`).

---

### [26] `ClientProfile.tsx`
- **Caminho:** `src/components/client/ClientProfile.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `cliente_documentos`, `documentos_cliente`, `clientes`
- **Filtros:** `cliente_id=eq.${cliente.id}`, `id=eq.${cliente.id}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchDocumentos()` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** `cliente_documentos` (✅), `documentos_cliente` (❌ Storage Bucket), `clientes` (✅)
- **Classificação:** 🔴 **Crítico**
- **Diagnóstico & Correção:** Remover pseudo-tabela `documentos_cliente` e recarregar dados do perfil em eventos de `clientes`.

---

### [27] `ClientServicos.tsx`
- **Caminho:** `src/components/client/ClientServicos.tsx`
- **Hook:** `useRealtimeSubscription` no pai e `.channel()` direto nos modais `OSNotas` e `OSSuporteChat`
- **Tabelas:** `ordens_servico`, `orcamentos`, `os_notas`, `os_suporte_mensagens`
- **Filtros:** Sem filtro em notas e mensagens no componente pai
- **Eventos:** `*` | **Cleanup:** ✅ Presente
- **Callback:** Recarrega todas as ordens | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟡 **Alerta (AP1/AP4)**
- **Diagnóstico & Correção:** Remover broadcast global de notas/mensagens do componente pai e padronizar modais filhos no `useRealtimeSubscription`.

---

### [28] `ClientSuporte.tsx`
- **Caminho:** `src/components/client/ClientSuporte.tsx`
- **Hook:** `useRealtimeSubscription` (2 instâncias condicionadas a `enabled`)
- **Tabelas:** `tickets`, `ticket_mensagens`
- **Filtros:** `cliente_id=eq.${clientId}`, `ticket_id=eq.${selectedTicket.id}`
- **Eventos:** `*` | **Cleanup:** ✅ Impecável via `enabled`
- **Callback:** Live append de mensagens no chat | **Debounce:** 0ms (Tempo real)
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Padrão de referência para chat em tempo real).

---

### [29] `ClientTransferencias.tsx`
- **Caminho:** `src/components/client/ClientTransferencias.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `transferencias`, `clientes`, `pontos_movimentacoes`, `saques`
- **Filtros:** `transferencias` sem filtro de linha; demais filtradas por `cliente_id`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟡 **Alerta (AP1 Broadcast)**
- **Diagnóstico & Correção:** Filtrar `transferencias` por `cliente_origem_id` e `cliente_destino_id` com `debounceMs: 500`.

---

### [30] `ClientVouchers.tsx`
- **Caminho:** `src/components/client/ClientVouchers.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `vouchers`, `cupons_loja`, `cupons_ativados`, `clientes`
- **Filtros:** `id=eq.${clientId}` em clientes
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchVouchers()` executado em `onPayload` e `onChange` (Duplicidade de query)
- **Debounce:** Padrão | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** / 🟡 **Alerta** (Eliminar chamada redundante no `onPayload`).

---

### [31] `CobrancaView.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/CobrancaView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `cobrancas`, `cobranca_historico`, `cobranca_acordo_parcelas`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [32] `ConfiguracoesModule.tsx`
- **Caminho:** `src/components/admin/ConfiguracoesModule.tsx`
- **Hook:** `useRealtimeTable` (🔴 **HOOK LEGADO**)
- **Tabelas:** `system_settings`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Presente
- **Callback:** `setRtRefreshKey(k => k + 1)` (Desconectado do `useEffect` de carga!)
- **Debounce:** ❌ Ausente | **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🔴 **Crítico (Hook Legado + Bug de Refresh)**
- **Diagnóstico & Correção:** Migrar para `useRealtimeSubscription({ table: 'system_settings', onChange: () => void load(), debounceMs: 300 })`.

---

### [33] `ContratosDocumentosView.tsx`
- **Caminho:** `src/components/admin/super-domains/contratos/ContratosDocumentosView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `contratos`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [34] `CreateListingWizard.tsx`
- **Caminho:** `src/components/client/marketplace/classifieds/CreateListingWizard.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `classificados_comissoes_config`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchConfigs` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK** / 🟡 **Alerta** (Adicionar `enabled: isOpen`).

---

### [35] `CrmClientesView.tsx`
- **Caminho:** `src/components/admin/super-domains/contratos/CrmClientesView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [36] `Dashboard.tsx`
- **Caminho:** `src/components/admin/Dashboard.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 13 tabelas (`faturas`, `cobrancas`, `saques`, `emprestimos`, `orcamentos`, `ordens_servico`, `ordens_fiscais`, `tickets`, `clientes`, `ordens_compra`, `vouchers`, `prestador_demandas`, `promocoes`)
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 13 tabelas existem
- **Classificação:** 🟢 **OK** / 🟡 **Alerta (AP6 Polling concorrente 60s)**

---

### [37] `DemandasColaboradorModule.tsx`
- **Caminho:** `src/components/admin/DemandasColaboradorModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 7 tabelas (`prestador_demandas`, `prestador_demandas_historico`, `demanda_comentarios`, `os_notas`, `os_suporte_mensagens`, `colaboradores`, `prestadores`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData`, `onPayload` granular | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 7 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [38] `DemandasComentarios.tsx`
- **Caminho:** `src/components/admin/demandas/DemandasComentarios.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `demanda_comentarios`
- **Filtros:** `demanda_id=eq.${demandaId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchComentarios` | **Debounce:** 100ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [39] `DemandasDashboard.tsx`
- **Caminho:** `src/components/admin/demandas/DemandasDashboard.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestador_demandas`, `colaboradores`, `prestadores`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchData` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [40] `DemandasDetalhesModal.tsx`
- **Caminho:** `src/components/admin/demandas/DemandasDetalhesModal.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestador_demandas`, `prestador_demandas_historico`
- **Filtros:** `id=eq.${demanda.id}`, `demanda_id=eq.${demanda.id}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `onRefresh()`, `onRefreshHistorico()` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** / 🟡 **Alerta** (Adicionar `enabled: Boolean(isOpen && demanda?.id)`).

---

### [41] `EcommerceHeader.tsx`
- **Caminho:** `src/components/client/store/EcommerceHeader.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `loja_carrinhos`, `clientes`
- **Filtros:** `cliente_id=eq.${clientId}`, `id=eq.${clientId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchCartCount`, `fetchSaldo` | **Debounce:** 100ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [42] `EcommerceHome.tsx`
- **Caminho:** `src/components/client/store/EcommerceHome.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `produtos`, `loja_carrinhos`
- **Filtros:** `cliente_id=eq.${clientId}` em carrinhos
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchHomeData`, `fetchCart` | **Debounce:** 300ms em produtos
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [43] `EditClassifiedListingPage.tsx`
- **Caminho:** `src/components/client/marketplace/classifieds/EditClassifiedListingPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `classificados_anuncios`, `classificados_midias`
- **Filtros:** `id=eq.${anuncioId}`, `anuncio_id=eq.${anuncioId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchListing` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [44] `EmprestimosCreditoView.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/EmprestimosCreditoView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `emprestimos`, `emprestimo_parcelas`, `loja_credito_solicitacoes`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [45] `FaturamentoView.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/FaturamentoView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `faturas`, `cobrancas`, `ordens_fiscais`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [46] `FidelidadePromocoesSection.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/FidelidadePromocoesSection.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `vouchers`, `cliente_premios`, `pontos_movimentacoes`, `cupons_loja`, `loja_solicitacoes`, `indicacoes` (6 tabelas)
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 6 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [47] `FinanceiroSuperDomain.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/FinanceiroSuperDomain.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `faturas`, `saques`, `cobrancas`, `ordens_fiscais`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [48] `FiscalModule.tsx`
- **Caminho:** `src/components/admin/FiscalModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `ordens_fiscais`, `faturas`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [49] `FiscalView.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/FiscalView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `ordens_fiscais`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK** / 🟡 **Alerta (AP5 deps com callback instável)**

---

### [50] `FluxoCaixaView.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/FluxoCaixaView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `saques`, `transferencias`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchSaques`, `fetchTransferencias` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Recomenda-se adicionar `debounceMs: 300`).

---

### [51] `FornecedoresModule.tsx`
- **Caminho:** `src/components/admin/FornecedoresModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 8 tabelas (`fornecedores`, `ordens_compra`, `produto_fornecedor_config`, `produtos`, `fornecedor_produtos`, `fornecedor_pedidos`, `fornecedor_entregas`, `fornecedor_documentos`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchData`, `fetchOrdensCompra` | **Debounce:** 300ms em todas as 8 tabelas
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 8 tabelas existem
- **Classificação:** 🟢 **OK** (Padrão de excelência para módulos de suprimentos).

---

### [52] `FornecedoresSection.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/FornecedoresSection.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `parceiros`, `parceiros_resgates`, `fornecedores`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchData`, `fetchResgates` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [53] `GovernancaAcessosView.tsx`
- **Caminho:** `src/components/admin/super-domains/governanca/GovernancaAcessosView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `colaboradores`, `funcoes`, `solicitacoes_exclusao`, `admin_sessoes`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Recomenda-se adicionar `debounceMs: 300`).

---

### [54] `GovernancaAuditoriaView.tsx`
- **Caminho:** `src/components/admin/super-domains/governanca/GovernancaAuditoriaView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `sistema_logs`, `solicitacoes_exclusao`, `system_settings`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadLogs` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Recomenda-se adicionar `debounceMs: 500` devido ao volume de logs).

---

### [55] `GovernancaConfiguracoesView.tsx`
- **Caminho:** `src/components/admin/super-domains/governanca/GovernancaConfiguracoesView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `system_settings`, `payment_methods`, `configuracoes`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadConfigs` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [56] `GovernancaExecutiveDashboard.tsx`
- **Caminho:** `src/components/admin/super-domains/governanca/GovernancaExecutiveDashboard.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 7 tabelas (`clientes`, `faturas`, `saques`, `prestador_demandas`, `ordens_servico`, `colaboradores`, `sistema_logs`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadDashboardData` (RPC `gsa_admin_dashboard_snapshot`) | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** / 🟡 **Alerta** (Recomenda-se `debounceMs: 500` pelo peso da RPC).

---

### [57] `GovernancaInfraView.tsx`
- **Caminho:** `src/components/admin/super-domains/governanca/GovernancaInfraView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `colaboradores`, `clientes`, `system_settings`, `gsa_whatsapp_ramais`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [58] `GsaSaudeView.tsx`
- **Caminho:** `src/components/admin/super-domains/contratos/GsaSaudeView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `saude_contratos`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchSaude` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [59] `GsaSegurosView.tsx`
- **Caminho:** `src/components/admin/super-domains/contratos/GsaSegurosView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `seguros_apolices`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchSeguros` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [60] `GsaTvModule.tsx`
- **Caminho:** `src/components/admin/GsaTvModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 7 tabelas `gsa_tv_*` (`gsa_tv_channels`, `gsa_tv_media_items`, `gsa_tv_schedule_slots`, `gsa_tv_playlists`, `gsa_tv_incidents`, `gsa_tv_audit_log`, `gsa_tv_jobs`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadRealData` | **Debounce:** 500ms em todas as 7 tabelas
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 7 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [61] `HubEmpresasView.tsx`
- **Caminho:** `src/components/admin/super-domains/contratos/HubEmpresasView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchEmpresas` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [62] `NovaDemandaModal.tsx`
- **Caminho:** `src/components/admin/demandas/NovaDemandaModal.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `ordens_servico`, `colaboradores`, `prestadores`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchData` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** / 🟡 **Alerta** (Adicionar `enabled: isOpen`).

---

### [63] `NovoPrestadorDrawer.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/NovoPrestadorDrawer.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestadores`
- **Filtros:** `enabled: isOpen` | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** ❌ Ausente (Hook chamado sem `onChange` ou `onPayload`)
- **Debounce:** ❌ Ausente | **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟡 **Alerta (Subscrição Inerte)**
- **Diagnóstico & Correção:** Remover o hook inerte ou adicionar callback funcional.

---

### [64] `OperacoesSuperDomain.tsx`
- **Caminho:** `src/components/admin/super-domains/operacoes/OperacoesSuperDomain.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `orcamentos`, `ordens_servico`, `prestador_demandas`, `ordens_compra`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchLiveMetrics` | **Debounce:** 400ms
- **Status UI:** Badge estático online | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [65] `OrcamentosWorkstation.tsx`
- **Caminho:** `src/components/admin/super-domains/operacoes/OrcamentosWorkstation.tsx`
- **Hook:** 🔴 Duplo: `useRealtimeTable` (Legado) + `.channel()` manual em `useEffect`
- **Tabelas:** `orcamentos` (Duplicada!), `ordens_servico`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** Redundante
- **Callback:** `debouncedFetch` no canal manual; `setRtRefreshKey` inerte no legado
- **Debounce:** 400ms manual | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🔴 **Crítico (Hook Legado + Double Sub + Date.now)**
- **Diagnóstico & Correção:** Unificar em uma única chamada `useRealtimeSubscription`.

---

### [66] `OrdensAssinaturaModule.tsx`
- **Caminho:** `src/components/admin/OrdensAssinaturaModule.tsx`
- **Hook:** `useRealtimeSubscription` (🔴 **VIOLAÇÃO DE REGRAS DE HOOKS**)
- **Tabelas:** `ordens_assinatura`, `assinaturas`, `faturas`, `orcamentos`, `clientes` (5 tabelas)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** 🔴 Quebrado sob filtros
- **Callback:** `fetchOrdens` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🔴 **Crítico**
- **Diagnóstico & Correção:** Mover `useEffect` e `useRealtimeSubscription` para fora da função assíncrona `fetchOrdens` e alocá-los no corpo raiz do componente funcional.

---

### [67] `OrdensCompraModule.tsx`
- **Caminho:** `src/components/admin/OrdensCompraModule.tsx`
- **Hook:** `useRealtimeSubscription` (🔴 **VIOLAÇÃO DE REGRAS DE HOOKS**)
- **Tabelas:** `ordens_compra`, `produtos`, `faturas`, `cupons_loja`, `orcamentos`, `clientes`, `pagamentos` (7 tabelas)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** 🔴 Quebrado sob filtros
- **Callback:** `fetchOrdens` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🔴 **Crítico**
- **Diagnóstico & Correção:** Mover `useEffect` e `useRealtimeSubscription` para o nível raiz do componente funcional.

---

### [68] `PartnersAdminModule.tsx`
- **Caminho:** `src/components/admin/PartnersAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `parceiros`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load()` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [69] `PartnersPage.tsx`
- **Caminho:** `src/components/public/PartnersPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `parceiros`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `setReloadKey(k => k + 1)` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [70] `PaymentModal.tsx`
- **Caminho:** `src/components/client/financeiro/PaymentModal.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `clientes`, `vouchers`
- **Filtros:** `id=eq.${fatura.cliente_id}`, `enabled: isOpen && Boolean(fatura?.cliente_id)`
- **Eventos:** `*` | **Cleanup:** ✅ Perfeito via `enabled`
- **Callback:** `fetchClientData`, `fetchAvailableVouchers` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Exemplo de excelência no uso de filtro e `enabled`).

---

### [71] `PayoutClearanceDrawer.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/PayoutClearanceDrawer.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestador_saques`, `saques`
- **Filtros:** `enabled: isOpen` | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** ❌ Ausente (Hook sem `onChange` ou `onPayload`)
- **Debounce:** ❌ Ausente | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟡 **Alerta (Subscrição Inerte)**

---

### [72] `PessoasSuperDomain.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/PessoasSuperDomain.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestadores`, `prestador_saques`, `saques`, `fornecedores`, `gsa_afiliados`, `career_applications` (6 tabelas)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchDomainMetrics` | **Debounce:** ❌ Ausente
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Recomenda-se adicionar `debounceMs: 300`).

---

### [73] `PrestadorDetailDrawer.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/PrestadorDetailDrawer.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestadores`, `prestador_demandas`
- **Filtros:** Nenhum em `prestador_demandas` (Broadcast)
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** Callback anônimo inline nas dependências `[activeTab, prestadorId]`
- **Debounce:** Padrão | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟡 **Alerta (AP1/AP5)**
- **Diagnóstico & Correção:** Encapsular callback com `useCallback` e filtrar por `prestador_id`.

---

### [74] `PrestadoresSection.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/PrestadoresSection.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestadores`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchPrestadores` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [75] `ProdutosModule.tsx`
- **Caminho:** `src/components/admin/ProdutosModule.tsx`
- **Hook:** `useRealtimeSubscription` (🔴 **VIOLAÇÃO DE REGRAS DE HOOKS**)
- **Tabelas:** 7 tabelas (`produtos`, `loja_categorias`, `loja_estoque_historico`, `produto_fornecedor_config`, `produto_variantes`, `produto_variacao_grupos`, `produto_variacao_opcoes`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** 🔴 Inválido
- **Callback:** `fetchProdutos` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 7 tabelas existem
- **Classificação:** 🔴 **Crítico**
- **Diagnóstico & Correção:** Mover `useRealtimeSubscription` e `useEffect` para fora da função assíncrona `fetchProdutos`, no topo do componente funcional.

---

### [76] `ProtectionAdminModule.tsx`
- **Caminho:** `src/components/admin/ProtectionAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 10 tabelas de proteção (`saude_contratos`, `parceiros`, `cotacoes`, `propostas`, `atendimentos`, `assessorias`, `comissoes`, `documentos`, `assistencias`, `sinistros`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [77] `ProtocolConsultPage.tsx`
- **Caminho:** `src/components/public/ProtocolConsultPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `parceiros_resgates`
- **Filtros:** `protocolo=eq.${result.protocolo}`, `enabled: Boolean(result?.protocolo)`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido via `enabled`
- **Callback:** `fetchResultSafe` | **Debounce:** 500ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK** (Padrão exemplar de segurança com filtro por protocolo).

---

### [78] `PurchasesPage.tsx`
- **Caminho:** `src/components/client/store/PurchasesPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `orcamentos`, `ordens_compra`, `ordens_assinatura`, `loja_pedido_itens`, `loja_pedidos`
- **Filtros:** `cliente_id=eq.${clientId}` em pedidos e orçamentos; **SEM FILTRO** em `loja_pedido_itens`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchAllPurchases` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🔴 **Crítico (AP1 Broadcast)**
- **Diagnóstico & Correção:** Remover ou filtrar `loja_pedido_itens` para evitar re-fetches a cada item comprado na plataforma.

---

### [79] `RentabilidadeReembolsosView.tsx`
- **Caminho:** `src/components/admin/super-domains/financeiro/RentabilidadeReembolsosView.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `loja_reembolsos`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [80] `SaquesList.tsx`
- **Caminho:** `src/components/client/financeiro/SaquesList.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `saques`
- **Filtros:** `cliente_id=eq.${clientId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [81] `SaquesRepassesSection.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/SaquesRepassesSection.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `prestador_saques`, `saques`
- **Filtros:** Nenhum (Admin) | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchWithdrawals`, `fetchPrestadorWithdrawals` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [82] `ScrapingAdminModule.tsx`
- **Caminho:** `src/components/admin/ScrapingAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `automacao_scraping_configs`, `system_settings`
- **Filtros:** `key=eq.n8n_base_url` em settings
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [83] `ServicePackagesModule.tsx`
- **Caminho:** `src/components/admin/ServicePackagesModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `servicos`, `catalog_packages`, `catalog_services`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** `servicos` (✅), `catalog_packages` (❌ Inexistente; no DB é `servicos_pacotes`), `catalog_services` (❌ Inexistente)
- **Classificação:** 🔴 **Crítico**
- **Diagnóstico & Correção:** Substituir `catalog_packages` por `servicos_pacotes` e remover `catalog_services`.

---

### [84] `ServicosModule.tsx`
- **Caminho:** `src/components/admin/ServicosModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `servicos`, `loja_categorias`, `catalog_services`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchServicos`, `onPayload` em `selectedServico`
- **Debounce:** 300ms | **Status UI:** Silencioso | **Schema DB:** `catalog_services` (❌ Inexistente)
- **Classificação:** 🟡 **Alerta**
- **Diagnóstico & Correção:** Remover entrada inócua `catalog_services`.

---

### [85] `ShopeeOperationsModule.tsx`
- **Caminho:** `src/components/admin/ShopeeOperationsModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `shopee_fulfillment_jobs`, `shopee_automation_workers`, `ordens_compra`, `orcamentos` (4 tabelas)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 500ms
- **Status UI:** Status visual de workers | **Schema DB:** ✅ Todas as 4 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [86] `SiteCampaignAdminModule.tsx`
- **Caminho:** `src/components/admin/SiteCampaignAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `system_settings`, `site_campaigns`, `site_campaign_events`
- **Filtros:** `key=eq.site_campaigns` em settings
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [87] `StoreHub.tsx`
- **Caminho:** `src/components/client/StoreHub.tsx`
- **Hook:** Misto: `useRealtimeSubscription` + 4 canais manuais `.channel()` em `useEffect`
- **Tabelas:** `produtos`, `loja_carrinhos`, `orcamentos`, `loja_reembolsos`, `cliente_promocoes`, `loja_solicitacoes`
- **Filtros:** `cliente_id=eq.${clientId}` nos canais manuais
- **Eventos:** `*` | **Cleanup:** ✅ Presente
- **Callback:** `fetchAllPurchases`, `fetchMyRefunds`, `fetchVipPromos`
- **Debounce:** ❌ Ausente nos canais manuais | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🔴 **Crítico (AP2/AP4 - Reconexões contínuas por dependências de modais)**
- **Diagnóstico & Correção:** Consolidar todos os canais no `useRealtimeSubscription` dependendo apenas de `clientId`.

---

### [88] `SupportConversationModal.tsx`
- **Caminho:** `src/components/common/SupportConversationModal.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `suporte_mensagens` (filtro: `suporte_id=eq.${currentSuporte.id}`), `prestador_suporte_demandas`
- **Filtros:** `enabled: Boolean(isOpen && currentSuporte?.id)`
- **Eventos:** `INSERT`, `UPDATE` granulares | **Cleanup:** ✅ Garantido
- **Callback:** `onPayload` adiciona mensagem na memória sem re-fetch de rede
- **Debounce:** 0ms | **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK** (Padrão de referência para chat em modal).

---

### [89] `SystemMonitorModule.tsx`
- **Caminho:** `src/components/admin/SystemMonitorModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 7 tabelas (`colaboradores`, `clientes`, `fornecedores`, `prestadores`, `gsa_afiliados`, `sistema_logs`, `system_settings`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load(true)`, `fetchFallbackUsers()` | **Debounce:** 500ms
- **Status UI:** Métricas e status live de VPS | **Schema DB:** ✅ Todas as 7 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [90] `TrabalheConoscoSection.tsx`
- **Caminho:** `src/components/admin/super-domains/pessoas/TrabalheConoscoSection.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `career_applications`, `trabalhe_conosco`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchApplications(true)` | **Debounce:** Padrão
- **Status UI:** Silencioso | **Schema DB:** ❌ **TABELAS FANTASMAS!** (Tabela canônica no PostgreSQL é `gsa_careers_applications`).
- **Classificação:** 🔴 **Crítico**
- **Diagnóstico & Correção:** Corrigir para `{ table: 'gsa_careers_applications', onChange: () => fetchApplications(true), debounceMs: 300 }`.

---

### [91] `TravelAdminModule.tsx`
- **Caminho:** `src/components/admin/TravelAdminModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** 8 tabelas (`viagens_pacotes`, `viagens_propostas`, `viagens_transacoes`, `viagens_orcamentos`, `viagens_categorias`, `viagens_passageiros`, `viagens_pacote_imagens`, `clientes`)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `load` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 8 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [92] `TravelCancellationsPage.tsx`
- **Caminho:** `src/components/client/marketplace/travel/TravelCancellationsPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `viagens_transacoes`, `viagens_cancelamentos`
- **Filtros:** `cliente_id=eq.${clientId}` em transações
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchTrips()` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Tabelas existem
- **Classificação:** 🟢 **OK**

---

### [93] `TravelProposalsPage.tsx`
- **Caminho:** `src/components/client/marketplace/travel/TravelProposalsPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `viagens_propostas`
- **Filtros:** `cliente_id=eq.${clientId}`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchPropostas` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [94] `TravelQuoteRequestPage.tsx`
- **Caminho:** `src/components/client/marketplace/travel/TravelQuoteRequestPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `viagens_pacotes`
- **Filtros:** `id=eq.${packageId}`, `enabled: Boolean(packageId)`
- **Eventos:** `*` | **Cleanup:** ✅ Garantido via `enabled`
- **Callback:** `loadPackage()` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [95] `TravelReservationPage.tsx`
- **Caminho:** `src/components/client/marketplace/travel/TravelReservationPage.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `viagens_transacoes`, `viagens_passageiros`, `viagens_passageiro_documentos`, `viagens_vouchers` (4 tabelas)
- **Filtros:** `id=eq.${transacaoId}` em transações
- **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `fetchTripDetails` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Todas as 4 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [96] `usePublicRegistrationSettings.ts`
- **Caminho:** `src/hooks/usePublicRegistrationSettings.ts`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `system_settings`
- **Filtros:** `enabled` | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `refresh` | **Debounce:** 300ms
- **Status UI:** N/A (Hook de contexto) | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

### [97] `VendasModule.tsx`
- **Caminho:** `src/components/admin/VendasModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `orcamentos`, `ordens_servico`, `ordens_compra`, `ordens_assinatura`, `prestador_demandas` (5 tabelas)
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `setRtRefreshKey(k => k + 1)` | **Debounce:** 300ms
- **Status UI:** Badges de pendências reativas | **Schema DB:** ✅ Todas as 5 tabelas existem
- **Classificação:** 🟢 **OK**

---

### [98] `ViagensCategoriasModule.tsx`
- **Caminho:** `src/components/admin/ViagensCategoriasModule.tsx`
- **Hook:** `useRealtimeSubscription` (Canônico)
- **Tabelas:** `viagens_categorias`
- **Filtros:** Nenhum | **Eventos:** `*` | **Cleanup:** ✅ Garantido
- **Callback:** `loadData` | **Debounce:** 300ms
- **Status UI:** Silencioso | **Schema DB:** ✅ Existe
- **Classificação:** 🟢 **OK**

---

## 4. R3: Auditoria de Lacunas de Cobertura (Componentes SEM Realtime)

A auditoria identificou **29 módulos e componentes** que manipulam dados altamente dinâmicos via `useEffect` estático (one-shot fetch), forçando o usuário a recarregar a página (F5) ou clicar manualmente em "Atualizar".

### 4.1 Catálogo Estruturado de Oportunidades por Domínio de Negócio

#### Domínio 1: Classificados & Negociações P2P (Marketplace C2C)
1. **`ClassifiedsClientDashboard.tsx` (🔴 P0):** Central de controle do vendedor/comprador. Deve assinar `classificados_anuncios`, `classificados_propostas`, `classificados_transacoes`, `classificados_comissoes` com filtro `cliente_id=eq.${clientId}` e `debounceMs: 300`.
2. **`MyNegotiationsPage.tsx` (🔴 P0):** Negociações ativas de ofertas e contrapropostas. Deve assinar `classificados_propostas` com filtro por `comprador_id` / `vendedor_id` e `debounceMs: 200`.
3. **`MyClassifiedSalesPage.tsx` (🔴 P0):** Confirmação de recebimento de pagamentos Pix da GSA ao vendedor. Deve assinar `classificados_transacoes` com filtro `vendedor_id=eq.${clientId}` e `debounceMs: 250`.
4. **`MyClassifiedCommissionsPage.tsx` (🟡 P1):** Quitação de comissões devidas. Assinar `classificados_comissoes` filtrada por `vendedor_id=eq.${clientId}` e `debounceMs: 250`.
5. **`MyClassifiedsPage.tsx` (🟡 P1):** Moderação e solicitação de ajustes de anúncios. Assinar `classificados_anuncios` e `classificados_ajustes` com `debounceMs: 300`.
6. **`ClassifiedDetailPage.tsx` (🟡 P1):** Página pública do item. Assinar `classificados_anuncios` com `filter: slug=eq.${slug}` e evento `UPDATE` para atualizar preço ou pausar item vendido.
7. **Vitrines Públicas (`GeneralClassifiedsPage.tsx`, `RealEstateMarketplacePage.tsx`, `VehiclesMarketplacePage.tsx`) (🟢 P2):** Assinar `classificados_anuncios` com `debounceMs: 1000`.

#### Domínio 2: Marketplace de Viagens & Turismo
8. **`MyTripsPage.tsx` (🔴 P0):** Liberação de vouchers e passagens em PDF. Deve assinar `viagens_transacoes` (`cliente_id=eq.${clientId}`) e `viagens_vouchers` (`INSERT`) com `debounceMs: 300`.
9. **`TravelCategoryPage.tsx` & `TravelPackageDetailPage.tsx` (🟢 P2):** Assinar `viagens_pacotes` com evento `UPDATE` e `debounceMs: 500`.

#### Domínio 3: E-Commerce Store & Engajamento do Cliente
10. **`ProductReviews.tsx` (🟡 P1):** Social proof ao vivo. Assinar `loja_avaliacoes` com filtro `produto_id=eq.${productId}` e `debounceMs: 300`.
11. **`StoreHubCoupons.tsx` (🟡 P1):** Cupons com limite de resgate (`limite_usos`). Assinar `cupons_loja` e `cupons_ativados` com `enabled: isOpen` e `debounceMs: 300`.
12. **`WishlistPage.tsx` (🟢 P2):** Sincronização multi-aba/dispositivo de favoritos. Assinar `loja_favoritos` com `filter: cliente_id=eq.${clientId}` e `debounceMs: 250`.
13. **`OrderReviewModal.tsx` (🟢 P2):** Assinar `loja_avaliacoes` filtrada por `orcamento_id=eq.${orderId}` com `debounceMs: 200`.
14. **`BlogHome.tsx` / `BlogPostPage.tsx` (🟢 P3):** Assinar `blog_posts` com `debounceMs: 1000`.

#### Domínio 4: Infraestrutura, Monitoramento & Segurança de Sessão
15. **`WhatsAppQRCodeManager.tsx` (🔴 P0):** Status de pareamento da VPS e ramais de transbordo. Assinar `system_settings` e `gsa_whatsapp_ramais` com `debounceMs: 300`.
16. **`SystemStatusIndicator.tsx` (🟡 P1):** Substituir probe estático pelo status reativo retornado por `useRealtimeSubscription` (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`).
17. **`AdminPanel.tsx` (RBAC Colaboradores) (🟡 P1):** Revogação de acesso e permissões em tempo real. Assinar `colaboradores` com `filter: id=eq.${colaboradorId}` e efetuar logout automático se `ativo === false`.
18. **`usePixDiscount.ts` (🟢 P2):** Atualização instantânea de desconto Pix nos checkouts. Assinar `system_settings` (`key=eq.pix_discount_settings`).
19. **`GSAChatbotWidget.tsx` (🟢 P2):** Rotação de ramal do botão flutuante. Assinar `system_settings`.

#### Domínio 5: Relatórios Executivos, Financeiros & Operacionais (Cockpit Live)
20. **`RelatorioFinanceiro.tsx` (🟡 P1):** Faturamento e Pix recebido no dia. Assinar `faturas`, `pagamentos`, `saques`, `transferencias` com `debounceMs: 500`.
21. **`RelatorioExecutivo.tsx` (🟡 P1):** KPIs consolidados. Assinar `faturas`, `clientes`, `ordens_servico`, `saques` com `debounceMs: 600`.
22. **`RelatorioOS.tsx` (🟡 P1):** Assinar `ordens_servico` e `orcamentos` com `debounceMs: 500`.
23. **`RelatorioCobranca.tsx` (🟡 P1):** Assinar `cobrancas` com `debounceMs: 400`.
24. **`RelatorioSuporte.tsx` (🟡 P1):** Assinar `tickets` com `debounceMs: 400`.
25. **`RelatorioPrestadores.tsx` (🟢 P2):** Assinar `prestadores`, `prestador_demandas`, `prestador_saques` com `debounceMs: 500`.
26. **`RelatorioLoja.tsx` (🟢 P2):** Assinar `faturas` e `loja_solicitacoes` com `debounceMs: 500`.
27. **`RelatorioEmprestimos.tsx` & `RelatorioCredito.tsx` (🟢 P2):** Assinar `emprestimos`, `emprestimo_parcelas`, `loja_credito_solicitacoes` com `debounceMs: 500`.
28. **`RelatorioMarketing.tsx` & `RelatorioGamificacao.tsx` (🟢 P2):** Assinar `indicacoes`, `vouchers`, `pontos_movimentacoes` com `debounceMs: 500`.
29. **`RelatorioFiscal.tsx` & `RelatorioOperacional.tsx` (🟢 P2):** Assinar `ordens_fiscais` e `solicitacoes_exclusao` com `debounceMs: 500`.

---

## 5. R4: Auditoria e Plano de Migração do Hook Legado `useRealtimeTable`

A auditoria confirmou que o hook `useRealtimeTable` está presente em apenas **2 arquivos operacionais**:
1. `src/components/admin/ConfiguracoesModule.tsx`
2. `src/components/admin/super-domains/operacoes/OrcamentosWorkstation.tsx`

### 5.1 Blueprint de Migração Exata (Before / After)

#### Componente 1: `src/components/admin/ConfiguracoesModule.tsx`
```typescript
// ANTES (ConfiguracoesModule.tsx linhas 4 e 27):
import { useRealtimeTable } from '../../hooks/useRealtimeTable';
...
const [, setRtRefreshKey] = useState(0);
useRealtimeTable('system_settings', () => setRtRefreshKey(k => k + 1));

// DEPOIS (Migração Canônica Equivalente):
import { useRealtimeSubscription } from '../../hooks/useRealtime';
...
useRealtimeSubscription({
  table: 'system_settings',
  debounceMs: 300,
  onChange: () => {
    void load();
  },
});
```

#### Componente 2: `src/components/admin/super-domains/operacoes/OrcamentosWorkstation.tsx`
```typescript
// ANTES (OrcamentosWorkstation.tsx linhas 8, 48 e 152-172):
import { useRealtimeTable } from '../../../../hooks/useRealtimeTable';
...
useRealtimeTable(['orcamentos', 'ordens_servico'], () => setRtRefreshKey(k => k + 1));
...
useEffect(() => {
  const channel = supabase.channel(`admin-orcamentos-sd1-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, () => debouncedFetch())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [statusFilter]);

// DEPOIS (Migração Canônica Unificada):
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
...
useRealtimeSubscription([
  {
    table: 'orcamentos',
    debounceMs: 400,
    onChange: () => {
      void fetchOrcamentos();
    },
  },
  {
    table: 'ordens_servico',
    debounceMs: 400,
    onChange: () => {
      void fetchOrcamentos();
    },
  },
]);
```

### 5.2 Cronograma de Desativação e EOL (End-of-Life)
1. **Fase 1:** Aplicar as migrações em `ConfiguracoesModule.tsx` e `OrcamentosWorkstation.tsx`.
2. **Fase 2:** Substituir `src/hooks/useRealtimeTable.ts` por um shim com `@deprecated` apontando para `useRealtimeSubscription`.
3. **Fase 3:** Executar a suíte de testes de guarda `vitest run src/tests/realtime-hook.test.ts`.
4. **Fase 4:** Deletar permanentemente o arquivo `src/hooks/useRealtimeTable.ts`.

---

## 6. R5: Auditoria de Performance e Anti-Patterns

A auditoria identificou instâncias dos 7 anti-patterns canônicos no ecossistema:

### 6.1 Catálogo dos 7 Anti-Patterns com Trechos de Código

#### AP1: Broadcast sem Filtro em Tabelas Multi-Tenant
* **`useClientNotifications.tsx:318`:** `table: 'notificacoes'` sem filtro de `cliente_id`, despachando mensagens de todos os clientes no WebSocket e filtrando na memória do navegador.
* **`AfiliadoDashboard.tsx:392` & `AfiliadosSection.tsx:182`:** `table: 'saques'` sem filtro por afiliado.
* **`PurchasesPage.tsx:323`:** `table: 'loja_pedido_itens'` sem filtro por cliente/pedido.
* **`CouponsPage.tsx:170`:** `table: 'cupons_ativados'` sem filtro por cliente.
* **`PrestadorDetailDrawer.tsx:83`:** `table: 'prestador_demandas'` sem filtro por prestador.

#### AP2: Channel Names Instáveis (`Date.now()` / `Math.random()`)
* **`OrcamentosWorkstation.tsx:161` & `OrdensServicoWorkstation.tsx:150`:** `.channel('admin-orcamentos-sd1-' + Date.now())` recriado a cada troca de filtro.
* **`useRealtimeTable.ts:11`:** `channelName = 'rt-' + prefix + '-' + Date.now()`.
* **`useVipLevels.ts:48`:** `.channel('vip-changes-' + Math.random().toString(36))`.

#### AP3: Missing Cleanup & Gerenciamento Incorreto de Unmount
* **`ClientGSAStore.tsx:620`:** Criação de 5 canais avulsos simultâneos (`gsa-store-items`, `gsa-store-coupons`, `gsa-store-promos`, `cart-${clientId}`, `wa-sync-store`) com risco de conexões órfãs.
* **`supplierOperations.ts:117`:** Timeout que resolve a Promise antes do evento `JOINING`, arriscando falha no `supabase.removeChannel`.

#### AP4: Double Subscription (Assinaturas Concorrentes)
* **`OrcamentosWorkstation.tsx`:** Assina `orcamentos` no hook legado e no `useEffect` manual.
* **`StoreHub.tsx:153, 635`:** Assina `produtos`/`loja_carrinhos` no topo e abre 4 canais manuais adicionais no `useEffect` dos modais.
* **`ProtectionAdminModule.tsx:163, 222`:** Assinatura redundante no componente pai e no filho `ProtectionResourceWorkstation`.

#### AP5: onChange e deps Instáveis
* **`FiscalView.tsx:87`:** Passa `[loadData]` instável no array de dependências do hook, causando teardown e reconstrução do WebSocket a cada clique de aba.
* **`ProtectionAdminModule.tsx:222`:** Passa `[resource, load]` instável no array de dependências.

#### AP6: Polling Mascarado Concorrente ao Realtime CDC
* **`CheckoutPixModal.tsx:168`:** Executa `setInterval(..., 3000)` E mantém duas conexões WebSocket em `orcamentos` e `faturas`.
* **`Dashboard.tsx:200`:** `setInterval(..., 60000)` concorrente a 13 subscriptions Realtime.
* **`SiteCampaignBootstrap.tsx:40`:** `setInterval(..., 30000)` fazendo polling em `site_campaigns`.

#### AP7: Realtime em Componentes Inativos
* **`DemandasDetalhesModal.tsx:130` & `NovaDemandaModal.tsx:68`:** Subscrições sem `enabled: isOpen`.
* **`CreateListingWizard.tsx:77`:** Mantém conexão aberta mesmo com wizard fechado.

---

## 7. R6: Auditoria do VPS Webhook & WhatsApp Bot Realtime

O subsistema daemon WhatsApp VPS (`server_webhook_vps_live.cjs` e `lib/antiBanEngine.cjs`) opera atualmente com **100% de consultas REST síncronas** dirigidas à porta local `http://127.0.0.1:3001` via `http.request`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VPS REALTIME ARCHITECTURE                          │
│                                                                             │
│   [ PostgreSQL CDC ] ──► [ ServerRealtimeManager ] ──► [ AntiBanEngine ]    │
│                                (Daemon WebSocket)       (Humanized Queue)   │
│                                        │                        │           │
│                                        ▼                        ▼           │
│                               [ Local Cache Bust ]     [ Evolution API ]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Principais Vulnerabilidades e Defeitos no Webhook VPS

1. **Bug Crítico de Inbound Webhook (`/webhook/supabase-update`):**
   - As tabelas `loja_pedidos`, `orcamentos` e `os_servicos` armazenam `cliente_id` (UUID), e não o telefone diretamente. A lógica em `server_webhook_vps_live.cjs:8822` busca `record.telefone`, avaliando para `null`. Como resultado, **nenhuma notificação automática de pedido ou ordem de serviço é enviada ao cliente**.
2. **Condição de Corrida por Rajadas de Mensagens (Falta de Mutex):**
   - Mensagens enviadas em rápida sucessão pelo mesmo telefone executam em paralelo em `processMessage` sem lock, corrompendo `userSessions[fromPhone]` e gerando tickets duplicados.
3. **Conversão de Pontos Não-Atômica (Read-Modify-Write):**
   - Em `server_webhook_vps_live.cjs:4990-5008`, o saldo é lido da memória Node.js e gravado via `supabasePatch`, vulnerável a double-spending e perda de saldo sob concorrência.
4. **Colisões de Protocolo com `Math.random()`:**
   - Protocolos de tickets (`TKT-YYYY-XXXX`) e faturas utilizam `Math.floor(1000 + Math.random() * 9000)`, fornecendo apenas 9.000 slots anuais.
5. **Bug de Fallback da Variável `SERVICE_ROLE_JWT`:**
   - Em `server_webhook_vps_live.cjs:2902`, a variável `SERVICE_ROLE_JWT` é inicializada como string vazia se `process.env.SUPABASE_SERVICE_ROLE_KEY` não for exportada, causando falhas `401 Unauthorized` nas queries PostgREST.

---

### 7.2 Blueprints Acionáveis para o Webhook VPS

#### Blueprint 1: `ServerRealtimeManager` (`lib/serverRealtimeManager.cjs`)
```javascript
'use strict';
const { createClient } = require('@supabase/supabase-js');
const antiBanEngine = require('./antiBanEngine.cjs');

class ServerRealtimeManager {
  constructor(supabaseUrl, serviceRoleKey, options = {}) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false }
    });
    this.channel = null;
    this.onCatalogInvalidate = options.onCatalogInvalidate || (() => {});
  }

  start() {
    console.log('📡 [Server Realtime] Inicializando listener PostgreSQL CDC...');
    
    this.channel = this.supabase.channel('vps-whatsapp-cdc')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tickets_mensagens',
        filter: 'tipo=eq.operador'
      }, async (payload) => {
        await this.handleOperatorMessage(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'loja_pedidos'
      }, async (payload) => {
        await this.handleOrderStatusUpdate(payload.old, payload.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => this.onCatalogInvalidate('produtos'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servicos' }, () => this.onCatalogInvalidate('servicos'))
      .subscribe((status) => {
        console.log(`📡 [Server Realtime] Status da Subscription: ${status}`);
      });
  }

  async handleOperatorMessage(msg) {
    if (!msg || !msg.ticket_id || !msg.mensagem) return;
    const { data: ticket } = await this.supabase
      .from('tickets')
      .select('id, cliente_id, clientes(telefone)')
      .eq('id', msg.ticket_id)
      .single();

    if (!ticket?.clientes?.telefone) return;
    const clientPhone = ticket.clientes.telefone.replace(/\D/g, '');
    const text = `👨‍💼 *ATENDENTE GSA:*\n\n${msg.mensagem}\n\n_Chamado #${ticket.id}_`;
    await antiBanEngine.sendWhatsAppReply(clientPhone, text);
  }

  async handleOrderStatusUpdate(oldRecord, newRecord) {
    if (!oldRecord || !newRecord || oldRecord.status === newRecord.status) return;
    const { data: order } = await this.supabase
      .from('loja_pedidos')
      .select('id, total, clientes(telefone, nome)')
      .eq('id', newRecord.id)
      .single();

    if (!order?.clientes?.telefone) return;
    const phone = order.clientes.telefone.replace(/\D/g, '');
    const clientName = (order.clientes.nome || 'Cliente').split(' ')[0];
    const statusMap = {
      'pago': '✅ *Pagamento Aprovado!* Seu pedido já está sendo preparado.',
      'em_expedicao': '📦 *Em Preparação!* Seu pacote está sendo embalado.',
      'em_transporte': '🚚 *Saiu para Entrega!* Seu pedido está a caminho.',
      'entregue': '🎉 *Pedido Entregue!* Esperamos que aproveite sua compra.',
      'cancelado': '❌ *Pedido Cancelado.* Se precisar de ajuda, chame nosso suporte!'
    };
    const statusMsg = statusMap[newRecord.status.toLowerCase()];
    if (statusMsg) {
      await antiBanEngine.sendWhatsAppReply(phone, `Olá, *${clientName}*!\n\n${statusMsg}\n\n*Pedido:* #${newRecord.id}`);
    }
  }

  stop() {
    if (this.channel) this.supabase.removeChannel(this.channel);
  }
}

module.exports = ServerRealtimeManager;
```

#### Blueprint 2: `SessionMutex` para Mensagens Concorrentes (`lib/sessionMutex.cjs`)
```javascript
'use strict';

class SessionMutex {
  constructor() {
    this.locks = new Map();
  }

  async runExclusive(phone, taskFn) {
    const cleanPhone = String(phone).replace(/\D/g, '');
    const currentLock = this.locks.get(cleanPhone) || Promise.resolve();

    let release;
    const nextLock = new Promise(resolve => { release = resolve; });
    this.locks.set(cleanPhone, currentLock.then(() => nextLock));

    await currentLock;
    try {
      return await taskFn();
    } finally {
      release();
      if (this.locks.get(cleanPhone) === nextLock) {
        this.locks.delete(cleanPhone);
      }
    }
  }
}

module.exports = new SessionMutex();
```

#### Blueprint 3: Stored Procedure SQL Atômica para Conversão de Pontos
```sql
CREATE OR REPLACE FUNCTION gsa_converter_pontos_carteira(
  p_cliente_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pontos INT;
  v_valor_convertido NUMERIC(10,2);
  v_novo_saldo NUMERIC(10,2);
BEGIN
  SELECT saldo_pontos, saldo_carteira
  INTO v_pontos, v_novo_saldo
  FROM clientes
  WHERE id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  IF COALESCE(v_pontos, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo de pontos insuficiente');
  END IF;

  v_valor_convertido := ROUND(v_pontos / 100.0, 2);
  v_novo_saldo := COALESCE(v_novo_saldo, 0) + v_valor_convertido;

  UPDATE clientes
  SET 
    saldo_pontos = 0,
    saldo_carteira = v_novo_saldo,
    updated_at = NOW()
  WHERE id = p_cliente_id;

  INSERT INTO transacoes_carteira (
    cliente_id, tipo, valor, descricao, saldo_anterior, saldo_posterior
  ) VALUES (
    p_cliente_id, 'credito_pontos', v_valor_convertido,
    format('Conversão de %s pontos fidelidade', v_pontos),
    v_novo_saldo - v_valor_convertido, v_novo_saldo
  );

  RETURN jsonb_build_object(
    'success', true,
    'pontos_convertidos', v_pontos,
    'valor_creditado', v_valor_convertido,
    'novo_saldo_carteira', v_novo_saldo
  );
END;
$$;
```

---

## 8. Plano de Remediação Priorizado (P0 / P1 / P2)

| Prioridade | Domínio / Arquivo Alvo | Problema Técnico | Ação Recomendada | Esforço Estimado |
| :--- | :--- | :--- | :--- | :---: |
| **🔴 P0** | `src/hooks/useRealtime.ts` | Stale closures em callbacks e index desync com `enabled: false` | Aplicar drop-in replacement corrigido da infraestrutura base | 30 min |
| **🔴 P0** | `ProdutosModule.tsx`, `OrdensAssinaturaModule.tsx`, `OrdensCompraModule.tsx` | Violação de Regras de Hooks (declarados dentro de funções assíncronas) | Mover `useEffect` e `useRealtimeSubscription` para a raiz dos componentes | 45 min |
| **🔴 P0** | `AdvertisingAdminModule.tsx`, `ServicePackagesModule.tsx`, `TrabalheConoscoSection.tsx` | Tabelas fantasmas inexistentes no PostgreSQL | Corrigir nomes para `gsa_ad_*`, `servicos_pacotes`, `gsa_careers_applications` | 30 min |
| **🔴 P0** | `OrcamentosWorkstation.tsx`, `ConfiguracoesModule.tsx` | Uso do hook legado `useRealtimeTable` e refresh quebrado | Migrar para `useRealtimeSubscription` com 100% de equivalência | 30 min |
| **🔴 P0** | `useClientNotifications.tsx`, `AfiliadoDashboard.tsx`, `PurchasesPage.tsx` | Broadcast sem filtro em tabelas multi-tenant (`notificacoes`, `saques`, `loja_pedido_itens`) | Aplicar filtros de linha obrigatórios (`cliente_id`, `afiliado_id`) | 30 min |
| **🔴 P0** | `server_webhook_vps_live.cjs:2902, 9153, 4990` | Bug de `SERVICE_ROLE_JWT`, race condition de mensagens e conversão de pontos RMW | Integrar `SessionMutex`, RPC atômica e alinhar fallback JWT | 1 hora |
| **🟡 P1** | `server_webhook_vps_live.cjs` | Ausência de Realtime CDC para chat de operadores e status de pedidos | Implementar `ServerRealtimeManager` com listeners em `tickets_mensagens` e `loja_pedidos` | 2 horas |
| **🟡 P1** | `ClassifiedsClientDashboard.tsx`, `MyNegotiationsPage.tsx`, `MyTripsPage.tsx`, `WhatsAppQRCodeManager.tsx` | Componentes críticos sem Realtime (Gap Scan) | Adicionar `useRealtimeSubscription` conforme catálogo da R3 | 2 horas |
| **🟡 P1** | `ClientGSAStore.tsx`, `StoreHub.tsx` | Canais avulsos manuais (.channel) recriados por estado de modais | Unificar em única chamada estável `useRealtimeSubscription` | 1 hora |
| **🟡 P1** | `DemandasDetalhesModal.tsx`, `NovaDemandaModal.tsx`, `StoreHubCoupons.tsx` | Realtime ativo em componentes inativos | Adicionar `enabled: isOpen` nas configurações de assinatura | 30 min |
| **🟡 P1** | `FiscalView.tsx`, `ProtectionAdminModule.tsx` | Callbacks e deps instáveis no hook Realtime | Remover callbacks não-memoizados do array de dependências | 20 min |
| **🟢 P2** | `CheckoutPixModal.tsx`, `Dashboard.tsx`, `SiteCampaignBootstrap.tsx` | Polling mascarado (`setInterval`) concorrente ao CDC | Condicionar polling a falhas do WebSocket e usar `visibilitychange` | 45 min |
| **🟢 P2** | `src/hooks/useRealtimeTable.ts` | Arquivo legado obsoleto | Deletar permanentemente após validação de CI/CD | 10 min |
| **🟢 P2** | Relatórios Administrativos (`RelatorioFinanceiro.tsx`, etc.) | Cockpit estático sem atualização live | Implementar `useRealtimeSubscription` com `debounceMs: 500` | 1.5 horas |

---

## 9. Conclusão e Próximos Passos

O ecossistema Realtime do GSA HUB possui uma fundação arquitetural robusta com 97.9% de conformidade no hook canônico `useRealtimeSubscription`. As correções delineadas neste laudo eliminam os 9 pontos críticos (stale closures, tabelas fantasmas, violações de hooks e race conditions no bot VPS), assegurando escalabilidade, integridade transacional e sincronização instantânea em toda a plataforma.
