import 'server-only';
import QRCode from 'qrcode';

/**
 * The shop's link as a QR code, in SVG. Error correction M survives a scuffed or sun-faded print;
 * the quiet zone is left to the card around it.
 */
export function qrSvg(link: string, color: string): Promise<string> {
  return QRCode.toString(link, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: color, light: '#00000000' },
  });
}

export async function qrDataUri(link: string, color: string): Promise<string> {
  return `data:image/svg+xml;base64,${Buffer.from(await qrSvg(link, color)).toString('base64')}`;
}
