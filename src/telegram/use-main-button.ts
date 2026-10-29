'use client';

import { useEffect, useRef } from 'react';
import { useTelegram, type MainButtonConfig } from './provider';
import { readToken, safely } from './webapp';

/**
 * Shows Telegram's MainButton (the big bottom button) while the calling component is mounted.
 * Pass `null` to hide it. Outside Telegram the same config renders as an in-page button.
 */
export function useMainButton(config: MainButtonConfig | null) {
  const { mode, webApp, colorScheme, setBrowserMain } = useTelegram();
  const onClickRef = useRef<(() => void) | undefined>(undefined);
  const visible = config !== null;
  const text = config?.text ?? '';
  const disabled = config?.disabled ?? false;
  const loading = config?.loading ?? false;

  useEffect(() => {
    onClickRef.current = config?.onClick;
  });

  // Click handler: registered once per mount, always calls the latest onClick.
  useEffect(() => {
    if (!webApp || !visible) return;
    const handler = () => {
      if (!disabled && !loading) onClickRef.current?.();
    };
    webApp.MainButton.onClick(handler);
    return () => {
      webApp.MainButton.offClick(handler);
    };
  }, [webApp, visible, disabled, loading]);

  // Appearance.
  useEffect(() => {
    if (mode === 'browser') {
      setBrowserMain(
        visible ? { text, disabled, loading, onClick: () => onClickRef.current?.() } : null,
      );
      return () => setBrowserMain(null);
    }
    if (!webApp) return;
    const button = webApp.MainButton;
    if (!visible) {
      safely(() => button.hide());
      return;
    }
    safely(() =>
      button.setParams({
        text,
        color: readToken('--enamel') ?? undefined,
        text_color: readToken('--on-enamel') ?? '#ffffff',
        is_active: !disabled,
        is_visible: true,
      }),
    );
    safely(() => (loading ? button.showProgress(false) : button.hideProgress()));
    return () => safely(() => button.hide());
  }, [mode, webApp, colorScheme, visible, text, disabled, loading, setBrowserMain]);
}
