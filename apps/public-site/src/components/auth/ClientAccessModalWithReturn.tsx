import {
  ClientAccessModal,
  type ClientAccessMode,
} from './ClientAccessModal';
import {
  buildFreeToolsProLoginReturnUrl,
  consumeFreeToolsProLoginReturn,
} from '../../lib/freeToolsProLoginReturn';
import type { ClientPersonType } from '../../lib/sessionService';

export type { ClientAccessMode };

interface ClientAccessModalWithReturnProps {
  isOpen: boolean;
  initialMode?: ClientAccessMode;
  initialPersonType?: ClientPersonType;
  onClose: () => void;
  onLoginClient: (id: string, isRecovery?: boolean, personType?: ClientPersonType) => void;
}

export function ClientAccessModalWithReturn({
  isOpen,
  initialMode,
  initialPersonType,
  onClose,
  onLoginClient,
}: ClientAccessModalWithReturnProps) {
  const handleLoginClient = (id: string, isRecovery = false, personType?: ClientPersonType) => {
    const pendingTool = isRecovery ? null : consumeFreeToolsProLoginReturn();

    onLoginClient(id, isRecovery, personType);

    if (pendingTool) {
      window.location.replace(buildFreeToolsProLoginReturnUrl(pendingTool));
    }
  };

  return (
    <ClientAccessModal
      isOpen={isOpen}
      initialMode={initialMode}
      initialPersonType={initialPersonType}
      onClose={onClose}
      onLoginClient={handleLoginClient}
    />
  );
}
