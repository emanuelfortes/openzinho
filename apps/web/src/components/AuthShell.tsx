import NexoLogo from './NexoLogo';

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center">
          <NexoLogo size="lg" />
        </div>
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}
