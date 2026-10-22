// Monthly report PDF (jsPDF, browser or Node): white-label header and footer, one section per keyword,
// grids drawn as vector cells in the rank scale. Every string goes through pdfSafeText.
import type { jsPDF } from 'jspdf';
import { brandPalette, fitBox, footerPalette, imageSize, resolveBrandStyle, type BrandStyle } from '@/lib/brand';
import { drawFooter, drawHeaderBand, pdfSafeText } from '@/lib/brand-pdf';
import { RANK_TIER_ORDER, RANK_TIERS, rankStyle } from '@/lib/rank-scale';
import { fmt, signed, type CampaignReport, type KeywordReport, type ReportPoint } from './analysis';

export interface ReportBrand {
  name: string;
  logo: string | null;
  color: string;
  footer: string;
  style: Partial<BrandStyle>;
}

type Rgb = readonly [number, number, number];

const palette = {
  ink: [15, 23, 42] as Rgb,
  muted: [100, 116, 139] as Rgb,
  line: [226, 232, 240] as Rgb,
  panel: [248, 250, 252] as Rgb,
  better: [18, 70, 184] as Rgb,
  worse: [180, 83, 9] as Rgb,
};

async function logoDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(png|jpe?g|webp)$/i.test(blob.type)) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function filenamePart(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'relatorio';
}

const MARGIN = 16;
const FOOTER_TOP_OFFSET = 12;

class Writer {
  y = 0;
  readonly width: number;
  readonly height: number;

  constructor(readonly pdf: jsPDF, private readonly onNewPage: () => number) {
    this.width = pdf.internal.pageSize.getWidth();
    this.height = pdf.internal.pageSize.getHeight();
  }

  get bottom() {
    return this.height - FOOTER_TOP_OFFSET - 6;
  }

  color(color: Rgb) {
    this.pdf.setTextColor(color[0], color[1], color[2]);
  }

  fill(color: Rgb) {
    this.pdf.setFillColor(color[0], color[1], color[2]);
  }

  font(size: number, weight: 'normal' | 'bold' = 'normal', color: Rgb = palette.ink) {
    this.pdf.setFont('helvetica', weight);
    this.pdf.setFontSize(size);
    this.color(color);
  }

  text(value: string, x: number, y: number, options?: Parameters<jsPDF['text']>[3]) {
    this.pdf.text(pdfSafeText(value), x, y, options);
  }

  ensure(space: number) {
    if (this.y + space > this.bottom) {
      this.pdf.addPage();
      this.y = this.onNewPage();
    }
  }

  /** Wrapped paragraph; breaks pages between lines. */
  paragraph(value: string, size: number, color: Rgb, indent = 0, lineGap = 1.35) {
    this.font(size, 'normal', color);
    const lines = this.pdf.splitTextToSize(pdfSafeText(value), this.width - MARGIN * 2 - indent) as string[];
    const lineHeight = size * 0.3528 * lineGap;
    for (const line of lines) {
      this.ensure(lineHeight);
      this.pdf.text(line, MARGIN + indent, this.y);
      this.y += lineHeight;
    }
  }
}

function drawGrid(w: Writer, points: ReportPoint[] | null, gridSize: number, x: number, y: number, size: number) {
  const { pdf } = w;
  const cell = size / gridSize;
  w.fill(palette.panel);
  pdf.rect(x, y, size, size, 'F');
  if (!points) {
    w.font(8, 'normal', palette.muted);
    w.text('Sem varredura concluída', x + size / 2, y + size / 2, { align: 'center' });
    return;
  }
  const byKey = new Map(points.map((point) => [`${point.row}:${point.col}`, point]));
  const middle = Math.floor(gridSize / 2);
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const point = byKey.get(`${row}:${col}`);
      const cx = x + col * cell;
      const cy = y + row * cell;
      if (!point) continue; // Inactive: left blank, as on the live grid.
      const style = rankStyle(point.rank);
      w.fill(style.pdfFill);
      pdf.rect(cx + 0.4, cy + 0.4, cell - 0.8, cell - 0.8, 'F');
      if (cell >= 5) {
        // Font size is in points, the cell in millimetres: about half the cell height.
        const fontSize = Math.min(9, cell * 1.1);
        w.font(fontSize, 'bold', style.pdfText);
        w.text(point.rank == null ? '-' : String(point.rank), cx + cell / 2, cy + cell / 2 + fontSize * 0.3528 * 0.35, { align: 'center' });
      }
      if (row === middle && col === middle) {
        pdf.setDrawColor(3, 5, 8);
        pdf.setLineDashPattern([1, 0.7], 0);
        pdf.rect(cx + 1, cy + 1, cell - 2, cell - 2, 'S');
        pdf.setLineDashPattern([], 0);
      }
    }
  }
}

