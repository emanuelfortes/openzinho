import Link from 'next/link';
import { hasActiveFilters, type ReviewFilters } from './filter';

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2 text-sm outline-none focus:border-nexo-sky';

/** GET form: the filters live in the URL, so a filtered list can be shared or reloaded. */
export default function ReviewFiltersForm({ taskId, filters, shown, total }: { taskId: string; filters: ReviewFilters; shown: number; total: number }) {
  return (
    <form method="get" action="/dashboard/google-reviews" className="grid gap-3 border-b border-nexo-border px-6 py-4 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      <input type="hidden" name="id" value={taskId} />
      <label className="space-y-1">
        <span className="nexo-label block">Nota</span>
        <select name="nota" defaultValue={filters.nota} className={fieldCls}>
          <option value="">Todas</option>
          <option value="positivas">Positivas (4 e 5)</option>
          <option value="negativas">Negativas (1 a 3)</option>
          {[5, 4, 3, 2, 1].map((stars) => <option key={stars} value={String(stars)}>{stars} {stars === 1 ? 'estrela' : 'estrelas'}</option>)}
        </select>
      </label>
      <label className="space-y-1">
        <span className="nexo-label block">Resposta</span>
        <select name="resposta" defaultValue={filters.resposta} className={fieldCls}>
          <option value="">Todas</option>
          <option value="sem-resposta">Sem resposta</option>
          <option value="respondidas">Respondidas</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="nexo-label block">Período</span>
        <select name="periodo" defaultValue={filters.periodo} className={fieldCls}>
          <option value="">Todo o período</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Último ano</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="nexo-label block">Texto</span>
        <input name="q" defaultValue={filters.q} placeholder="Palavra, autor ou resposta" className={fieldCls} />
      </label>
      <div className="flex items-end gap-3">
        <button type="submit" className="nexo-btn-accent px-4 py-2.5">Filtrar</button>
        {hasActiveFilters(filters) && (
          <Link href={`/dashboard/google-reviews?id=${encodeURIComponent(taskId)}`} className="nexo-label pb-2.5 hover:text-white">Limpar</Link>
        )}
      </div>
      {hasActiveFilters(filters) && (
        <p className="text-xs text-nexo-dim sm:col-span-full">
          <span className="font-mono text-nexo-ice">{shown}</span> de {total} {total === 1 ? 'avaliação' : 'avaliações'} com estes filtros.
        </p>
      )}
    </form>
  );
}
