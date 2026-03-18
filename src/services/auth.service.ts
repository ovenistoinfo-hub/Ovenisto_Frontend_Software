/**
 * Auth Service - API calls for authentication
 */

import { api, setTokens, clearTokens, type ApiError } from './api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  branch?: string | null;
  avatar?: string | null;
  outletId?: string | null;
  outlet?: { id: string; name: string; code: string } | null;
}

interface LoginResponse {
  success: boolean;
  data: {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  };
  message: string;
}

interface MeResponse {
  success: boolean;
  data: AuthUser & {
    status: string;
    lastLogin: string | null;
    createdAt: string;
  };
}

interface ApiSuccessResponse<T = null> {
  success: boolean;
  data: T;
  message?: string;
}

export const authService = {
  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthUser> {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    setTokens(res.data.accessToken, res.data.refreshToken);
    return res.data.user;
  },

  /**
   * Logout (clears tokens)
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Always clear tokens even if API call fails
    }
    clearTokens();
  },

  /**
   * Get current authenticated user
   */
  async getMe(): Promise<AuthUser> {
    const res = await api.get<MeResponse>('/auth/me');
    return res.data;
  },

  /**
   * Update own profile
   */
  async updateProfile(data: { name?: string; phone?: string | null; avatar?: string | null }): Promise<AuthUser> {
    const res = await api.put<ApiSuccessResponse<AuthUser>>('/auth/me', data);
    return res.data;
  },

  /**
   * Change own password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put('/auth/change-password', { currentPassword, newPassword });
  },
};
