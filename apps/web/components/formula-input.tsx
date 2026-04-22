'use client';

import * as React from 'react';

type MathfieldElementLike = HTMLElement & {
  value: string;
  getValue?: (format?: string) => string;
  setValue?: (value: string, options?: Record<string, unknown>) => void;
};

type FormulaInputProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
};

export function FormulaInput({
  value,
  onChange,
  placeholder = '请输入公式',
  readOnly = false,
  minHeight = 64,
}: FormulaInputProps) {
  const [ready, setReady] = React.useState(false);
  const mathfieldRef = React.useRef<MathfieldElementLike | null>(null);

  React.useEffect(() => {
    let active = true;

    void import('mathlive').then(() => {
      if (active) {
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!ready || !mathfieldRef.current) {
      return;
    }

    const field = mathfieldRef.current;
    const currentValue = typeof field.getValue === 'function' ? field.getValue('latex') : field.value;
    if (currentValue !== value) {
      if (typeof field.setValue === 'function') {
        field.setValue(value);
      } else {
        field.value = value;
      }
    }
  }, [ready, value]);

  const handleInput = React.useCallback(() => {
    const field = mathfieldRef.current;
    if (!field) {
      return;
    }

    const nextValue = typeof field.getValue === 'function' ? field.getValue('latex') : field.value;
    onChange(nextValue);
  }, [onChange]);

  if (!ready) {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        rows={Math.max(3, Math.ceil(minHeight / 28))}
        style={{
          width: '100%',
          minHeight,
          padding: '12px 14px',
          borderRadius: 14,
          border: '1px solid #cbd5e1',
          background: readOnly ? '#f8fafc' : '#ffffff',
          resize: 'vertical',
        }}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <math-field
        ref={(node) => {
          mathfieldRef.current = node;
        }}
        placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        virtual-keyboard-mode="onfocus"
        onInput={handleInput}
        style={{
          minHeight,
          padding: '12px 14px',
          display: 'block',
          borderRadius: 14,
          border: '1px solid #cbd5e1',
          background: readOnly ? '#f8fafc' : '#ffffff',
        }}
      />
      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
        LaTeX：<code>{value || '\\square'}</code>
      </div>
    </div>
  );
}
