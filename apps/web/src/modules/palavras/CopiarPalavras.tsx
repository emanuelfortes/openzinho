'use client';

import { useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';

export default function CopiarPalavras({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" onClick={copy} className="nexo-btn-ghost nexo-label flex items-center gap-2 rounded-nexo-lg px-4 py-2.5">
      {copied ? <Check className="h-3.5 w-3.5 text-nexo-ice" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}
