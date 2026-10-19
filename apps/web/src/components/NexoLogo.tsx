/** Nexo wordmark: a vertical ice-to-blue bar followed by NEXO. */
export default function NexoLogo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg';
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className={`inline-block shrink-0 rounded-[2px] bg-[linear-gradient(180deg,#c2e0ff,#1f6bff)] ${large ? 'h-6 w-2.5' : 'h-5 w-2'}`}
      />
      <span className={`font-medium tracking-[0.1em] text-[#eaf2ff] ${large ? 'text-xl' : 'text-sm'}`}>NEXO</span>
    </span>
  );
}
