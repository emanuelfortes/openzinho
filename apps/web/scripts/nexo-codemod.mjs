// Nexo codemod: rewrites Tailwind classes in apps/web/src to the Nexo tokens.
// Usage (from apps/web): node scripts/nexo-codemod.mjs src [--dry]
// One-off migration for the Nexo rebrand; see docs/NEXO-HANDOFF.md.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const dry = process.argv.includes('--dry');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

const files = walk(root).filter((file) => /\.(tsx|ts)$/.test(file) && !/\.test\.tsx?$/.test(file) && !/[\\/]lib[\\/](brand|brand-pdf|report-pdf-blocks|review-report-pdf|map-capture)\.ts$/.test(file));

const GROUP = {
  slate: 'neutral', gray: 'neutral', zinc: 'neutral', neutral: 'neutral', stone: 'neutral',
  blue: 'accent', sky: 'accent', cyan: 'accent', indigo: 'accent', violet: 'accent', purple: 'accent', fuchsia: 'accent', pink: 'accent', teal: 'accent',
  emerald: 'success', green: 'success', lime: 'success',
  red: 'danger', rose: 'danger',
  amber: 'warn', yellow: 'warn', orange: 'warn',
};
const FAMILIES = Object.keys(GROUP).join('|');
const PROPS = 'bg|text|border-[trblxy]|border|ring-offset|ring|divide|from|via|to|fill|stroke|outline|placeholder|accent|decoration|caret|shadow';

const B = `(?<=^|[\\s'"\`{(])`;
const A = `(?=$|[\\s'"\`})])`;
const COLOR_RE = new RegExp(`${B}((?:[a-z0-9\\-\\[\\]&_=]+:)*)(${PROPS})-(${FAMILIES}|white|black)(?:-(\\d{2,3}))?(\\/(?:\\d{1,3}|\\[[^\\]\\s]+\\]))?${A}`, 'gm');
const DARK_RE = new RegExp(`(^|[\\s'"\`{(])((?:[a-z0-9\\-\\[\\]&_=]+:)*dark:[^\\s'"\`})]+)`, 'gm');

const lineProp = (prop) => (prop.startsWith('border') ? 'border' : prop === 'divide' || prop === 'outline' || prop === 'ring' || prop === 'decoration' || prop === 'caret' || prop === 'accent' ? 'line' : prop);

function mapColor(variants, prop, family, shadeText, opacity) {
  const shade = shadeText ? Number(shadeText) : null;
  const hover = /(^|:)(hover|focus|group-hover|active|focus-visible|peer-hover):$/.test(variants) || /hover:|focus:/.test(variants);
  const kind = lineProp(prop);
  const out = (value) => (value === null ? '' : `${variants}${prop}-${value}`);

  if (prop === 'shadow') return '';
  if (prop === 'ring-offset') return `${variants}ring-offset-nexo-bg`;

  if (family === 'white') {
    if (prop === 'bg') return opacity ? `${variants}bg-nexo-bg${opacity}` : hover ? `${variants}bg-white/[0.06]` : `${variants}bg-nexo-surface`;
    if (kind === 'border' || kind === 'line') return `${variants}${prop}-nexo-border`;
    return `${variants}${prop}-white${opacity ?? ''}`;
  }
  if (family === 'black') return `${variants}${prop}-black${opacity ?? ''}`;

  const group = GROUP[family];
  const s = shade ?? 500;

  if (group === 'neutral') {
    if (prop === 'bg') {
      if (hover) return out(s <= 200 ? 'white/[0.04]' : 'white/10');
      if (s <= 50) return out('white/[0.02]');
      if (s === 100) return out('nexo-surface-2');
      if (s === 200) return out('white/10');
      if (s === 300) return out('white/20');
      if (s === 400) return out('white/30');
      if (s === 500) return out('white/40');
      if (s === 600) return out('white/20');
      if (s >= 950) return out('nexo-bg');
      return out('nexo-surface-2');
    }
    if (prop === 'text') {
      if (hover && s >= 600) return out('white');
      if (s <= 200) return out('nexo-text');
      if (s <= 400) return out('nexo-faint');
      if (s <= 700) return out('nexo-dim');
      return out('nexo-text');
    }
    if (kind === 'border' || kind === 'line') return out(s <= 300 ? 'nexo-border' : 'nexo-border-strong');
    if (prop === 'placeholder') return out('white/30');
    if (prop === 'from' || prop === 'via' || prop === 'to') return out('white/5');
    return out('nexo-faint');
  }
  if (group === 'accent') {
    if (prop === 'bg') {
      if (hover) return out(s <= 100 ? 'nexo-blue/15' : 'nexo-sky');
      if (s <= 100) return out('nexo-blue/10');
      if (s === 200) return out('nexo-blue/20');
      if (s <= 400) return out('nexo-sky/40');
      if (s <= 700) return out('nexo-blue');
      return out('nexo-navy');
    }
    if (prop === 'text') {
      if (hover && s >= 700) return out('white');
      return out(s <= 300 ? 'nexo-ice' : 'nexo-sky');
    }
    if (kind === 'border' || kind === 'line') return out(s <= 300 ? 'nexo-border-strong' : 'nexo-sky');
    if (prop === 'from' || prop === 'via' || prop === 'to') return out(s <= 200 ? 'nexo-blue/10' : 'nexo-blue');
    return out('nexo-sky');
  }
  const solid = { success: 'nexo-ice', danger: 'nexo-danger', warn: 'nexo-warn' }[group];
  const textColor = { success: 'nexo-ice', danger: 'nexo-danger-text', warn: 'nexo-warn-text' }[group];
  const line = { success: 'nexo-ice/30', danger: 'nexo-danger/40', warn: 'nexo-warn/40' }[group];
  if (prop === 'bg') {
    if (hover) return out(s <= 100 ? `${solid}/15` : `${solid}/80`);
    if (s <= 100) return out(`${solid}/10`);
    if (s === 200) return out(`${solid}/20`);
    return out(solid);
  }
  if (prop === 'text') return out(textColor);
  if (kind === 'border' || kind === 'line') return out(line);
  if (prop === 'from' || prop === 'via' || prop === 'to') return out(s <= 200 ? `${solid}/10` : solid);
  return out(solid);
}

