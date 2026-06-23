jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn(),
}));

const mockSignInWithIdToken = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args: any[]) => mockSignInWithIdToken(...args),
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
      signInWithOAuth: (...args: any[]) => mockSignInWithOAuth(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AuthService } from '../../app/services/authService';

const apple = AppleAuthentication as any;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  mockFrom.mockReturnValue({ update: mockUpdate });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockResolvedValue({ error: null });
});

describe('AuthService.signInWithEmail', () => {
  it('returns success on valid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    const result = await new AuthService().signInWithEmail('a@b.com', 'pw');
    expect(result).toEqual({ success: true });
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' });
  });

  it('returns failure with error message on bad credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid credentials' } });
    const result = await new AuthService().signInWithEmail('a@b.com', 'wrong');
    expect(result).toEqual({ success: false, error: 'Invalid credentials' });
  });
});

describe('AuthService.signUpWithEmail', () => {
  it('passes userData through as options.data', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    const result = await new AuthService().signUpWithEmail('a@b.com', 'pw', { full_name: 'Alice' });
    expect(result).toEqual({ success: true });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pw',
      options: { data: { full_name: 'Alice' } },
    });
  });

  it('returns failure when supabase signUp errors', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'Email already registered' } });
    const result = await new AuthService().signUpWithEmail('a@b.com', 'pw');
    expect(result).toEqual({ success: false, error: 'Email already registered' });
  });
});

describe('AuthService.signInWithApple', () => {
  it('returns unavailable on non-iOS', async () => {
    Platform.OS = 'android';
    const result = await new AuthService().signInWithApple();
    expect(result).toEqual({ success: false, error: 'unavailable' });
    expect(apple.signInAsync).not.toHaveBeenCalled();
  });

  it('exchanges identityToken for a Supabase session', async () => {
    apple.signInAsync.mockResolvedValue({
      identityToken: 'jwt-token',
      fullName: null,
    });
    mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const result = await new AuthService().signInWithApple();

    expect(result).toEqual({ success: true });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'jwt-token' });
  });

  it('persists Apple-provided full name on first sign-in', async () => {
    apple.signInAsync.mockResolvedValue({
      identityToken: 'jwt-token',
      fullName: { givenName: 'Jane', familyName: 'Doe' },
    });
    mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    await new AuthService().signInWithApple();

    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    expect(mockUpdate).toHaveBeenCalledWith({ full_name: 'Jane Doe' });
    expect(mockEq).toHaveBeenCalledWith('id', 'u1');
  });

  it('skips name persistence when Apple returns no name (subsequent sign-in)', async () => {
    apple.signInAsync.mockResolvedValue({
      identityToken: 'jwt-token',
      fullName: { givenName: null, familyName: null },
    });
    mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    await new AuthService().signInWithApple();

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('treats user cancellation as a non-error outcome', async () => {
    const cancelErr: any = new Error('User canceled');
    cancelErr.code = 'ERR_REQUEST_CANCELED';
    apple.signInAsync.mockRejectedValue(cancelErr);

    const result = await new AuthService().signInWithApple();
    expect(result).toEqual({ success: false, error: 'cancelled' });
  });

  it('returns missing_identity_token when Apple omits the token', async () => {
    apple.signInAsync.mockResolvedValue({ identityToken: null });
    const result = await new AuthService().signInWithApple();
    expect(result).toEqual({ success: false, error: 'missing_identity_token' });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('AuthService.signInWithGoogle', () => {
  it('redirects to the deep-link callback on iOS', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    const result = await new AuthService().signInWithGoogle();
    expect(result).toEqual({ success: true });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'integra://auth/callback', skipBrowserRedirect: false },
    });
  });

  it('returns failure on OAuth error', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: { message: 'oauth_denied' } });
    const result = await new AuthService().signInWithGoogle();
    expect(result).toEqual({ success: false, error: 'oauth_denied' });
  });
});

describe('AuthService.isAppleSignInAvailable', () => {
  it('returns false on non-iOS without querying the native module', async () => {
    Platform.OS = 'android';
    const result = await new AuthService().isAppleSignInAvailable();
    expect(result).toBe(false);
    expect(apple.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('delegates to AppleAuthentication.isAvailableAsync on iOS', async () => {
    apple.isAvailableAsync.mockResolvedValue(true);
    const result = await new AuthService().isAppleSignInAvailable();
    expect(result).toBe(true);
  });

  it('returns false when the native call throws', async () => {
    apple.isAvailableAsync.mockRejectedValue(new Error('boom'));
    const result = await new AuthService().isAppleSignInAvailable();
    expect(result).toBe(false);
  });
});
