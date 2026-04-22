import type * as React from 'react';

type MathfieldElementLike = HTMLElement & {
  value: string;
  getValue?: (format?: string) => string;
  setValue?: (value: string, options?: Record<string, unknown>) => void;
  placeholder?: string;
  readOnly?: boolean;
  smartMode?: boolean;
  virtualKeyboardMode?: 'manual' | 'onfocus' | 'off';
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElementLike>, MathfieldElementLike> & {
        value?: string;
        placeholder?: string;
        readOnly?: boolean;
        'virtual-keyboard-mode'?: 'manual' | 'onfocus' | 'off';
      };
    }
  }
}

export {};
