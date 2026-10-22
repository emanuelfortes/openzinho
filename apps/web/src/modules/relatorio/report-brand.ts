// White-label props for the report PDF, without duplicating the logo inside the style.
import type { BrandSettings } from '@/lib/brand';
import type { ReportBrand } from './report-pdf';

export function reportBrand(settings: BrandSettings): ReportBrand {
  return {
    name: settings.name,
    logo: settings.logo,
    color: settings.color,
    footer: settings.footer,
    style: {
      headerStyle: settings.headerStyle,
      footerTextColor: settings.footerTextColor,
      footerLinkColor: settings.footerLinkColor,
      footerBackground: settings.footerBackground,
    },
  };
}
