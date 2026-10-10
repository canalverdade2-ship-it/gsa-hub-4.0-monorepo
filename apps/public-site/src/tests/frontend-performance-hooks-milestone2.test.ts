import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Milestone 2: Frontend Performance, React Hooks & Realtime Optimization Suite', () => {
  describe('Task 1: Rules of Hooks & Unconditional Invocation in useRealtime.ts', () => {
    const filePath = resolve(process.cwd(), 'src/hooks/useRealtime.ts');
    const content = readFileSync(filePath, 'utf-8');

    it('should not contain conditional hook calls (return useRealtimeSubscription inside if blocks)', () => {
      // Must not have return useRealtimeSubscription inside an if-statement
      expect(content).not.toMatch(/if\s*\([^)]+\)\s*\{\s*[^}]*return\s+useRealtimeSubscription/);
    });

    it('should normalize parameters before calling useRealtimeSubscription at the top level', () => {
      expect(content).toMatch(/const config:\s*RealtimeSubscriptionConfig<T>\s*\|\s*RealtimeSubscriptionConfig<T>\[\]\s*=/);
      expect(content).toMatch(/return useRealtimeSubscription<T>\(config,\s*deps\);/);
    });

    it('should synchronize callbacksRef on every render pass', () => {
      expect(content).toContain('callbacksRef.current = incomingConfigs.map');
    });
  });

  describe('Task 2 & 5: Realtime Channel Stabilization & Pagination in Modules', () => {
    it('ProdutosModule.tsx: uses bounded range and does not thrash realtime on search/filter', () => {
      const filePath = resolve(process.cwd(), 'src/components/admin/ProdutosModule.tsx');
      const content = readFileSync(filePath, 'utf-8');

      // Unbounded while(hasMore) loop must not exist
      expect(content).not.toContain('while (hasMore)');
      expect(content).toContain('.range(0, 999)');

      // useRealtimeSubscription must not depend on fetchProdutos or search
      expect(content).not.toMatch(/useRealtimeSubscription\(\s*\[[\s\S]*?\],\s*\[fetchProdutos/);
    });

    it('AssinaturasModule.tsx: does not pass search/filter deps to useRealtimeSubscription', () => {
      const filePath = resolve(process.cwd(), 'src/components/admin/AssinaturasModule.tsx');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).not.toMatch(/useRealtimeSubscription\(\s*\[[\s\S]*?\],\s*\[activeTab,\s*search/);
    });

    it('OrcamentosWorkstation.tsx: does not pass search/filter deps to useRealtimeSubscription', () => {
      const filePath = resolve(process.cwd(), 'src/components/admin/super-domains/operacoes/OrcamentosWorkstation.tsx');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).not.toMatch(/useRealtimeSubscription\(\s*\[[\s\S]*?\],\s*\[statusFilter,\s*search\]/);
    });

    it('OrdensCompraModule.tsx: does not pass unstable deps to useRealtimeSubscription and uses Map for O(N) enrichment', () => {
      const filePath = resolve(process.cwd(), 'src/components/admin/OrdensCompraModule.tsx');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).not.toMatch(/useRealtimeSubscription\(\s*\[[\s\S]*?\],\s*\[fetchOrdens\]/);
      expect(content).toContain('faturasByOrcamento = new Map');
    });
  });

  describe('Task 3: Context Provider Memoization', () => {
    it('FileViewerContext.tsx: memoizes provider value and wraps handlers in useCallback', () => {
      const filePath = resolve(process.cwd(), 'src/contexts/FileViewerContext.tsx');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('const value = useMemo(() => ({ openFile, closeFile }), [openFile, closeFile]);');
      expect(content).toContain('<FileViewerContext.Provider value={value}>');
      expect(content).toContain('const openFile = useCallback(');
      expect(content).toContain('const closeFile = useCallback(');
    });

    it('useClientNotifications.tsx: memoizes provider value and wraps handlers in useCallback', () => {
      const filePath = resolve(process.cwd(), 'src/hooks/useClientNotifications.tsx');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('const markAsRead = useCallback(');
      expect(content).toContain('const markAllAsRead = useCallback(');
      expect(content).toContain('const value = useMemo(');
      expect(content).toContain('<ClientNotificationContext.Provider value={value}>');
    });

    it('useProviderNotifications.tsx: memoizes provider value', () => {
      const filePath = resolve(process.cwd(), 'src/hooks/useProviderNotifications.tsx');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('const value = useMemo(');
      expect(content).toContain('<ProviderNotificationContext.Provider value={value}>');
    });
  });

  describe('Task 4: Timer Cleanup in OrderSuccessPage.tsx', () => {
    it('OrderSuccessPage.tsx: cleans up confetti animation interval on unmount', () => {
      const filePath = resolve(process.cwd(), 'src/components/client/store/OrderSuccessPage.tsx');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/return\s*\(\)\s*=>\s*\{\s*if\s*\(interval\)\s*clearInterval\(interval\);?\s*\};?/);
    });
  });
});
