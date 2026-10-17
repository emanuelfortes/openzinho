'use client';

import { deleteCampaignAction } from '@/app/dashboard/campaigns/actions';

export default function DeleteCampaignButton({ id }: { id: string }) {
  return (
    <form
      action={deleteCampaignAction}
      onSubmit={(event) => {
        if (!window.confirm('Delete this campaign? Its schedules stop. Runs already made stay available as Geo-grid monitors.')) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-red-600">
        Delete
      </button>
    </form>
  );
}
