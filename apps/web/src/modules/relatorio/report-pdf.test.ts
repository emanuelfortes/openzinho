import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import type { GridLocalItem, GridPoint } from '@/lib/db';
import { analyzeKeyword, summarizeCampaign, type CampaignReport } from './analysis';
import { buildReportPdf } from './report-pdf';

const labels = { monthLabel: 'setembro de 2026', previousMonthLabel: 'agosto de 2026' };
const rival = (rank: number): GridLocalItem => ({ rank_group: rank, title: 'Clínica Concorrente São João', domain: 'rival.example', is_target: false });
const grid = (size: number, rank: (row: number, col: number) => number | null): GridPoint[] =>
  Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const col = index % size;
    return { row, col, rank: rank(row, col), items: [rival(row > 3 ? 1 : 4)] };
  });

describe('buildReportPdf', () => {
  it('writes a cover and one section per keyword', async () => {
    const keywords = [
      analyzeKeyword({
        keyword: 'dentista em fortaleza', gridSize: 7, spacingKm: 0.5, inactive: new Set(['6:6', '6:5']), ...labels,
        current: { ts: Date.parse('2026-09-25T12:00:00Z'), results: grid(7, (row, col) => (row + col < 6 ? 1 + row : row > 4 ? null : 8 + col)) },
        previous: { ts: Date.parse('2026-08-25T12:00:00Z'), results: grid(7, (row) => (row < 3 ? 2 : 12)) },
      }),
      analyzeKeyword({ keyword: 'implante dentário', gridSize: 7, spacingKm: 0.5, inactive: new Set(), current: null, previous: null, ...labels }),
    ];
    const report: CampaignReport = {
      campaignName: 'Odonto Aldeota', target: 'Clínica Sorriso', gridSize: 7, spacingKm: 0.5, month: '2026-09', previousMonth: '2026-08',
      ...labels, generatedAt: Date.now(), keywords, summary: summarizeCampaign(keywords),
    };
    const pdf = await buildReportPdf(report, { name: 'Agência Exemplo', logo: null, color: '#1f6bff', footer: 'contato@agencia.example', style: {} });
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    if (process.env.RELATORIO_PDF_OUT) fs.writeFileSync(process.env.RELATORIO_PDF_OUT, Buffer.from(pdf.output('arraybuffer')));
  });
});
