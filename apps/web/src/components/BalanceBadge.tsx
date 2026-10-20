'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function BalanceBadge() {
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((data: { balance: string | null }) => {
        if (data.balance !== null) setBalance(data.balance);
      })
      .catch(() => {});
  }, []);

  return (
    <Link
      href="/dashboard/spending"
      title="Ver quanto você gastou"
      className="flex items-center gap-2 rounded-nexo border border-[rgba(77,162,255,.35)] px-3 py-1.5 transition-colors hover:border-nexo-ice hover:bg-nexo-blue/10"
    >
      <span className="nexo-label">Saldo</span>
      <span className="font-mono text-sm font-medium text-[#c2e0ff]">
        {balance === null ? '…' : `US$ ${balance.replace('.', ',')}`}
      </span>
    </Link>
  );
}
