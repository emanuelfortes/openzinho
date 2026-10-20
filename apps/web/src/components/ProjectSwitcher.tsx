'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, ChevronDown, FolderKanban, Plus, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/db';
import { selectProjectAction } from '@/app/dashboard/projects/actions';
import ProjectFavicon from './ProjectFavicon';

export default function ProjectSwitcher({ projects, activeProject }: { projects: Project[]; activeProject: Project }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={rootRef} className="relative px-3 pt-3 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex w-full items-center gap-2 rounded-nexo-lg border border-nexo-border bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-nexo-border-strong hover:bg-nexo-blue/15"
      >
        <ProjectFavicon domain={activeProject.domain} className="h-7 w-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-nexo-text">{activeProject.name}</span>
          <span className="block truncate text-[10px] font-medium text-nexo-faint">{activeProject.domain}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-nexo-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute left-3 right-3 top-[calc(100%+6px)] z-30 overflow-hidden rounded-nexo-lg border border-nexo-border bg-nexo-surface py-1.5">
          <p className="px-3 pb-1.5 pt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-nexo-faint">Projetos</p>
          <div className="max-h-52 overflow-y-auto px-1.5 scrollbar-thin">
            {projects.map((project) => (
              <form key={project.id} action={selectProjectAction}>
                <input type="hidden" name="id" value={project.id} />
                <input type="hidden" name="return_to" value={pathname} />
                <div className={`flex items-center rounded-nexo transition-colors ${project.id === activeProject.id ? 'bg-nexo-blue/10 text-nexo-sky' : 'text-nexo-dim hover:bg-white/[0.04]'}`}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <ProjectFavicon domain={project.domain} className="h-6 w-6" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{project.name}</span>
                      <span className="block truncate text-[10px] opacity-65">{project.domain}</span>
                    </span>
                    {project.id === activeProject.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                  <Link
                    href={`/dashboard/projects?edit=${encodeURIComponent(project.id)}`}
                    onClick={() => setOpen(false)}
                    aria-label={`Editar configurações de ${project.name}`}
                    title="Configurações do projeto"
                    className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-nexo-faint transition-colors hover:bg-white/[0.06] hover:text-nexo-sky"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </form>
            ))}
          </div>
          <div className="mt-1 border-t border-nexo-border px-1.5 pt-1.5">
            <Link href="/dashboard/projects" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-nexo px-2 py-2 text-xs font-semibold text-nexo-dim transition-colors hover:bg-white/[0.04] hover:text-white">
              <FolderKanban className="h-3.5 w-3.5" /> Gerenciar projetos
            </Link>
            <Link href="/dashboard/projects#new-project" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-nexo px-2 py-2 text-xs font-semibold text-nexo-sky transition-colors hover:bg-nexo-blue/15">
              <Plus className="h-3.5 w-3.5" /> Criar projeto
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
