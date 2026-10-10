
import React, { Suspense, useEffect } from 'react';
import { useAppLocation } from '../../../routing/useAppLocation';
import { routes } from '../../../routing/routeCatalog';
import { navigate } from '../../../routing/navigationService';

const EcommerceHome = React.lazy(() => import('../store/EcommerceHome').then(m => ({ default: m.EcommerceHome })));
const ProductPage = React.lazy(() => import('../store/ProductPage').then(m => ({ default: m.ProductPage })));
const OrderSuccessPage = React.lazy(() => import('../store/OrderSuccessPage').then(m => ({ default: m.OrderSuccessPage })));
const CheckoutPage = React.lazy(() => import('../store/CheckoutPage').then(m => ({ default: m.CheckoutPage })));
const PurchasesPage = React.lazy(() => import('../store/PurchasesPage').then(m => ({ default: m.PurchasesPage })));
const WishlistPage = React.lazy(() => import('../store/WishlistPage').then(m => ({ default: m.WishlistPage })));
const CouponsPage = React.lazy(() => import('../store/CouponsPage').then(m => ({ default: m.CouponsPage })));
const PromotionsPage = React.lazy(() => import('../store/PromotionsPage').then(m => ({ default: m.PromotionsPage })));
const VaquinhaPublicPage = React.lazy(() => import('../store/VaquinhaPublicPage').then(m => ({ default: m.VaquinhaPublicPage })));
const StoreHub = React.lazy(() => import('../StoreHub').then(m => ({ default: m.StoreHub })));
const ClientGSAStore = React.lazy(() => import('../ClientGSAStore').then(m => ({ default: m.ClientGSAStore })));
const EcommerceHeader = React.lazy(() => import('../store/EcommerceHeader').then(m => ({ default: m.EcommerceHeader })));
const BlogHome = React.lazy(() => import('../store/BlogHome').then(m => ({ default: m.BlogHome })));
const BlogPostPage = React.lazy(() => import('../store/BlogPostPage').then(m => ({ default: m.BlogPostPage })));

const ClassifiedsHubPage = React.lazy(() => import('./ClassifiedsHubPage').then(m => ({ default: m.ClassifiedsHubPage })));

const TravelHubMenu = React.lazy(() => import('./travel/TravelHubMenu').then(m => ({ default: m.TravelHubMenu })));
const TravelOffersLandingPage = React.lazy(() => import('./travel/TravelOffersLandingPage').then(m => ({ default: m.TravelOffersLandingPage })));
const TravelCategoryPage = React.lazy(() => import('./travel/TravelCategoryPage').then(m => ({ default: m.TravelCategoryPage })));
const TravelPackageDetailPage = React.lazy(() => import('./travel/TravelPackageDetailPage').then(m => ({ default: m.TravelPackageDetailPage })));
const TravelQuoteRequestPage = React.lazy(() => import('./travel/TravelQuoteRequestPage').then(m => ({ default: m.TravelQuoteRequestPage })));
const TravelReservationPage = React.lazy(() => import('./travel/TravelReservationPage').then(m => ({ default: m.TravelReservationPage })));
const MyTripsPage = React.lazy(() => import('./travel/MyTripsPage').then(m => ({ default: m.MyTripsPage })));
const TravelProposalsPage = React.lazy(() => import('./travel/TravelProposalsPage').then(m => ({ default: m.TravelProposalsPage })));
const TravelCancellationsPage = React.lazy(() => import('./travel/TravelCancellationsPage').then(m => ({ default: m.TravelCancellationsPage })));
const TravelSupportPage = React.lazy(() => import('./travel/TravelSupportPage').then(m => ({ default: m.TravelSupportPage })));

