import { useCallback, useEffect, useRef } from 'react';

export function useAutoFitTabs(maxSize = 16, minSize = 10) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setButtonRef = useCallback((index: number) => (element: HTMLButtonElement | null) => {
    buttonRefs.current[index] = element;
  }, []);

  useEffect(() => {
    const fit = () => {
      buttonRefs.current.forEach((button) => {
        if (!button) return;

        let fontSize = maxSize;
        button.style.fontSize = `${fontSize}px`;
        button.style.lineHeight = '1';

        while (button.scrollWidth > button.clientWidth && fontSize > minSize) {
          fontSize -= 0.5;
          button.style.fontSize = `${fontSize}px`;
        }
      });
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(fit);
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    window.addEventListener('resize', fit);
    window.requestAnimationFrame(fit);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [maxSize, minSize]);

  return { containerRef, setButtonRef };
}
