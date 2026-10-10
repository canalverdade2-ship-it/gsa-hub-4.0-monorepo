export {};

declare global {
  namespace React {
    interface HTMLAttributes<T> {
      inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
    }
  }
}
