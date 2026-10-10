import type {
  FormEvent as ReactFormEvent,
  ReactNode as ImportedReactNode,
} from 'react';

declare global {
  namespace React {
    type FormEvent<T = Element> = ReactFormEvent<T>;
    type ReactNode = ImportedReactNode;
  }
}

export {};
