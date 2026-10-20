import NexoLogo from './NexoLogo';

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-nexo-bg px-4">
      <div className="nexo-beams h-full" />
      <div className="relative grid w-full max-w-[400px] gap-7 p-6">
        <div className="flex items-center justify-center">
          <NexoLogo size="lg" />
        </div>
        <div className="grid gap-4 rounded-nexo-lg border border-nexo-border-strong bg-nexo-bg/[0.04] p-7 backdrop-blur-xl">
          <div>
            <h1 className="nexo-h1 text-[28px]">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-nexo-dim">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