// Quoted segments: '…', "…", `…` (static template text included).
const SEGMENT_RE = /'[^'\n]*'|"[^"\n]*"|`[^`]*`/g;
const mapSegments = (text, fn) => text.replace(SEGMENT_RE, (segment) => {
  const quote = segment[0];
  return quote + fn(segment.slice(1, -1)) + quote;
});
const has = (text, re) => re.test(text);
const removeTokens = (text, re) => text.replace(re, ' ');

const LABEL_SIZE = /(?<=^|\s)(?:text-\[10px\]|text-\[11px\]|text-xs)(?=\s|$)/;
const LABEL_TRACK = /(?<=^|\s)tracking-(?:widest|wider|\[0\.\d+em\])(?=\s|$)/;

function transform(source) {
  let text = source;

  // 1. Dark-only: drop every dark: variant.
  text = text.replace(DARK_RE, (match, lead) => lead);

  // 2. Dark button with white text -> Nexo primary (white, #030508 text). Placeholders survive step 3.
  text = mapSegments(text, (segment) => {
    if (!has(segment, /(?<=^|\s)bg-(?:slate|gray|zinc)-(?:800|900|950)(?=\s|$)/) || !has(segment, /(?<=^|\s)text-white(?=\s|$)/)) return segment;
    return segment
      .replace(/(?<=^|\s)bg-(?:slate|gray|zinc)-(?:800|900|950)(?=\s|$)/g, '@@BGWHITE@@')
      .replace(/(?<=^|\s)text-white(?=\s|$)/g, '@@TEXTBG@@')
      .replace(/(?<=^|\s)hover:bg-(?:slate|gray|zinc|blue)-\d{3}(?=\s|$)/g, '@@HOVERICE@@');
  });

  // 3. Colour tokens.
  text = text.replace(COLOR_RE, (match, variants, prop, family, shade, opacity) => mapColor(variants, prop, family, shade, opacity));

  // 4. Weight, radius, shadow.
  text = text.replace(new RegExp(`${B}((?:[a-z0-9\\-\\[\\]&_=]+:)*)font-(?:black|extrabold|bold)${A}`, 'gm'), (m, v) => `${v}font-medium`);
  text = text.replace(new RegExp(`${B}((?:[a-z0-9\\-\\[\\]&_=]+:)*)rounded(-[trblse]{1,2})?-(?:xl|2xl|3xl|\\[2rem\\]|\\[1\\.5rem\\]|\\[1\\.75rem\\])${A}`, 'gm'), (m, v, side) => `${v}rounded${side ?? ''}-nexo-lg`);
  text = text.replace(new RegExp(`${B}((?:[a-z0-9\\-\\[\\]&_=]+:)*)rounded(-[trblse]{1,2})?-lg${A}`, 'gm'), (m, v, side) => `${v}rounded${side ?? ''}-nexo`);
  text = text.replace(new RegExp(`${B}(?:[a-z0-9\\-\\[\\]&_=]+:)*shadow(?:-(?:sm|md|lg|xl|2xl|inner|none)|-\\[[^\\]\\s]+\\])?${A}`, 'gm'), '');

  // 5. Uppercase small labels -> nexo-label / nexo-section; big numbers -> nexo-metric.
  text = mapSegments(text, (segment) => {
    let out = segment;
    if (has(out, /(?<=^|\s)uppercase(?=\s|$)/) && has(out, LABEL_TRACK) && has(out, LABEL_SIZE) && !has(out, /\$\{/)) {
      const isSection = has(out, /(?<=^|\s)text-nexo-sky(?=\s|$)/);
      const plainColor = has(out, /(?<=^|\s)text-nexo-(?:faint|dim)(?=\s|$)/) || !has(out, /(?<=^|\s)text-(?:nexo-|white|\[#)/);
      if (isSection || plainColor) {
        out = removeTokens(out, /(?<=^|\s)(?:uppercase|tracking-(?:widest|wider|tighter|tight|\[0\.\d+em\])|text-\[10px\]|text-\[11px\]|text-xs|text-nexo-(?:faint|dim|sky)|font-(?:medium|semibold))(?=\s|$)/g);
        out = `${isSection ? 'nexo-section' : 'nexo-label'} ${out}`;
      }
    }
    if (has(out, /(?<=^|\s)text-(?:2xl|3xl|4xl)(?=\s|$)/) && has(out, /(?<=^|\s)tabular-nums(?=\s|$)/) && !has(out, /\$\{/)) {
      out = removeTokens(out, /(?<=^|\s)(?:font-(?:medium|semibold|light)|tracking-\S+|text-nexo-(?:text|dim))(?=\s|$)/g);
      out = `nexo-metric font-mono ${out}`;
    }
    return out;
  });

  // 6. Page titles.
  text = text.replace(/<h1(\s[^>]*?)?className="([^"]*)"/g, (match, attrs = '', classes) => {
    const kept = classes.split(/\s+/).filter((token) => token && !/^(?:text-(?:xs|sm|base|lg|xl|\dxl|nexo-\S+|white)|font-\S+|tracking-\S+|leading-\S+)$/.test(token));
    return `<h1${attrs}className="${['nexo-h1', ...kept].join(' ')}"`;
  });

  // 7. Form fields: nexo-input + min-w-0 w-full (keep explicit widths).
  const fieldClasses = (classes) => {
    const tokens = classes.split(/\s+/).filter((token) => token && !/^(?:(?:focus:)?bg-\S+|(?:focus:)?border-nexo-\S+|border|rounded(?:-\S+)?|text-nexo-(?:text|dim)|placeholder-\S+)$/.test(token));
    const widthGiven = tokens.some((token) => /^(?:w-|max-w-|flex-1$|basis-)/.test(token) && token !== 'w-full');
    const result = ['nexo-input', 'min-w-0', ...(widthGiven ? [] : ['w-full']), ...tokens.filter((token) => token !== 'w-full' && token !== 'min-w-0')];
    return [...new Set(result)].join(' ');
  };
  text = text.replace(/<(input|select|textarea)\b([^<]{0,700}?)className="([^"]*)"/g, (match, tag, between, classes) => {
    if (/type=["'{](?:checkbox|radio|hidden|range|color|file)/.test(between) || /type=\{?["'](?:checkbox|radio|hidden|range|color|file)/.test(match)) return match;
    if (/[<]/.test(between) || /\/>/.test(between)) return match;
    return `<${tag}${between}className="${fieldClasses(classes)}"`;
  });
  text = text.replace(/(const\s+\w*(?:input|field|Input|Field)\w*\s*=\s*)(['"`])([^'"`\n]*)\2/g, (match, lead, quote, classes) => {
    if (/\$\{/.test(classes) || !/\b(?:px-|py-|p-|border|rounded)/.test(classes)) return match;
    return `${lead}${quote}${fieldClasses(classes)}${quote}`;
  });

  // 8. Fixed multi-column layouts reflow on narrow screens.
  text = mapSegments(text, (segment) => {
    if (!has(segment, /(?<=^|\s)(?:sm|md|lg|xl|2xl):grid-cols-\[[^\]\s]*px[^\]\s]*\]|(?<=^|\s)xl:grid-cols-3(?=\s|$)/)) return segment;
    let out = removeTokens(segment, /(?<=^|\s)(?:(?:sm|md|lg|xl|2xl):grid-cols-\[[^\]\s]*px[^\]\s]*\]|xl:grid-cols-3|grid-cols-1)(?=\s|$)/g);
    if (!has(out, /grid-cols-\[repeat\(auto-fit/)) out = `${out} grid-cols-[repeat(auto-fit,minmax(320px,1fr))]`;
    return out;
  });

  // Placeholders and whitespace.
  text = text
    .replaceAll('@@BGWHITE@@', 'bg-white')
    .replaceAll('@@TEXTBG@@', 'text-nexo-bg')
    .replaceAll('@@HOVERICE@@', 'hover:bg-nexo-ice');
  // Collapse the gaps left by removed tokens, only in one-line class-looking strings.
  text = mapSegments(text, (segment) => (!segment.includes('\n') && /(?:^|\s)[a-z]+-[a-z0-9]/.test(segment) ? segment.replace(/ {2,}/g, ' ') : segment));
  text = text.replace(/className=" +/g, 'className="');
  return text;
}

let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    changed += 1;
    if (!dry) fs.writeFileSync(file, after);
  }
}
console.log(`${changed} of ${files.length} files ${dry ? 'would change' : 'changed'}`);
