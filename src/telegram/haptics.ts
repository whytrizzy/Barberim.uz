import { getWebApp, safely, supports } from './webapp';

// Haptic feedback is a nicety: on old clients or outside Telegram these calls do nothing, and they
// never throw (v1 crashed on a client that exposed HapticFeedback but threw when it was called).

function feedback() {
  const webApp = getWebApp();
  return webApp && supports(webApp, '6.1') ? webApp.HapticFeedback : null;
}

export const haptic = {
  /** A tap that changes a choice: master, day, time. */
  selection() {
    const h = feedback();
    if (h) safely(() => h.selectionChanged());
  },
  impact(style: 'light' | 'medium' | 'heavy' = 'light') {
    const h = feedback();
    if (h) safely(() => h.impactOccurred(style));
  },
  notify(type: 'success' | 'warning' | 'error') {
    const h = feedback();
    if (h) safely(() => h.notificationOccurred(type));
  },
};
