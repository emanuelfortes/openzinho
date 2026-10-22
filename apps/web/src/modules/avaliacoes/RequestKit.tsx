'use client';

// Review request kit: link, QR code, WhatsApp, e-mail and a printable card. Nothing is sent from
// here: every button copies, downloads or opens the user's own app.
import { useMemo, useState } from 'react';
import {
  defaultEmailTemplate, defaultWhatsAppMessage, fileStem, mailtoLink, whatsAppLink, type ReviewLink,
} from './request-kit';

interface Brand { name: string; logo: string | null; color: string }

interface Props {
  business: string;
  link: ReviewLink;
  qrSvg: string;
  brand: Brand;
}

type CardSize = 'A6' | 'A4';

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2 text-sm outline-none focus:border-nexo-sky';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function svgToPng(svg: string, size = 1024): Promise<Blob | null> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('svg'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, size, size);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="nexo-btn-ghost px-3 py-1.5 shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch { /* clipboard blocked: the text stays selectable */ }
      }}
    >
      {done ? 'Copiado' : label}
    </button>
  );
}

export default function RequestKit({ business, link, qrSvg, brand }: Props) {
  const [message, setMessage] = useState(() => defaultWhatsAppMessage(business, link.url));
  const [phone, setPhone] = useState('');
  const initialEmail = useMemo(() => defaultEmailTemplate(business, link.url), [business, link.url]);
  const [subject, setSubject] = useState(initialEmail.subject);
  const [body, setBody] = useState(initialEmail.body);
  const [emailTo, setEmailTo] = useState('');
  const [headline, setHeadline] = useState('Gostou do atendimento?');
  const [subline, setSubline] = useState('Aponte a câmera do celular e deixe sua avaliação no Google.');
  const [size, setSize] = useState<CardSize>('A6');
  const [showBrand, setShowBrand] = useState(true);

  const stem = fileStem(business);
  const waUrl = whatsAppLink(message, phone);
  const mailUrl = mailtoLink({ subject, body }, emailTo);
  const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`;

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { size: ${size} portrait; margin: 0; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #nexo-review-card, #nexo-review-card * { visibility: visible !important; }
          #nexo-review-card {
            position: fixed !important; inset: 0 !important; margin: 0 !important;
            width: 100% !important; height: 100% !important; max-width: none !important;
            border: 0 !important; border-radius: 0 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
      `}</style>

      <section className="nexo-panel p-5 space-y-3">
        <h2 className="nexo-label">Link para avaliar</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly value={link.url} className={`${fieldCls} font-mono text-xs`} aria-label="Link para avaliar" onFocus={(event) => event.currentTarget.select()} />
          <CopyButton value={link.url} />
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="nexo-btn-ghost px-3 py-1.5 text-center shrink-0">Testar</a>
        </div>
        {link.note && <p className="text-xs text-nexo-warn-text">{link.note}</p>}
      </section>

      <section className="nexo-panel p-5">
        <h2 className="nexo-label mb-3">QR code</h2>
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR code do link para avaliar" width={176} height={176} className="rounded-nexo bg-white p-1" />
          <div className="space-y-2 text-xs text-nexo-dim">
            <p>Use o SVG em material impresso (não perde qualidade) e o PNG em posts e mensagens.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="nexo-btn-ghost px-3 py-1.5" onClick={() => download(new Blob([qrSvg], { type: 'image/svg+xml' }), `qr-avaliacao-${stem}.svg`)}>Baixar SVG</button>
              <button type="button" className="nexo-btn-ghost px-3 py-1.5" onClick={async () => { const png = await svgToPng(qrSvg); if (png) download(png, `qr-avaliacao-${stem}.png`); }}>Baixar PNG</button>
            </div>
          </div>
        </div>
      </section>

      <section className="nexo-panel p-5 space-y-3">
        <h2 className="nexo-label">WhatsApp</h2>
        <label className="block">
          <span className="nexo-label block mb-1.5">Mensagem</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className={fieldCls} />
        </label>
        <label className="block max-w-xs">
          <span className="nexo-label block mb-1.5">Número do cliente (opcional)</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="ex.: (11) 98765-4321" className={fieldCls} inputMode="tel" />
        </label>
        <p className="text-[11px] text-nexo-faint">Sem número, o WhatsApp pergunta para quem enviar. O envio é feito por você, no seu WhatsApp.</p>
        <div className="flex flex-wrap gap-2">
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="nexo-btn-accent px-3 py-2">Abrir no WhatsApp</a>
          <CopyButton value={waUrl} label="Copiar link do WhatsApp" />
          <CopyButton value={message} label="Copiar mensagem" />
        </div>
      </section>

      <section className="nexo-panel p-5 space-y-3">
        <h2 className="nexo-label">E-mail</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="nexo-label block mb-1.5">Para (opcional)</span>
            <input value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="cliente@exemplo.com" className={fieldCls} type="email" />
          </label>
          <label className="block">
            <span className="nexo-label block mb-1.5">Assunto</span>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} className={fieldCls} />
          </label>
        </div>
        <label className="block">
          <span className="nexo-label block mb-1.5">Texto</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={9} className={fieldCls} />
        </label>
        <div className="flex flex-wrap gap-2">
          <a href={mailUrl} className="nexo-btn-accent px-3 py-2">Abrir no programa de e-mail</a>
          <CopyButton value={`${subject}\n\n${body}`} label="Copiar texto" />
        </div>
      </section>

      <section className="nexo-panel p-5 space-y-4">
        <h2 className="nexo-label">Cartão para imprimir</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="nexo-label block mb-1.5">Título</span>
            <input value={headline} onChange={(event) => setHeadline(event.target.value)} className={fieldCls} />
          </label>
          <label className="block">
            <span className="nexo-label block mb-1.5">Texto</span>
            <input value={subline} onChange={(event) => setSubline(event.target.value)} className={fieldCls} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="nexo-seg" role="tablist" aria-label="Tamanho do cartão">
            {(['A6', 'A4'] as CardSize[]).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={size === value} onClick={() => setSize(value)}>{value}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-nexo-dim">
            <input type="checkbox" checked={showBrand} onChange={(event) => setShowBrand(event.target.checked)} />
            Mostrar a marca ({brand.name})
          </label>
          <button type="button" className="nexo-btn-primary px-4 py-2" onClick={() => window.print()}>Imprimir ou salvar em PDF</button>
        </div>
        <p className="text-[11px] text-nexo-faint">Na janela de impressão, escolha o papel {size} e &quot;Salvar como PDF&quot; se quiser o arquivo.</p>

        <div
          id="nexo-review-card"
          className="mx-auto flex flex-col items-center justify-center text-center bg-white text-[#030508] rounded-nexo-lg border border-nexo-border"
          style={{ aspectRatio: '105 / 148', maxWidth: size === 'A6' ? 300 : 420, padding: size === 'A6' ? '24px 20px' : '40px 32px', borderTop: `8px solid ${brand.color}` }}
        >
          <p style={{ fontSize: size === 'A6' ? 20 : 30, fontWeight: 500, lineHeight: 1.15, color: brand.color }}>{headline}</p>
          <p style={{ fontSize: size === 'A6' ? 12 : 16, marginTop: 8, color: '#333' }}>{subline}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="" style={{ width: '62%', height: 'auto', marginTop: 16 }} />
          <p style={{ fontSize: size === 'A6' ? 14 : 20, fontWeight: 500, marginTop: 12 }}>{business}</p>
          <p style={{ fontSize: size === 'A6' ? 18 : 26, color: '#f5b301', letterSpacing: 2 }} aria-hidden>★★★★★</p>
          {showBrand && (
            <div className="flex items-center gap-2" style={{ marginTop: 'auto', paddingTop: 12, fontSize: 10, color: '#666' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {brand.logo && <img src={brand.logo} alt="" style={{ height: 18, width: 'auto' }} />}
              <span>{brand.name}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
