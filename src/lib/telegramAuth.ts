import crypto from 'crypto';

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

/**
 * Validates Telegram WebApp initData string using HMAC-SHA256 signature algorithm.
 */
export function validateTelegramWebAppData(initData: string, botToken: string): TelegramUserData | null {
  if (!initData || !botToken) return null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');

    // Sort parameters alphabetically
    const params: string[] = [];
    urlParams.forEach((val, key) => {
      params.push(`${key}=${val}`);
    });
    params.sort();

    const dataCheckString = params.join('\n');

    // HMAC secret key derived from botToken with "WebAppData"
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      console.warn('⚠️ Telegram initData hash mismatch');
      return null;
    }

    const userString = urlParams.get('user');
    if (!userString) return null;

    const user: TelegramUserData = JSON.parse(userString);
    return user;
  } catch (err) {
    console.error('❌ Error validating Telegram initData:', err);
    return null;
  }
}
