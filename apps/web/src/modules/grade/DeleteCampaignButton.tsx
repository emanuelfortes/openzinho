'use client';

import { deleteCampaignAction } from '@/app/dashboard/campaigns/actions';

export default function DeleteCampaignButton({ id }: { id: string }) {
  return (
    <form
      action={deleteCampaignAction}
      onSubmit={(event) => {
        if (!window.confirm('Excluir esta campanha? Os agendamentos param. As execuções já feitas continuam disponíveis como monitores Geo-Grid.')) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="nexo-label transition-colors hover:text-nexo-danger-text">
        Excluir
      </button>
    </form>
  );
}
