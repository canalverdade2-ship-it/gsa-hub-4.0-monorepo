import { sessionService } from '../../lib/sessionService';
import { SiteCampaignAdminModule } from './SiteCampaignAdminModule';
import { SiteCampaignDeletionPanel } from './SiteCampaignDeletionPanel';
import { SiteCampaignPermissionMatrix } from './SiteCampaignPermissionMatrix';

export function SiteCampaignAdminPage() {
  const isAdmin = sessionService.getCurrentSession()?.atorTipo === 'admin';

  return (
    <div className="space-y-6">
      <SiteCampaignAdminModule />
      {isAdmin && <SiteCampaignPermissionMatrix />}
      <SiteCampaignDeletionPanel />
    </div>
  );
}
