import { useEffect, useState, useCallback } from 'react';
import {
  whatsappHealthService,
  type WhatsAppHealthState,
  type WhatsAppHealthStatus,
  type QueuedWhatsAppNotification
} from '../lib/whatsappHealthService';

export interface UseWhatsAppHealthReturn extends WhatsAppHealthState {
  checkNow: () => Promise<WhatsAppHealthState>;
  setPaused: (paused: boolean) => void;
  togglePause: () => boolean;
  clearQueue: () => void;
  enqueueMessage: (
    item: Omit<QueuedWhatsAppNotification, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ) => string;
  getQueue: () => QueuedWhatsAppNotification[];
}

export function useWhatsAppHealth(): UseWhatsAppHealthReturn {
  const [healthState, setHealthState] = useState<WhatsAppHealthState>(() =>
    whatsappHealthService.getState()
  );

  useEffect(() => {
    // Inscreve no serviço de saúde para reatividade em tempo real
    const unsubscribe = whatsappHealthService.subscribe((state) => {
      setHealthState(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const checkNow = useCallback(async () => {
    return await whatsappHealthService.checkNow();
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    whatsappHealthService.setPaused(paused);
  }, []);

  const togglePause = useCallback(() => {
    return whatsappHealthService.togglePause();
  }, []);

  const clearQueue = useCallback(() => {
    whatsappHealthService.clearQueue();
  }, []);

  const enqueueMessage = useCallback(
    (item: Omit<QueuedWhatsAppNotification, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => {
      return whatsappHealthService.enqueueMessage(item);
    },
    []
  );

  const getQueue = useCallback(() => {
    return whatsappHealthService.getQueue();
  }, []);

  return {
    ...healthState,
    checkNow,
    setPaused,
    togglePause,
    clearQueue,
    enqueueMessage,
    getQueue
  };
}

export type { WhatsAppHealthState, WhatsAppHealthStatus, QueuedWhatsAppNotification };
