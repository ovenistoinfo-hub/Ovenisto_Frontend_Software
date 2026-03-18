/**
 * User Service - API calls for user management (Admin only)
 */

import { api } from './api';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  branch: string | null;
  outletId: string | null;
  avatar: string | null;
  status: string;
  lastLogin: string | null;
  createdAt: string;
  outlet: { id: string; name: string; code: string } | null;
}

interface UsersListResponse {
  success: boolean;
  data: UserRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface UserResponse {
  success: boolean;
  data: UserRecord;
  message?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  role: string;
  branch?: string | null;
  outletId?: string | null;
  avatar?: string | null;
  status?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  phone?: string | null;
  role?: string;
  branch?: string | null;
  outletId?: string | null;
  avatar?: string | null;
  status?: string;
}

export interface UserQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  outletId?: string;
}

export const userService = {
  /**
   * List all users with optional filters
   */
  async getUsers(params?: UserQueryParams): Promise<{ data: UserRecord[]; meta: UsersListResponse['meta'] }> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    if (params?.status) query.set('status', params.status);
    if (params?.outletId) query.set('outletId', params.outletId);

    const qs = query.toString();
    const res = await api.get<UsersListResponse>(`/users${qs ? `?${qs}` : ''}`);
    return { data: res.data, meta: res.meta };
  },

  /**
   * Get a single user by ID
   */
  async getUser(id: string): Promise<UserRecord> {
    const res = await api.get<UserResponse>(`/users/${id}`);
    return res.data;
  },

  /**
   * Create a new user
   */
  async createUser(data: CreateUserInput): Promise<UserRecord> {
    const res = await api.post<UserResponse>('/users', data);
    return res.data;
  },

  /**
   * Update an existing user
   */
  async updateUser(id: string, data: UpdateUserInput): Promise<UserRecord> {
    const res = await api.put<UserResponse>(`/users/${id}`, data);
    return res.data;
  },

  /**
   * Deactivate a user (soft delete)
   */
  async deleteUser(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },
};
