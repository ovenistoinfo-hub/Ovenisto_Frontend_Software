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
  employeeId?: string | null;
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

export interface UnlinkedEmployee {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string;
  designation: string;
  outletId: string | null;
  outlet: { id: string; name: string } | null;
}

export interface StaffPickerRecord {
  id: string;
  name: string;
  role: string;
}

export const userService = {
  /**
   * Minimal user list (id/name/role) accessible to any POS-facing role — used to
   * populate the cancellation-request approver/responsible-person dropdowns, unlike
   * getUsers() below which is Manager+ only.
   */
  async getStaffPicker(roles?: string[], outletId?: string | null): Promise<StaffPickerRecord[]> {
    const q = new URLSearchParams();
    if (roles?.length) q.set('roles', roles.join(','));
    if (outletId) q.set('outletId', outletId);
    const qs = q.toString();
    const res = await api.get<{ success: boolean; data: StaffPickerRecord[] }>(`/users/staff-picker${qs ? `?${qs}` : ''}`);
    return res.data;
  },

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
   * Fetch employees with no linked user account
   */
  async getUnlinkedEmployees(): Promise<UnlinkedEmployee[]> {
    const res = await api.get<{ success: boolean; data: UnlinkedEmployee[] }>('/users/unlinked-employees');
    return res.data;
  },

  /**
   * Get the currently authenticated user's own profile (any role)
   */
  async getMe(): Promise<UserRecord> {
    const res = await api.get<UserResponse>('/auth/me');
    return res.data;
  },

  /**
   * Get a single user by ID (Admin+ only)
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
