import React from 'react';
import { TravelAdminModule } from '../../TravelAdminModule';

interface ViagensSubDomainProps {
  initialItemId?: string;
}

export function ViagensSubDomain({
  initialItemId
}: ViagensSubDomainProps) {
  return (
    <div className="w-full space-y-4">
      <TravelAdminModule />
    </div>
  );
}
