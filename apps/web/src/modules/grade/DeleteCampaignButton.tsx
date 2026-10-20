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
      <button type="submit" className="nexo-label transition-colors hover:text-nexo-danger-text">
        Delete
      </button>
    </form>
  );
}
