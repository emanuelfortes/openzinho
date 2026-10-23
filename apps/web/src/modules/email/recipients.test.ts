import { describe, expect, it } from 'vitest';
import { pickRecipients } from './recipients';

const accounts = [
  { id: 'a', email: 'Ana@Clinica.test', role: 'user', banned: false },
  { id: 'b', email: 'bruno@clinica.test', role: 'user', banned: true },
  { id: 'adm', email: 'equipe@nexo.test', role: 'admin', banned: false },
  { id: 'c', email: 'carla@padaria.test', role: 'user', banned: false },
];

describe('pickRecipients', () => {
  it('sends to the active client accounts linked to the business', () => {
    expect(pickRecipients(['a', 'b', 'adm'], accounts, ['global@nexo.test'])).toEqual(['ana@clinica.test']);
  });

  it('never mixes in another business’s client', () => {
    expect(pickRecipients(['a'], accounts, [])).not.toContain('carla@padaria.test');
  });

  it('falls back to the global list when the business has no client', () => {
    expect(pickRecipients([], accounts, ['global@nexo.test'])).toEqual(['global@nexo.test']);
    expect(pickRecipients(['b', 'adm'], accounts, ['global@nexo.test'])).toEqual(['global@nexo.test']);
  });
});
