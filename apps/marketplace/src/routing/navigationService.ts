import { NavigationOptions } from './types';

type RouteChangeListener = (location: { pathname: string; search: string; hash: string }) => void;

class NavigationService {
  private listeners: Set<RouteChangeListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        this.notify();
      });
    }
  }

  // Inscreve no evento de mudança de rota
  subscribe(listener: RouteChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Notifica todos os ouvintes do React
  private notify() {
    const loc = {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash
    };
    this.listeners.forEach((listener) => listener(loc));
  }

  // Navega para um caminho (pushState)
  navigate(path: string, options?: NavigationOptions) {
    if (typeof window === 'undefined') return;

    if (options?.replace) {
      window.history.replaceState(options?.state || {}, '', path);
    } else {
      window.history.pushState(options?.state || {}, '', path);
    }
    this.notify();
  }

  // Substitui a rota (replaceState)
  replace(path: string, options?: NavigationOptions) {
    this.navigate(path, { ...options, replace: true });
  }

  // Voltar no histórico de forma segura
  navigateBack(fallbackPath?: string) {
    if (typeof window === 'undefined') return;
    
    // Se há histórico anterior no nosso app, volta
    if (window.history.length > 1) {
      window.history.back();
    } else if (fallbackPath) {
      this.replace(fallbackPath);
    }
  }

  // Utilitário para adicionar/atualizar query params na URL atual
  updateRouteQuery(params: Record<string, string | null>, options?: NavigationOptions) {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    Object.entries(params).forEach(([key, val]) => {
      if (val === null || val === undefined) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, val);
      }
    });

    const newPath = url.pathname + url.search + url.hash;
    this.navigate(newPath, options);
  }

  // Abrir modal na rota
  openRouteModal(modalName: string, submodalName?: string) {
    const params: Record<string, string | null> = { modal: modalName };
    if (submodalName) {
      params.submodal = submodalName;
    }
    this.updateRouteQuery(params);
  }

  // Fechar modal na rota
  closeRouteModal(keepParent = false) {
    if (keepParent) {
      // Remove apenas submodal
      this.updateRouteQuery({ submodal: null });
    } else {
      // Remove ambos
      this.updateRouteQuery({ modal: null, submodal: null });
    }
  }
}

export const navigationService = new NavigationService();
export const navigate = (path: string, options?: NavigationOptions) => navigationService.navigate(path, options);
export const replace = (path: string, options?: NavigationOptions) => navigationService.replace(path, options);
export const navigateBack = (fallbackPath?: string) => navigationService.navigateBack(fallbackPath);
export const openRouteModal = (modalName: string, submodalName?: string) => navigationService.openRouteModal(modalName, submodalName);
export const closeRouteModal = (keepParent = false) => navigationService.closeRouteModal(keepParent);
export const updateRouteQuery = (params: Record<string, string | null>, options?: NavigationOptions) => navigationService.updateRouteQuery(params, options);
export default navigationService;
