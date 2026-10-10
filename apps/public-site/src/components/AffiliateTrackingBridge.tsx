import { useEffect } from 'react';
import {
  bindPendingAffiliateClicks,
  processCapturedAffiliateReferral,
} from '../features/affiliates/attribution';

interface AffiliateTrackingBridgeProps {
  clientId?: string;
}

export function AffiliateTrackingBridge({ clientId }: AffiliateTrackingBridgeProps) {
  useEffect(() => {
    let active = true;

    const synchronize = async () => {
      await processCapturedAffiliateReferral();
      if (active && clientId) await bindPendingAffiliateClicks();
    };

    void synchronize();
    return () => { active = false; };
  }, [clientId]);

  return null;
}

