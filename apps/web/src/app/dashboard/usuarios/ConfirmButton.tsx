'use client';

/** Delete button that asks before submitting. */
export default function ConfirmButton({ action, userId, message }: { action: (formData: FormData) => Promise<void>; userId: string; message: string }) {
  return (
    <form action={action} onSubmit={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" className="nexo-label hover:text-nexo-danger-text">Excluir</button>
    </form>
  );
}
