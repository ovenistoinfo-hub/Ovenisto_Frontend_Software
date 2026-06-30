/**
 * Employee Service - API calls for employee/HR profile management
 */
import { api } from './api';

export interface EmployeeRecord {
  id: string;
  userId: string | null;
  outletId: string | null;
  supervisorId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string;
  photoUrl: string | null;
  division: string | null;
  designation: string;
  dutyType: string | null;
  hireDate: string;
  rateType: 'Hourly' | 'Daily' | 'Monthly' | 'PerShift';
  rate: number;
  payFrequency: string | null;
  penaltyFee: number | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  cnic: string | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  status: string;
  createdAt: string;
  supervisor: { id: string; firstName: string; lastName: string | null } | null;
  user: { id: string; name: string; email: string } | null;
}

export interface SupervisorOption {
  id: string;
  firstName: string;
  lastName: string | null;
}

export interface EmployeeInput {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone: string;
  photoUrl?: string | null;
  userId?: string | null;
  supervisorId?: string | null;
  division?: string | null;
  designation: string;
  dutyType?: string | null;
  hireDate: string;
  rateType: 'Hourly' | 'Daily' | 'Monthly' | 'PerShift';
  rate: number;
  payFrequency?: string | null;
  penaltyFee?: number | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  cnic?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactPhone?: string | null;
  status?: string;
}

interface ListResponse {
  success: boolean;
  data: EmployeeRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const employeeService = {
  async getAll(params?: { page?: number; limit?: number; search?: string; status?: string }): Promise<{ data: EmployeeRecord[]; meta: ListResponse['meta'] }> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    const res = await api.get<ListResponse>(`/employees${qs ? `?${qs}` : ''}`);
    return { data: res.data, meta: res.meta };
  },

  async getById(id: string): Promise<EmployeeRecord> {
    const res = await api.get<{ success: boolean; data: EmployeeRecord }>(`/employees/${id}`);
    return res.data;
  },

  async getMe(): Promise<EmployeeRecord | null> {
    const res = await api.get<{ success: boolean; data: EmployeeRecord | null }>('/employees/me');
    return res.data;
  },

  async getSupervisorOptions(excludeId?: string): Promise<SupervisorOption[]> {
    const qs = excludeId ? `?excludeId=${excludeId}` : '';
    const res = await api.get<{ success: boolean; data: SupervisorOption[] }>(`/employees/supervisors${qs}`);
    return res.data;
  },

  async create(data: EmployeeInput): Promise<EmployeeRecord> {
    const res = await api.post<{ success: boolean; data: EmployeeRecord }>('/employees', data);
    return res.data;
  },

  async update(id: string, data: Partial<EmployeeInput>): Promise<EmployeeRecord> {
    const res = await api.put<{ success: boolean; data: EmployeeRecord }>(`/employees/${id}`, data);
    return res.data;
  },

  async deactivate(id: string): Promise<void> {
    await api.delete(`/employees/${id}`);
  },
};
