// QR code as an SVG string (server side). The page turns the same SVG into a PNG in the browser.
import QRCode from 'qrcode';

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#030508', light: '#ffffff' },
  });
}
