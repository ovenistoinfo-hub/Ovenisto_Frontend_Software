import { api } from './api';

/** A dish the website lists under "Coming soon"; customers vote for it. Chain-wide. */
export interface ComingSoonDish {
  id: string;
  name: string;
  description: string | null;
  votes: number;
  isActive: boolean;
  createdAt: string;
}

/** A customer's answer to "which dish should we start next?" on the website. */
export interface DishSuggestion {
  id: string;
  text: string;
  outletId: string | null;
  createdAt: string;
}

export type EventInquiryStatus = 'new' | 'contacted' | 'closed';

/** An events / catering request sent from the website's Events page. */
export interface EventInquiry {
  id: string;
  outletId: string;
  outletName: string | null;
  eventType: string;
  /** "YYYY-MM-DD" */
  eventDate: string;
  guests: number;
  venue: 'at_ovenisto' | 'your_venue';
  name: string;
  phone: string;
  notes: string | null;
  status: EventInquiryStatus;
  createdAt: string;
}

export const siteContentService = {
  async listComingSoon(): Promise<ComingSoonDish[]> {
    const res = await api.get<{ success: boolean; data: ComingSoonDish[] }>('/site-content/coming-soon');
    return res.data;
  },
  async createComingSoon(data: { name: string; description?: string }): Promise<ComingSoonDish> {
    const res = await api.post<{ success: boolean; data: ComingSoonDish }>('/site-content/coming-soon', data);
    return res.data;
  },
  async updateComingSoon(id: string, data: Partial<{ name: string; description: string | null; isActive: boolean }>): Promise<ComingSoonDish> {
    const res = await api.put<{ success: boolean; data: ComingSoonDish }>(`/site-content/coming-soon/${id}`, data);
    return res.data;
  },
  async deleteComingSoon(id: string): Promise<void> {
    await api.delete(`/site-content/coming-soon/${id}`);
  },
  async listSuggestions(): Promise<DishSuggestion[]> {
    const res = await api.get<{ success: boolean; data: DishSuggestion[] }>('/site-content/suggestions');
    return res.data;
  },
  async deleteSuggestion(id: string): Promise<void> {
    await api.delete(`/site-content/suggestions/${id}`);
  },
  async listEventInquiries(): Promise<EventInquiry[]> {
    const res = await api.get<{ success: boolean; data: EventInquiry[] }>('/site-content/event-inquiries');
    return res.data;
  },
  async updateEventInquiry(id: string, status: EventInquiryStatus): Promise<EventInquiry> {
    const res = await api.patch<{ success: boolean; data: EventInquiry }>(`/site-content/event-inquiries/${id}`, { status });
    return res.data;
  },
};
