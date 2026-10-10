import { type ReactNode, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { isProviderBlocked } from '../../lib/providerStatus';
import { replace } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';
import { useAppLocation } from '../../routing/useAppLocation';

const RESTRICTED_PROVIDER_MODULES = new Set([
  'demandas',
  'agenda',
  'financeiro',
  'vouchers',
  'premios',
  'promocoes',
]);

export function ProviderRouteGuard({ children }: { children: ReactNode }) {
  const route = useAppLocation();
  const { prestador, loading } = useProviderNotifications();
  const blockedRoute = Boolean(
    !loading
      && prestador
      && isProviderBlocked(prestador.status)
      && route.module
      && RESTRICTED_PROVIDER_MODULES.has(route.module),
  );

  useEffect(() => {
    if (!blockedRoute) return;
    toast.error('Este módulo está bloqueado enquanto o cadastro não estiver ativo.');
    replace(routes.provider.dashboard());
  }, [blockedRoute]);

  if (blockedRoute) return null;
  return <>{children}</>;
}