function deltaColor(value: number | null | undefined, lowerIsBetter: boolean): Rgb {
  if (value == null || value === 0) return palette.muted;
  return (lowerIsBetter ? value < 0 : value > 0) ? palette.better : palette.worse;
}

function bulletList(w: Writer, title: string, hint: string, items: string[], prefix?: string) {
  if (items.length === 0) return;
  w.ensure(14);
  w.font(9.5, 'bold');
  w.text(title, MARGIN, w.y);
  w.y += 4;
  w.font(6.8, 'normal', palette.muted);
  w.text(hint, MARGIN, w.y);
  w.y += 4.2;
  for (const item of items) {
    w.ensure(5);
    w.fill(palette.line);
    w.pdf.rect(MARGIN, w.y - 2.6, 0.6, 3.4, 'F');
    w.paragraph(prefix ? `${prefix}: ${item}` : item, 7.6, palette.ink, 3);
    w.y += 1.2;
  }
  w.y += 2;
}

function keywordSection(w: Writer, keyword: KeywordReport, report: CampaignReport) {
  const { pdf } = w;
  w.font(15, 'bold');
  w.text(keyword.keyword, MARGIN, w.y);
  w.y += 5;
  w.font(7.5, 'normal', palette.muted);
  w.text(`${keyword.gridSize} x ${keyword.gridSize} pontos${keyword.inactive.length ? ` | ${keyword.inactive.length} desligados, fora das contas` : ''} | norte para cima, quadrado tracejado = centro`, MARGIN, w.y);
  w.y += 6;

  const gap = 8;
  const size = Math.min(66, (w.width - MARGIN * 2 - gap) / 2);
  const day = (ts: number) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(ts));
  ([['Mês anterior', report.previousMonthLabel, keyword.previous], ['Mês do relatório', report.monthLabel, keyword.current]] as const).forEach(([kind, name, run], index) => {
    const x = MARGIN + index * (size + gap);
    w.font(6.8, 'bold', palette.muted);
    w.text(`${kind.toUpperCase()} | ${name.toUpperCase()}`, x, w.y);
    w.font(6.8, 'normal', palette.muted);
    w.text(run ? `varredura de ${day(run.ts)}` : 'sem varredura concluída', x, w.y + 3.6);
    drawGrid(w, run?.points ?? null, keyword.gridSize, x, w.y + 6, size);
  });
  w.y += 6 + size + 7;

  // Metrics table.
  const cols = [MARGIN, MARGIN + 52, MARGIN + 92, MARGIN + 132, w.width - MARGIN];
  w.fill(palette.ink);
  pdf.roundedRect(MARGIN, w.y - 4.6, w.width - MARGIN * 2, 6.6, 1.2, 1.2, 'F');
  w.font(6.5, 'bold', [255, 255, 255]);
  w.text('MÉTRICA MEDIDA', cols[0] + 3, w.y);
  w.text(report.previousMonthLabel.toUpperCase(), cols[2] - 2, w.y, { align: 'right' });
  w.text(report.monthLabel.toUpperCase(), cols[3] - 2, w.y, { align: 'right' });
  w.text('VARIAÇÃO', cols[4] - 3, w.y, { align: 'right' });
  w.y += 6.4;
  const { current, previous, delta } = keyword;
  const rows: Array<[string, string, string, number | null | undefined, string, boolean]> = [
    ['Posição média (21 = fora do top 20)', previous?.avgPosition != null ? fmt(previous.avgPosition) : '-', current?.avgPosition != null ? fmt(current.avgPosition) : '-', delta?.avgPosition, '', true],
    ['Share of Voice', previous ? `${fmt(previous.shareOfVoice)}%` : '-', current ? `${fmt(current.shareOfVoice)}%` : '-', delta?.shareOfVoice, ' p.p.', false],
    ['Top 3', previous ? `${fmt(previous.top3Pct)}% (${previous.top3Points}/${previous.activePoints})` : '-', current ? `${fmt(current.top3Pct)}% (${current.top3Points}/${current.activePoints})` : '-', delta?.top3Pct, ' p.p.', false],
    ['Top 10', previous ? `${fmt(previous.top10Pct)}% (${previous.top10Points}/${previous.activePoints})` : '-', current ? `${fmt(current.top10Pct)}% (${current.top10Points}/${current.activePoints})` : '-', delta?.top10Pct, ' p.p.', false],
  ];
  rows.forEach(([label, before, now, change, unit, lowerIsBetter], index) => {
    if (index % 2 === 0) {
      w.fill(palette.panel);
      pdf.rect(MARGIN, w.y - 4.4, w.width - MARGIN * 2, 6.4, 'F');
    }
    w.font(7.4, 'normal');
    w.text(label, cols[0] + 3, w.y);
    w.font(7.4, 'normal', palette.muted);
    w.text(before, cols[2] - 2, w.y, { align: 'right' });
    w.font(7.4, 'bold');
    w.text(now, cols[3] - 2, w.y, { align: 'right' });
    w.font(7.4, 'bold', deltaColor(change, lowerIsBetter));
    w.text(change == null ? '-' : `${signed(change)}${unit}`, cols[4] - 3, w.y, { align: 'right' });
    w.y += 6.4;
  });
  w.y += 4;

  if (keyword.sectors.length) {
    w.ensure(16);
    w.font(6.8, 'bold', palette.muted);
    w.text('POSIÇÃO MÉDIA POR SETOR (MEDIDA)', MARGIN, w.y);
    w.y += 2.5;
    const boxGap = 1.5;
    const boxWidth = (w.width - MARGIN * 2 - boxGap * (keyword.sectors.length - 1)) / keyword.sectors.length;
    keyword.sectors.forEach((sector, index) => {
      const x = MARGIN + index * (boxWidth + boxGap);
      w.fill(palette.panel);
      pdf.roundedRect(x, w.y, boxWidth, 11, 1, 1, 'F');
      w.font(6, 'bold', palette.muted);
      w.text(sector.sector, x + boxWidth / 2, w.y + 3.4, { align: 'center' });
      w.font(9, 'bold');
      w.text(fmt(sector.avgPosition), x + boxWidth / 2, w.y + 7.6, { align: 'center' });
      if (sector.previousAvgPosition !== null) {
        const change = Math.round((sector.avgPosition - sector.previousAvgPosition) * 10) / 10;
        w.font(5.6, 'normal', deltaColor(change, true));
        w.text(signed(change), x + boxWidth / 2, w.y + 10.2, { align: 'center' });
      }
    });
    w.y += 16;
  }

  bulletList(w, 'Fatos medidos', 'Calculados nas varreduras acima, com os pontos ativos como base.', keyword.facts);
  bulletList(w, 'Dados ausentes', 'O que não sabemos porque falta varredura. Nada foi estimado no lugar.', keyword.missing);
  bulletList(w, 'Hipóteses (não verificadas)', 'Explicações possíveis geradas por regras; precisam ser confirmadas antes de virar conclusão.', keyword.hypotheses, 'Hipótese');
  bulletList(w, 'Recomendações', 'Próximos passos propostos; não são ações já feitas.', keyword.recommendations, 'Recomendação');
}

