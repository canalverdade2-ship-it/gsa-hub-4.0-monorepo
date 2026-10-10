export type AppArea = 'public' | 'marketplace' | 'client' | 'business' | 'admin' | 'provider' | 'advertiser' | 'supplier' | 'login' | 'unknown';

export interface RouteState {
  pathname: string;
  search: string;
  hash: string;
  area: AppArea;
  module: string;     // ex: 'loja', 'dashboard', 'financeiro'
  submodule?: string; // ex: 'produtos', 'assinaturas', 'faturas'
  itemId?: string;    // ex: uuid de um produto ou fatura
  query: Record<string, string>;
}

export interface NavigationOptions {
  replace?: boolean;
  state?: any;
}

