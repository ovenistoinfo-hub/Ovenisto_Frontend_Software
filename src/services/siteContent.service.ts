import { api, getAccessToken } from './api';

/** A dish the website lists under "Coming soon"; customers vote for it. Chain-wide. */
export interface ComingSoonDish {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
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
  /** Direct image upload (Cloudinary through the backend); returns the https URL. */
  async uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);
    const token = getAccessToken();
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/upload/image`, {
      method: 'POST',
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.data.url;
  },
  async createComingSoon(data: { name: string; description?: string; image?: string }): Promise<ComingSoonDish> {
    const res = await api.post<{ success: boolean; data: ComingSoonDish }>('/site-content/coming-soon', data);
    return res.data;
  },
  async updateComingSoon(id: string, data: Partial<{ name: string; description: string | null; image: string | null; isActive: boolean }>): Promise<ComingSoonDish> {
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

/** An "Inside our kitchen" post on the website. Chain-wide. */
export interface KitchenPost {
  id: string;
  title: string;
  body: string | null;
  images: string[];
  /** The YouTube / Instagram link staff pasted. */
  videoUrl: string | null;
  /** What the website embeds; null when there is no (valid) link. */
  videoEmbedUrl: string | null;
  isPublished: boolean;
  createdAt: string;
}

export type KitchenPostInput = Pick<KitchenPost, 'title' | 'body' | 'images' | 'videoUrl' | 'isPublished'>;

export const kitchenPostService = {
  async list(): Promise<KitchenPost[]> {
    const res = await api.get<{ success: boolean; data: KitchenPost[] }>('/site-content/kitchen-posts');
    return res.data;
  },
  async create(data: KitchenPostInput): Promise<KitchenPost> {
    const res = await api.post<{ success: boolean; data: KitchenPost }>('/site-content/kitchen-posts', data);
    return res.data;
  },
  async update(id: string, data: Partial<KitchenPostInput>): Promise<KitchenPost> {
    const res = await api.put<{ success: boolean; data: KitchenPost }>(`/site-content/kitchen-posts/${id}`, data);
    return res.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/site-content/kitchen-posts/${id}`);
  },
};
