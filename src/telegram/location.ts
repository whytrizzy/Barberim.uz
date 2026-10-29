import { getWebApp, safely, supports } from './webapp';

export type LocationResult =
  { status: 'ok'; lat: number; lng: number } | { status: 'denied' } | { status: 'unavailable' };

type TelegramLocation = { latitude: number; longitude: number } | null;
type LocationManager = {
  isInited: boolean;
  isLocationAvailable: boolean;
  init(callback?: () => void): void;
  getLocation(callback: (location: TelegramLocation) => void): void;
};

/**
 * The device's location: Telegram's LocationManager (Bot API 8.0) inside Telegram, otherwise
 * the browser's geolocation. Resolves; never throws.
 */
export function requestLocation(): Promise<LocationResult> {
  const webApp = getWebApp() as
    (ReturnType<typeof getWebApp> & { LocationManager?: LocationManager }) | null;
  const manager = webApp && supports(webApp, '8.0') ? webApp.LocationManager : undefined;
  if (manager) return viaTelegram(manager);
  return viaBrowser();
}

function viaTelegram(manager: LocationManager): Promise<LocationResult> {
  return new Promise((resolve) => {
    const ask = () => {
      if (!manager.isLocationAvailable) {
        void viaBrowser().then(resolve);
        return;
      }
      safely(() =>
        manager.getLocation((location) =>
          resolve(
            location
              ? { status: 'ok', lat: location.latitude, lng: location.longitude }
              : { status: 'denied' },
          ),
        ),
      );
    };
    if (manager.isInited) ask();
    else safely(() => manager.init(ask));
  });
}

function viaBrowser(): Promise<LocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ status: 'unavailable' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ status: 'ok', lat: p.coords.latitude, lng: p.coords.longitude }),
      (error) =>
        resolve(
          error.code === error.PERMISSION_DENIED ? { status: 'denied' } : { status: 'unavailable' },
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