export async function buildReportPdf(report: CampaignReport, brand: ReportBrand): Promise<jsPDF> {
  const { jsPDF: JsPdf } = await import('jspdf');
  const pdf = new JsPdf({ unit: 'mm', format: 'a4', compress: true });
  const logo = brand.logo ? await logoDataUrl(brand.logo) : null;
  const logoSize = logo ? await imageSize(logo) : null;
  const colors = brandPalette(brand.color);
  const style = resolveBrandStyle(brand.style);
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();

  const continuationHeader = () => {
    drawHeaderBand(pdf, width, 16, style.headerStyle, colors.fill);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.text);
    pdf.text(pdfSafeText(brand.name), MARGIN, 9.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...colors.subtle);
    pdf.text(pdfSafeText(`${report.campaignName} | ${report.monthLabel}`), width - MARGIN, 9.5, { align: 'right' });
    return 28;
  };
  const w = new Writer(pdf, continuationHeader);

  // Cover: brand header, summary and how to read the report.
  drawHeaderBand(pdf, width, 38, style.headerStyle, colors.fill);
  let logoAdded = false;
  if (logo && logoSize) {
    const box = fitBox(logoSize.width, logoSize.height, 28, 18);
    try {
      pdf.addImage(logo, MARGIN, 10 + (18 - box.height) / 2, box.width, box.height);
      logoAdded = true;
    } catch {
      // The text mark below is the fallback.
    }
  }
  if (!logoAdded) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(...colors.text);
    pdf.text(pdfSafeText(brand.name), MARGIN, 21);
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...colors.subtle);
  pdf.text(pdfSafeText('INTELIGÊNCIA DE BUSCA LOCAL'), width - MARGIN, 15, { align: 'right' });
  pdf.setFontSize(16);
  pdf.setTextColor(...colors.text);
  pdf.text(pdfSafeText('Relatório mensal Geo-Grid'), width - MARGIN, 24, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...colors.subtle);
  pdf.text(pdfSafeText(`${report.monthLabel} comparado a ${report.previousMonthLabel}`), width - MARGIN, 30, { align: 'right' });

  w.y = 53;
  w.font(19, 'bold');
  w.text(report.campaignName, MARGIN, w.y);
  w.y += 7;
  w.font(9, 'normal', palette.muted);
  w.text(`Alvo: ${report.target}  /  ${report.gridSize} x ${report.gridSize} pontos  /  ${report.keywords.length} palavras-chave`, MARGIN, w.y);
  w.y += 8;

  const { summary } = report;
  const cards: Array<[string, string, string, Rgb]> = [
    ['POSIÇÃO MÉDIA', summary.avgPosition != null ? fmt(summary.avgPosition) : '-', summary.avgPositionDelta != null ? `${signed(summary.avgPositionDelta)} vs. mês anterior` : 'sem comparação', deltaColor(summary.avgPositionDelta, true)],
    ['SHARE OF VOICE', summary.shareOfVoice != null ? `${fmt(summary.shareOfVoice)}%` : '-', summary.shareOfVoiceDelta != null ? `${signed(summary.shareOfVoiceDelta)} p.p. vs. mês anterior` : 'sem comparação', deltaColor(summary.shareOfVoiceDelta, false)],
    ['COM VARREDURA', `${summary.withCurrent}/${summary.keywordCount}`, 'palavras-chave no mês', palette.muted],
    ['COMPARÁVEIS', `${summary.compared}`, 'com varredura nos dois meses', palette.muted],
  ];
  const cardGap = 3;
  const cardWidth = (width - MARGIN * 2 - cardGap * 3) / 4;
  cards.forEach(([label, value, detail, detailColor], index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    w.fill(palette.panel);
    pdf.roundedRect(x, w.y, cardWidth, 25, 2.5, 2.5, 'F');
    w.font(6.5, 'bold', palette.muted);
    w.text(label, x + 3, w.y + 6);
    w.font(15, 'bold');
    w.text(value, x + 3, w.y + 15);
    w.font(6.3, 'normal', detailColor);
    w.text(detail, x + 3, w.y + 21, { maxWidth: cardWidth - 5 });
  });
  w.y += 33;

  w.font(11, 'bold');
  w.text('Palavras-chave', MARGIN, w.y);
  w.y += 6;
  for (const keyword of report.keywords) {
    w.ensure(6);
    const line = keyword.current
      ? `${keyword.keyword}: posição média ${fmt(keyword.current.avgPosition ?? 21)}${keyword.delta?.avgPosition != null ? ` (${signed(keyword.delta.avgPosition)})` : ' (sem comparação)'}, top 3 em ${keyword.current.top3Points}/${keyword.current.activePoints} pontos`
      : `${keyword.keyword}: sem varredura concluída em ${report.monthLabel}`;
    w.paragraph(line, 8, palette.ink);
    w.y += 0.8;
  }
  w.y += 4;

  w.ensure(30);
  w.font(11, 'bold');
  w.text('Como ler este relatório', MARGIN, w.y);
  w.y += 5.5;
  for (const line of [
    `Cada palavra-chave compara a última varredura concluída de ${report.monthLabel} com a última de ${report.previousMonthLabel}, na mesma grade. A grade da esquerda é o mês anterior; a da direita, o mês do relatório.`,
    'Fatos medidos vêm das varreduras. Dados ausentes dizem o que não foi medido. Hipóteses são explicações a verificar e recomendações são próximos passos propostos: nenhuma das duas é resultado medido.',
    'Posição média conta 21 onde a empresa não aparece no top 20. Share of Voice pondera as posições (1º lugar pesa mais). Pontos desligados ficam fora das contas. A amostra de pontos não equivale à cobertura de mercado.',
  ]) {
    w.paragraph(line, 7.8, palette.muted);
    w.y += 1.5;
  }
  w.y += 2;
  let legendX = MARGIN;
  for (const tier of RANK_TIER_ORDER) {
    w.fill(RANK_TIERS[tier].pdfFill);
    pdf.roundedRect(legendX, w.y - 2.5, 3.5, 3.5, 0.6, 0.6, 'F');
    w.font(6.5, 'normal', palette.muted);
    w.text(RANK_TIERS[tier].label, legendX + 5, w.y);
    legendX += 5 + pdf.getTextWidth(pdfSafeText(RANK_TIERS[tier].label)) + 5;
  }

  for (const keyword of report.keywords) {
    pdf.addPage();
    w.y = continuationHeader();
    keywordSection(w, keyword, report);
  }

  const pages = pdf.getNumberOfPages();
  const footerText = footerPalette(style).text;
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    drawFooter(pdf, {
      text: brand.footer.trim() || `Preparado por ${brand.name}`,
      style, pageWidth: width, pageHeight: height, margin: MARGIN,
      baseline: height - 5, bandTop: height - FOOTER_TOP_OFFSET + 3, reservedRight: 40,
    });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(footerText[0], footerText[1], footerText[2]);
    pdf.text(pdfSafeText(`Página ${page} de ${pages}`), width - MARGIN, height - 5, { align: 'right' });
  }
  return pdf;
}