const ClassifiedDetailPage = React.lazy(() => import('./classifieds/ClassifiedDetailPage').then(m => ({ default: m.ClassifiedDetailPage })));
const RealEstateMarketplacePage = React.lazy(() => import('./classifieds/RealEstateMarketplacePage').then(m => ({ default: m.RealEstateMarketplacePage })));
const VehiclesMarketplacePage = React.lazy(() => import('./classifieds/VehiclesMarketplacePage').then(m => ({ default: m.VehiclesMarketplacePage })));
const GeneralClassifiedsPage = React.lazy(() => import('./classifieds/GeneralClassifiedsPage').then(m => ({ default: m.GeneralClassifiedsPage })));
const MyClassifiedsPage = React.lazy(() => import('./classifieds/MyClassifiedsPage').then(m => ({ default: m.MyClassifiedsPage })));
const CreateListingWizard = React.lazy(() => import('./classifieds/CreateListingWizard').then(m => ({ default: m.CreateListingWizard })));
const MyNegotiationsPage = React.lazy(() => import('./classifieds/MyNegotiationsPage').then(m => ({ default: m.MyNegotiationsPage })));
const ClassifiedsClientDashboard = React.lazy(() => import('./classifieds/ClassifiedsClientDashboard').then(m => ({ default: m.ClassifiedsClientDashboard })));
const MyClassifiedSalesPage = React.lazy(() => import('./classifieds/MyClassifiedSalesPage').then(m => ({ default: m.MyClassifiedSalesPage })));
const MyClassifiedCommissionsPage = React.lazy(() => import('./classifieds/MyClassifiedCommissionsPage').then(m => ({ default: m.MyClassifiedCommissionsPage })));
const PublicVIPPresentationPage = React.lazy(() => import('../../public/PublicVIPPresentationPage').then(m => ({ default: m.PublicVIPPresentationPage })));

interface MarketplaceGSAStoreProps {
  clientId?: string;
  initialTab?: string;
  initialItemId?: string;
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
  onBackToSite?: () => void;
  onRequireAuth?: () => void;
}

