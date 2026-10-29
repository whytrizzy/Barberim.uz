'use client';

import { useEffect, useRef } from 'react';
import { useTelegram } from './provider';
import { safely, supports } from './webapp';

/**
 * Shows Telegram's BackButton (top-left) while mounted and calls `onBack` when it's tapped.
 * Pass `null` to hide it. Outside Telegram an in-page back button takes its place.
 */
export function useBackButton(onBack: (() => void) | null) {
  const { mode, webApp, setBrowserBack } = useTelegram();
  const onBackRef = useRef(onBack);
  const visible = onBack !== null;

  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (mode === 'browser') {
      setBrowserBack(visible ? () => onBackRef.current?.() : null);
      return () => setBrowserBack(null);
    }
    if (!webApp || !supports(webApp, '6.1')) return;
    const button = webApp.BackButton;
    if (!visible) {
      safely(() => button.hide());
      return;
    }
    const handler = () => onBackRef.current?.();
    safely(() => button.onClick(handler));
    safely(() => button.show());
    return () => {
      safely(() => button.offClick(handler));
      safely(() => button.hide());
    };
  }, [mode, webApp, visible, setBrowserBack]);
}
