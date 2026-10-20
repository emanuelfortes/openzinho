'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Project } from '@/lib/db';
import { createProjectAction, deleteProjectAction, updateProjectAction } from './actions';
import LocationPicker from '@/components/LocationPicker';
import ProjectFavicon from '@/components/ProjectFavicon';
import MapPicker from '@/app/dashboard/local-finder/MapPicker';

const inputClass = 'nexo-input min-w-0 w-full px-3 py-2.5 text-sm font-medium outline-none transition focus:ring-4 focus:ring-nexo-sky';

function ProjectFields({ project, includeName = true }: { project?: Project; includeName?: boolean }) {
  const [coordinates, setCoordinates] = useState(project?.defaultCoordinates ?? '');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {includeName && (
        <label className="space-y-1.5">
          <span className="nexo-label">Project name</span>
          <input required name="name" defaultValue={project?.name ?? ''} placeholder="e.g. Acme France" className={inputClass} />
        </label>
      )}
      <label className="space-y-1.5">
        <span className="nexo-label">Domain</span>
        <input required name="domain" defaultValue={project?.domain ?? ''} placeholder="example.com" className={inputClass} />
      </label>
      <label className="space-y-1.5">
        <span className="nexo-label">Default location</span>
        <LocationPicker name="default_location" defaultValue={project?.defaultLocation ?? ''} placeholder="e.g. Paris, France" className={inputClass} />
        <span className="block text-[10px] leading-relaxed text-nexo-faint">Use the precise city or region. Country-only tools automatically use its country.</span>
      </label>
      <label className="space-y-1.5">
        <span className="nexo-label">Default language</span>
        <input name="default_language" defaultValue={project?.defaultLanguage ?? ''} placeholder="e.g. French" className={inputClass} />
      </label>
      <div className="space-y-2 md:col-span-2">
        <span className="nexo-label">Default coordinates</span>
        <p className="text-xs leading-relaxed text-nexo-faint">Search for a place or click the map to set the point used by local tools.</p>
        <MapPicker coordinate={coordinates} onChange={setCoordinates} />
        <input name="default_coordinates" value={coordinates} onChange={(event) => setCoordinates(event.target.value)} placeholder="Click the map or enter lat,lng" className={inputClass} />
      </div>
      <label className="space-y-1.5">
        <span className="nexo-label">Rank Tracker depth</span>
        <select name="rank_tracker_depth" defaultValue={project?.rankTrackerDepth ?? '100'} className={inputClass}>
          {['10', '20', '50', '100'].map((depth) => <option key={depth} value={depth}>Top {depth}</option>)}
        </select>
      </label>
    </div>
  );
}

function ExistingProject({ project, active, canDelete, startEditing }: { project: Project; active: boolean; canDelete: boolean; startEditing: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  useEffect(() => setEditing(startEditing), [startEditing]);
  return (
    <section className={`border-b border-nexo-border py-6 last:border-0 ${active ? 'relative' : ''}`}>
      {editing ? (
        <form action={updateProjectAction} className="space-y-5">
          <input type="hidden" name="id" value={project.id} />
          <ProjectFields project={project} />
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-nexo-lg bg-nexo-blue px-4 py-2.5 text-[10px] font-medium uppercase tracking-widest text-white transition hover:bg-nexo-sky">Save changes</button>
            <button type="button" onClick={() => setEditing(false)} className="nexo-label rounded-nexo-lg px-3 py-2.5 hover:text-white">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ProjectFavicon domain={project.domain} className="h-10 w-10 rounded-nexo-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="truncate text-sm font-medium text-nexo-text">{project.name}</h2>{active && <span className="rounded-full bg-nexo-blue/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-nexo-sky">Active</span>}</div>
            <p className="mt-0.5 truncate text-xs text-nexo-faint">{project.domain} · {project.defaultLocation || 'No default location'} · Top {project.rankTrackerDepth}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setEditing(true)} className="nexo-label inline-flex items-center gap-1.5 rounded-nexo px-3 py-2 hover:bg-white/[0.04] hover:text-white"><Pencil className="h-3 w-3" /> Edit</button>
            {canDelete && <form action={deleteProjectAction} onSubmit={(event) => { if (!window.confirm(`Delete “${project.name}” and all of its history permanently? This cannot be undone.`)) event.preventDefault(); }}><input type="hidden" name="id" value={project.id} /><button type="submit" className="inline-flex items-center gap-1.5 rounded-nexo px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-nexo-danger-text hover:bg-nexo-danger/15"><Trash2 className="h-3 w-3" /> Delete</button></form>}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProjectsManager({ projects, activeProjectId, editingProjectId }: { projects: Project[]; activeProjectId: string; editingProjectId?: string }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-8 pb-12">
      <div>
        <p className="nexo-section">Workspace</p>
        <h1 className="nexo-h1 mt-2">Projects</h1>
        <p className="mt-1 text-sm font-medium text-nexo-dim">Each project keeps its own defaults, search history, and results.</p>
      </div>

      <div className="overflow-hidden rounded-nexo-lg border border-nexo-border bg-nexo-surface px-7">
        {projects.map((project) => <ExistingProject key={project.id} project={project} active={project.id === activeProjectId} canDelete={projects.length > 1} startEditing={project.id === editingProjectId} />)}
      </div>

      <section id="new-project" className="rounded-nexo-lg border border-dashed border-nexo-border-strong bg-nexo-blue/10 p-7">
        {creating ? (
          <form action={createProjectAction} className="space-y-5">
            <div className="flex items-center justify-between"><div><h2 className="text-base font-medium text-nexo-text">New project</h2><p className="mt-0.5 text-xs text-nexo-dim">Its domain must be unique.</p></div><button type="button" onClick={() => setCreating(false)} className="rounded-nexo p-2 text-nexo-faint hover:bg-white/[0.06] hover:text-white"><X className="h-4 w-4" /></button></div>
            <ProjectFields />
            <button type="submit" className="rounded-nexo-lg bg-nexo-blue px-5 py-3 text-[10px] font-medium uppercase tracking-widest text-white transition hover:bg-nexo-sky">Create and switch</button>
          </form>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-3 text-left"><span className="grid h-10 w-10 place-items-center rounded-nexo-lg bg-nexo-blue text-white"><Plus className="h-4 w-4" /></span><span><span className="block text-sm font-medium text-nexo-text">Create a project</span><span className="block text-xs text-nexo-dim">Add a domain and project-specific defaults.</span></span></button>
        )}
      </section>
    </div>
  );
}
