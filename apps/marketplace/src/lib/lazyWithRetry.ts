import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Carrega componentes dinâmicos de forma resiliente com retentativas automáticas
 * e recuperação contra falhas de cache/HMR do Vite e atualizações de chunks.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: any }>,
  exportName?: string
): LazyExoticComponent<T> {
  return lazy(async () => {
    const isChunkReloadTriggered = typeof window !== 'undefined' && window.sessionStorage.getItem('gsa_chunk_reload_triggered');

    try {
      const module = await factory();
      const component = exportName ? (module as any)[exportName] : (module as any).default || module;
      if (!component) {
        throw new Error(`Export '${exportName || 'default'}' não encontrado no módulo importado.`);
      }
      // Limpa flag de reload caso o carregamento tenha funcionado
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('gsa_chunk_reload_triggered');
      }
      return { default: component };
    } catch (error: any) {
      console.warn('[LazyRetry] Erro ao carregar módulo dinâmico, tentando novamente...', error);

      // Tentativa imediata de retry após breve intervalo
      try {
        await new Promise((resolve) => setTimeout(resolve, 350));
        const retryModule = await factory();
        const retryComponent = exportName ? (retryModule as any)[exportName] : (retryModule as any).default || retryModule;
        if (retryComponent) {
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('gsa_chunk_reload_triggered');
          }
          return { default: retryComponent };
        }
      } catch (retryError: any) {
        const errorMsg = String(retryError?.message || error?.message || '');
        const isDynamicImportError =
          errorMsg.includes('Failed to fetch dynamically imported module') ||
          errorMsg.includes('Importing a module script failed') ||
          errorMsg.includes('Loading chunk') ||
          retryError?.name === 'ChunkLoadError' ||
          error?.name === 'ChunkLoadError';

        if (isDynamicImportError && typeof window !== 'undefined' && !isChunkReloadTriggered) {
          console.warn('[LazyRetry] Mismatch de chunk / HMR detectado. Recarregando a página de forma limpa...');
          window.sessionStorage.setItem('gsa_chunk_reload_triggered', 'true');
          window.location.reload();
          return new Promise(() => {}); // Aguarda reload
        }

        throw retryError;
      }

      throw error;
    }
  });
}
