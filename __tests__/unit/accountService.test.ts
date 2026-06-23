/**
 * Unit tests for app/services/accountService.ts.
 *
 * The service is a thin wrapper over the supabase client. We mock the
 * client at the module level and assert that each public function:
 *   - calls the right endpoint with the right method
 *   - returns { ok: true, data } on success
 *   - returns { ok: false, error } on failure
 *
 * The Edge Functions themselves are tested in supabase/functions tests.
 */

const invokeMock = jest.fn();
const fromMock = jest.fn();
const getUserMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    from: fromMock,
    auth: { getUser: getUserMock },
  },
}));

import {
  requestAccountDeletion,
  restoreAccount,
  getPendingDeletion,
} from '@/services/accountService';

afterEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
  getUserMock.mockReset();
});

describe('requestAccountDeletion', () => {
  it('returns { ok: true, data } on success', async () => {
    const payload = {
      requested_at: '2026-05-29T12:00:00Z',
      expires_at: '2026-06-28T12:00:00Z',
    };
    invokeMock.mockResolvedValueOnce({ data: payload, error: null });

    const result = await requestAccountDeletion();

    expect(invokeMock).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(result).toEqual({ ok: true, data: payload });
  });

  it('returns { ok: false, error } when the function errors', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'network_down' },
    });

    const result = await requestAccountDeletion();

    expect(result).toEqual({ ok: false, error: 'network_down' });
  });

  it('returns { ok: false, error: empty_response } when the function returns no body', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await requestAccountDeletion();

    expect(result).toEqual({ ok: false, error: 'empty_response' });
  });
});

describe('restoreAccount', () => {
  it('returns { ok: true } on success', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { restored: true },
      error: null,
    });

    const result = await restoreAccount();

    expect(invokeMock).toHaveBeenCalledWith('restore-account', { method: 'POST' });
    expect(result).toEqual({ ok: true, data: { restored: true } });
  });

  it('returns { ok: false, error } when the function errors', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'forbidden' },
    });

    const result = await restoreAccount();

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('getPendingDeletion', () => {
  function setupQueryMock(payload: unknown, error: unknown = null) {
    const single = jest.fn().mockResolvedValue({ data: payload, error });
    const eq = jest.fn().mockReturnValue({ maybeSingle: single });
    const select = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });
    return { single, eq, select };
  }

  it('returns the request when one exists', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const row = {
      requested_at: '2026-05-29T12:00:00Z',
      expires_at: '2026-06-28T12:00:00Z',
    };
    const { select, eq } = setupQueryMock(row);

    const result = await getPendingDeletion();

    expect(fromMock).toHaveBeenCalledWith('account_deletion_requests');
    expect(select).toHaveBeenCalledWith('requested_at, expires_at');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual({ ok: true, data: row });
  });

  it('returns null when no request exists', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    setupQueryMock(null);

    const result = await getPendingDeletion();

    expect(result).toEqual({ ok: true, data: null });
  });

  it('returns error when user is not authenticated', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'no_session' },
    });

    const result = await getPendingDeletion();

    expect(result).toEqual({ ok: false, error: 'no_session' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns error when the query fails', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    setupQueryMock(null, { message: 'db_down' });

    const result = await getPendingDeletion();

    expect(result).toEqual({ ok: false, error: 'db_down' });
  });
});
