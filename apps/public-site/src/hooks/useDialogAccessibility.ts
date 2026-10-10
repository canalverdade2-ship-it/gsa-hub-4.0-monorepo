import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  '[data-dialog-autofocus]',
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let openDialogCount = 0;
let previousBodyOverflow = '';
let previousRootAriaHidden: string | null = null;
let previousRootInert = false;

function lockApplicationBackground() {
  const appRoot = document.getElementById('root');

  if (openDialogCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (appRoot) {
      previousRootAriaHidden = appRoot.getAttribute('aria-hidden');
      previousRootInert = appRoot.inert;
      appRoot.setAttribute('aria-hidden', 'true');
      appRoot.inert = true;
    }
  }

  openDialogCount += 1;

  return () => {
    openDialogCount = Math.max(0, openDialogCount - 1);
    if (openDialogCount > 0) return;

    document.body.style.overflow = previousBodyOverflow;

    if (appRoot) {
      appRoot.inert = previousRootInert;
      if (previousRootAriaHidden === null) appRoot.removeAttribute('aria-hidden');
      else appRoot.setAttribute('aria-hidden', previousRootAriaHidden);
    }
  };
}

function isVisibleFocusableElement(element: HTMLElement) {
  if (
    element.hasAttribute('disabled')
    || element.hidden
    || element.closest('[hidden], [inert], [aria-hidden="true"]')
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false;
  }

  return element.getClientRects().length > 0;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isVisibleFocusableElement);
}

interface UseDialogAccessibilityOptions {
  isOpen: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export function useDialogAccessibility({ isOpen, containerRef, onClose }: UseDialogAccessibilityOptions) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const unlockBackground = lockApplicationBackground();
    const animationFrame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const preferredElement = container.querySelector<HTMLElement>('[data-dialog-autofocus]');
      const firstFocusable = preferredElement && isVisibleFocusableElement(preferredElement)
        ? preferredElement
        : getFocusableElements(container)[0];
      (firstFocusable || container).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || !container.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !container.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      unlockBackground();

      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
      }
    };
  }, [containerRef, isOpen]);
}