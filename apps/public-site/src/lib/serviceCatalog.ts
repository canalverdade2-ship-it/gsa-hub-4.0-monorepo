import { supabase } from './supabase';
import { callAdminRpc } from './adminRpc';
import { callClientRpc } from './clientRpc';
import { isLocalDevHost } from './utils';

export type CatalogAudience = 'PF' | 'PJ' | 'AMBOS';

export interface CatalogService {
  id: string;
  code?: string;
  name: string;
  title: string;
  subtitle?: string | null;
  description: string;
  audience: CatalogAudience;
  price?: number;
  hidePrice?: boolean;
  status: 'ativo' | 'inativo';
  publicVisible: boolean;
  quoteAvailable: boolean;
  order: number;
}

export interface CatalogPackageService {
  id: string;
  name: string;
  desc: string;
}

export interface CatalogPackage {
  id: string;
  code?: string;
  title: string;
  subtitle: string;
  description: string;
  audience: CatalogAudience;
  serviceIds: string[];
  services: CatalogPackageService[];
  status: 'ativo' | 'inativo';
  publicVisible: boolean;
  quoteAvailable: boolean;
  order: number;
}

export interface ServiceCatalogSnapshot {
  services: CatalogService[];
  packages: CatalogPackage[];
}

const emptyCatalog: ServiceCatalogSnapshot = { services: [], packages: [] };

function normalizeCatalog(value: unknown): ServiceCatalogSnapshot {
  const payload = (value || {}) as Partial<ServiceCatalogSnapshot>;
  return {
    services: Array.isArray(payload.services) ? payload.services : [],
    packages: Array.isArray(payload.packages) ? payload.packages : [],
  };
}

import { publicServices as defaultPublicServices, servicePackages as defaultServicePackages } from '../data/publicServiceCatalog';

export function getDefaultPublicServiceCatalog(): ServiceCatalogSnapshot {
  return {
    services: defaultPublicServices.map((s, idx) => ({
      id: `default-svc-${idx + 1}`,
      name: s.title,
      title: s.title,
      description: s.text,
      audience: 'AMBOS',
      status: 'ativo',
      publicVisible: true,
      quoteAvailable: true,
      order: idx + 1,
    })),
    packages: defaultServicePackages.map((pkg, idx) => ({
      id: pkg.id || `default-pkg-${idx + 1}`,
      code: pkg.code || `PCT-${idx + 1}`,
      title: pkg.title,
      subtitle: pkg.subtitle,
      description: pkg.description,
      audience: pkg.audience,
      serviceIds: [],
      services: pkg.services.map((svc, sIdx) => ({
        id: `svc-${sIdx + 1}`,
        name: svc.name,
        desc: svc.desc,
      })),
      status: 'ativo',
      publicVisible: true,
      quoteAvailable: true,
      order: idx + 1,
    })),
  };
}

export async function fetchPublicServiceCatalog(audience?: 'PF' | 'PJ') {
  try {
    const { data, error } = await supabase.rpc('gsa_public_service_catalog', {
      p_audience: audience?.toLowerCase() || null,
    });
    if (!error && data) {
      const normalized = normalizeCatalog(data);
      if (normalized.packages.length > 0) {
        return normalized;
      }
    }
  } catch {
    // RPC não respondeu ou ambiente offline, utiliza catálogo padrão
  }
  return getDefaultPublicServiceCatalog();
}

export async function fetchClientServiceCatalog() {
  return normalizeCatalog(await callClientRpc('gsa_client_service_catalog'));
}

export async function fetchAdminServiceCatalog() {
  return normalizeCatalog(await callAdminRpc('gsa_admin_service_catalog_snapshot'));
}

export async function saveAdminServicePackage(packageId: string | null, payload: Record<string, unknown>) {
  return callAdminRpc<CatalogPackage>('gsa_admin_save_service_package', {
    p_package_id: packageId,
    p_payload: payload,
  });
}

export async function deleteAdminServicePackage(packageId: string) {
  return callAdminRpc<{ success: boolean }>('gsa_admin_delete_service_package', {
    p_package_id: packageId,
  });
}

export async function importDefaultServiceCatalog(packages: unknown[]) {
  return callAdminRpc<{ success: boolean; importedPackages: number }>('gsa_admin_import_service_catalog', {
    p_packages: packages,
  });
}

export async function createClientServiceQuote(payload: {
  itemType: 'service' | 'package';
  itemId: string;
  description: string;
  priority: 'baixa' | 'media' | 'alta';
  attachments: Array<{ nome: string; url: string }>;
  promotionId?: string | null;
}) {
  return callClientRpc<{ id: string; codigo_orcamento: string }>('gsa_client_create_service_quote', {
    p_item_type: payload.itemType,
    p_item_id: payload.itemId,
    p_description: payload.description,
    p_priority: payload.priority,
    p_attachments: payload.attachments,
    p_promotion_id: payload.promotionId || null,
  });
}

export function isCatalogEmpty(catalog?: ServiceCatalogSnapshot | null) {
  return !catalog || (catalog.services.length === 0 && catalog.packages.length === 0);
}

export { emptyCatalog };
