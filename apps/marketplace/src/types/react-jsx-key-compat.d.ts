import 'react';

declare module 'react' {
  interface Attributes {
    key?: string | number | null;
  }

  namespace JSX {
    interface IntrinsicAttributes {
      key?: string | number | null;
    }
  }
}

export {};
