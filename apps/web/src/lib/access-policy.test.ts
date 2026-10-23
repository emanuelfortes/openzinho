import { describe, expect, it } from 'vitest';
import { canAccess, clientCanAccess, platformRole } from './access-policy';

describe('platformRole', () => {
  it('reads the admin plugin role string', () => {
    expect(platformRole('admin')).toBe('admin');
    expect(platformRole('user,admin')).toBe('admin');
    expect(platformRole('user')).toBe('cliente');
    expect(platformRole(null)).toBe('cliente');
    expect(platformRole('administrator')).toBe('cliente');
  });
});

describe('clientCanAccess', () => {
  it('opens the business owner pages', () => {
    for (const path of ['/dashboard', '/dashboard/geo-grid', '/dashboard/campaigns/abc/relatorio', '/dashboard/google-reviews', '/dashboard/conta']) {
      expect(clientCanAccess(path), path).toBe(true);
    }
  });

  it('keeps admin areas and advanced tools closed', () => {
    for (const path of ['/dashboard/settings', '/dashboard/projects', '/dashboard/usuarios', '/dashboard/spending', '/dashboard/backlinks', '/dashboard/geo-gridx', '/api/balance', '/api/prompt-tracker/export']) {
      expect(clientCanAccess(path), path).toBe(false);
    }
  });

  it('allows the APIs the client pages call', () => {
    expect(clientCanAccess('/api/grid-check/123')).toBe(true);
    expect(clientCanAccess('/api/grid-tasks')).toBe(true);
  });

  it('lets admins open everything', () => {
    expect(canAccess('admin', '/dashboard/settings')).toBe(true);
    expect(canAccess('cliente', '/dashboard/settings')).toBe(false);
  });
});
