import { describe, expect, it } from 'vitest';
import { pdfSafeText } from './brand-pdf';

describe('pdfSafeText', () => {
  it('keeps Portuguese accents, which WinAnsi covers', () => {
    expect(pdfSafeText('Relatório de posição: São Paulo, ação, Pinheiros')).toBe('Relatório de posição: São Paulo, ação, Pinheiros');
  });

  it('normalizes decomposed accents before checking them', () => {
    expect(pdfSafeText('São')).toBe('São');
  });

  it('strips or replaces characters outside WinAnsi', () => {
    expect(pdfSafeText('4.8 ★ · ő ✓')).toBe('4.8 estrelas | o ?');
  });
});