function MarketplaceGSAStoreInner({
  clientId,
  initialTab = 'home',
  initialItemId,
  onBackToSite,
  onRequireAuth,
}: MarketplaceGSAStoreProps) {
  const route = useAppLocation();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const backToMarketplace = () => handleNavigate(routes.marketplace.menu());
  const backToTravelHub = () => handleNavigate(routes.marketplace.travelPackages.root());

  const currentSubmodule = route.submodule;
  const currentModule = route.module;


  if (currentModule === 'pacotes-viagem') {
    if (currentSubmodule === 'ofertas') {
      return <TravelOffersLandingPage onBack={backToTravelHub} isPublic={!clientId} />;
    }
    if (currentSubmodule === 'ofertas-nacionais') {
      return (
        <TravelCategoryPage
          category="nacional"
          onBack={() => handleNavigate(routes.marketplace.travelPackages.ofertas())}
        />
      );
    }
    if (currentSubmodule === 'ofertas-internacionais') {
      return (
        <TravelCategoryPage
          category="internacional"
          onBack={() => handleNavigate(routes.marketplace.travelPackages.ofertas())}
        />
      );
    }
    if (currentSubmodule === 'ofertas-excursoes') {
      return (
        <TravelCategoryPage
          category="excursao"
          onBack={() => handleNavigate(routes.marketplace.travelPackages.ofertas())}
        />
      );
    }
    if (currentSubmodule === 'pacote-detalhe' && route.itemId) {
      return (
        <TravelPackageDetailPage
          slug={route.itemId}
          clientId={clientId}
          onRequireAuth={onRequireAuth}
          onBack={() => handleNavigate(routes.marketplace.travelPackages.ofertas())}
        />
      );
    }
    if (currentSubmodule === 'orcamento') {
      return (
        <TravelQuoteRequestPage
          clientId={clientId}
          onRequireAuth={onRequireAuth}
          onBack={() => handleNavigate(routes.marketplace.travelPackages.ofertas())}
        />
      );
    }
    if (currentSubmodule === 'minhas-viagens') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      if (route.itemId) {
        return (
          <TravelReservationPage
            transacaoId={route.itemId}
            clientId={clientId}
            onBack={() => handleNavigate(routes.marketplace.travelPackages.minhasViagens())}
          />
        );
      }
      return <MyTripsPage clientId={clientId} onBack={backToTravelHub} />;
    }
    if (currentSubmodule === 'minhas-propostas') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <TravelProposalsPage clientId={clientId} onBack={backToTravelHub} />;
    }
    if (currentSubmodule === 'documentos') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <MyTripsPage clientId={clientId} onBack={backToTravelHub} />;
    }
    if (currentSubmodule === 'cancelamentos') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <TravelCancellationsPage clientId={clientId} onBack={backToTravelHub} />;
    }
    if (currentSubmodule === 'suporte') {
      return <TravelSupportPage clientId={clientId} onBack={backToTravelHub} />;
    }

    return (
      <TravelHubMenu
        clientId={clientId}
        onBackToMarketplace={backToMarketplace}
        onRequireAuth={() => onRequireAuth?.()}
      />
    );
  }

  if (currentModule === 'classificados') {
    if (!currentSubmodule || currentSubmodule === 'home') {
      if (clientId) {
        return <ClassifiedsClientDashboard clientId={clientId} onBack={backToMarketplace} />;
      }
      return <ClassifiedsHubPage onBack={backToMarketplace} isPublic />;
    }

    if (currentSubmodule === 'imoveis') {
      if (route.itemId) {
        return (
          <ClassifiedDetailPage
            slug={route.itemId}
            clientId={clientId}
            onBack={() => handleNavigate(routes.marketplace.classifieds.imoveis())}
          />
        );
      }
      return <RealEstateMarketplacePage onBack={() => handleNavigate(routes.marketplace.classifieds.root())} />;
    }
    if (currentSubmodule === 'veiculos') {
      if (route.itemId) {
        return (
          <ClassifiedDetailPage
            slug={route.itemId}
            clientId={clientId}
            onBack={() => handleNavigate(routes.marketplace.classifieds.veiculos())}
          />
        );
      }
      return <VehiclesMarketplacePage onBack={() => handleNavigate(routes.marketplace.classifieds.root())} />;
    }
    if (currentSubmodule === 'geral') {
      if (route.itemId) {
        return (
          <ClassifiedDetailPage
            slug={route.itemId}
            clientId={clientId}
            onBack={() => handleNavigate(routes.marketplace.classifieds.geral())}
          />
        );
      }
      return <GeneralClassifiedsPage onBack={() => handleNavigate(routes.marketplace.classifieds.root())} />;
    }
    if (currentSubmodule === 'meus-anuncios') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <MyClassifiedsPage clientId={clientId} />;
    }
    if (currentSubmodule === 'anunciar') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <CreateListingWizard clientId={clientId} onBack={() => handleNavigate(routes.marketplace.classifieds.root())} />;
    }
    if (currentSubmodule === 'negociacoes') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <MyNegotiationsPage clientId={clientId} />;
    }
    if (currentSubmodule === 'minhas-vendas') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <MyClassifiedSalesPage clientId={clientId} />;
    }
    if (currentSubmodule === 'comissoes') {
      if (!clientId) {
        return <MarketplaceLoginGate onRequireAuth={onRequireAuth} />;
      }
      return <MyClassifiedCommissionsPage clientId={clientId} />;
    }

    if (clientId) {
      return <ClassifiedsClientDashboard clientId={clientId} onBack={backToMarketplace} />;
    }
    return <ClassifiedsHubPage onBack={backToMarketplace} isPublic />;
  }

  // Rota de Menu Central da Loja & Serviços (GSA Store Hub, Trocas e Reembolsos)
  if (
    currentSubmodule === 'menu-loja' || 
    currentSubmodule === 'loja-menu' || 
    currentSubmodule === 'loja-trocas' || 
    currentSubmodule === 'loja-reembolsos'
  ) {
    return (
      <StoreHub
        clientId={clientId}
        onNavigate={(_module, tab, itemId) => {
          if (tab === 'produtos' || tab === 'loja-produtos') {
            handleNavigate(routes.marketplace.store.product(itemId || ''));
          } else if (tab === 'assinaturas' || tab === 'loja-assinaturas') {
            handleNavigate(routes.marketplace.store.subscription(itemId || ''));
          }
        }}
        initialTab={currentSubmodule?.startsWith('loja-') ? currentSubmodule.replace('loja-', '') : (initialTab || 'hub')}
        initialItemId={initialItemId || route.itemId}
        onRequireAuth={onRequireAuth}
        onBackToSite={() => handleNavigate(routes.marketplace.root())}
        onBackToMarketplace={backToMarketplace}
      />
    );
  }

  if (currentSubmodule?.startsWith('loja')) {
    // Se for rota de um produto específico, renderiza a ProductPage
    const targetProductId = route.itemId || initialItemId;
    if (['loja-produtos', 'loja-produto'].includes(currentSubmodule) && targetProductId) {
      return (
        <ProductPage 
          productId={targetProductId} 
          clientId={clientId} 
          onRequireAuth={onRequireAuth} 
        />
      );
    }
    
    // Se for rota de checkout da loja (Página Completa e Dedicada)
    if (currentSubmodule === 'loja-checkout') {
      return (
        <CheckoutPage 
          clientId={clientId} 
          onRequireAuth={onRequireAuth} 
          onBack={() => handleNavigate(routes.marketplace.store.products())} 
        />
      );
    }

    // Se for rota de pedido confirmado
    if (currentSubmodule === 'loja-pedido-confirmado') {
      return <OrderSuccessPage />;
    }

    // Se for rota de compras da loja (Página Completa e Dedicada de Minhas Compras)
    if (currentSubmodule === 'loja-compras') {
      return (
        <PurchasesPage 
          clientId={clientId}
          onRequireAuth={onRequireAuth}
          initialOrderId={route.itemId || (route.query?.orderId as string)}
        />
      );
    }

    // Se for rota de cupons da loja (Página Completa e Dedicada de Cupons)
    if (currentSubmodule === 'loja-cupons' || currentSubmodule === 'loja-cupom') {
      return (
        <CouponsPage 
          clientId={clientId}
          onRequireAuth={onRequireAuth}
        />
      );
    }

    // Se for rota de promoções da loja (Página Completa e Dedicada de Promoções VIP)
    if (currentSubmodule === 'loja-promocoes' || currentSubmodule === 'loja-promocao') {
      return (
        <PromotionsPage 
          clientId={clientId}
          onRequireAuth={onRequireAuth}
        />
      );
    }

    // Se for rota de wishlist
    if (currentSubmodule === 'loja-wishlist') {
      return <WishlistPage clientId={clientId} onRequireAuth={onRequireAuth} />;
    }

    // Se for rota de blog
    if (currentSubmodule === 'loja-blog') {
      if (route.itemId) {
        return <BlogPostPage postId={route.itemId} clientId={clientId} />;
      }
      return <BlogHome clientId={clientId} />;
    }

    // Se for rota de apresentação pública do Programa VIP
    if (currentSubmodule === 'loja-programa-vip' || currentSubmodule === 'loja-vip') {
      return (
        <PublicVIPPresentationPage 
          clientId={clientId}
          onBack={() => handleNavigate(routes.marketplace.store.root())}
        />
      );
    }

    // Se for rota de Vaquinha de Presente Coletivo
    if (currentSubmodule === 'loja-vaquinha' || currentSubmodule === 'loja-vaquinhas') {
      const targetVaquinhaCode = route.itemId || (route.query?.id as string) || (route.query?.vaquinha_id as string) || '';
      return (
        <div className="min-h-screen bg-[#f8f9fa]">
          <EcommerceHeader 
            clientId={clientId} 
            onOpenCart={() => handleNavigate(routes.marketplace.store.products() + '?modal=carrinho')}
            onRequireAuth={onRequireAuth}
          />
          <VaquinhaPublicPage 
            vaquinhaIdOrCode={targetVaquinhaCode}
            clientId={clientId}
            onRequireAuth={onRequireAuth}
          />
        </div>
      );
    }

    // Se for rota de catálogo da loja de produtos ou assinaturas
    if (currentSubmodule === 'loja-produtos' || currentSubmodule === 'loja-assinaturas') {
      return (
        <div className="min-h-screen bg-[#f8f9fa]">
          <EcommerceHeader 
            clientId={clientId} 
            onOpenCart={() => handleNavigate(routes.marketplace.store.products() + '?modal=carrinho')}
            onRequireAuth={onRequireAuth}
          />
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <ClientGSAStore 
              clientId={clientId}
              onRequireAuth={onRequireAuth}
              onBack={() => handleNavigate(routes.marketplace.root())}
            />
          </main>
        </div>
      );
    }
  }

  return (
    <EcommerceHome
      clientId={clientId}
      onRequireAuth={onRequireAuth}
      onOpenCart={() => handleNavigate(routes.marketplace.store.products() + '?modal=carrinho')}
    />
  );
}

export function MarketplaceGSAStore(props: MarketplaceGSAStoreProps) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div></div>}>
      <MarketplaceGSAStoreInner {...props} />
    </Suspense>
  );
}

export default MarketplaceGSAStore;

function MarketplaceLoginGate({ onRequireAuth }: { onRequireAuth?: () => void }) {
 useEffect(() => { onRequireAuth?.(); }, [onRequireAuth]);
 return <main className="mx-auto max-w-lg px-6 py-16 text-center"><h1 className="text-xl font-semibold">Entre para continuar</h1><p className="mt-3 text-neutral-600">Acesse sua conta para consultar esta área.</p><button type="button" onClick={onRequireAuth} className="mt-6 rounded-xl bg-neutral-900 px-6 py-3 text-white">Entrar na minha conta</button></main>;
}

