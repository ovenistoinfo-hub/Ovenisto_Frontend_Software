import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { Order, OrderStatus } from "@/data/mock-data";

const STORAGE_KEY = "ovenisto_data";
const STORAGE_VERSION = "v2"; // bump this to force-clear old mock data

// ── Existing interfaces ──

interface Settings {
  restaurantName: string;
  currency: string;
  taxRate: number;
  phone: string;
  email: string;
  address: string;
  receiptHeader: string;
  taxName: string;
  tableManagement: boolean;
  onlineOrders: boolean;
  reservations: boolean;
  selfOrder: { enabled: boolean; showImages: boolean; showDescriptions: boolean; payAtCounter: boolean };
  website: { enabled: boolean; deliveryRadius: string; minOrder: string; deliveryCharges: string; prepTime: string; autoAccept: boolean };
  reservation: { enabled: boolean; slotDuration: string; maxAdvanceDays: string; autoConfirm: boolean };
}

const defaultSettings: Settings = {
  restaurantName: "Ovenisto", currency: "Rs.", taxRate: 16,
  phone: "03201119898", email: "admin@ovenisto.com",
  address: "164-J LDA AVENUE-1 Lahore",
  receiptHeader: "Thank you for dining at Ovenisto!",
  taxName: "GST", tableManagement: true, onlineOrders: true, reservations: false,
  selfOrder: { enabled: false, showImages: true, showDescriptions: true, payAtCounter: true },
  website: { enabled: true, deliveryRadius: "10", minOrder: "500", deliveryCharges: "150", prepTime: "30", autoAccept: false },
  reservation: { enabled: false, slotDuration: "60", maxAdvanceDays: "14", autoConfirm: true },
};

// ── New interfaces ──

export interface DealOptionGroup {
  id: string;
  label: string;
  allowedItems: string[];
  maxSelections: number;
}

export interface Deal {
  id: string;
  name: string;
  description: string;
  type: "percentage" | "combo" | "buyXgetY" | "timeBased" | "optionCombo";
  discountPercent?: number;
  applicableItems?: string[];
  applicableCategories?: string[];
  comboItems?: { itemId: string; qty: number }[];
  comboPrice?: number;
  buyQty?: number;
  getQty?: number;
  buyItemId?: string;
  getItemId?: string;
  startTime?: string;
  endTime?: string;
  timeDiscountPercent?: number;
  optionGroups?: DealOptionGroup[];
  dealPrice?: number;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  createdAt: string;
}

export interface DeliveryRider {
  id: string;
  name: string;
  phone: string;
  isAvailable: boolean;
  activeDeliveries: number;
}

export interface DeliveryAssignment {
  id: string;
  orderId: string;
  riderId: string;
  riderName: string;
  status: "pending" | "dispatched" | "delivered" | "returned";
  assignedAt: string;
  deliveredAt?: string;
  estimatedTime: number;
  customerAddress: string;
  customerPhone: string;
  notes?: string;
}

export interface LoyaltySettings {
  pointsPerAmount: number;
  amountPerPoint: number;
  signupBonus: number;
  birthdayBonus: number;
  tiers: { name: string; minPoints: number; multiplier: number }[];
}

export interface LoyaltyMember {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  totalPoints: number;
  availablePoints: number;
  tier: string;
  joinedDate: string;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  pointsRequired: number;
  type: "freeItem" | "percentDiscount" | "fixedDiscount";
  value: string;
  isActive: boolean;
}

export interface LoyaltyTransaction {
  id: string;
  memberId: string;
  type: "earn" | "redeem";
  points: number;
  description: string;
  orderId?: string;
  date: string;
}

export interface StockTakeItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  systemQty: number;
  countedQty: number | null;
  variance: number;
  varianceValue: number;
}

export interface StockTake {
  id: string;
  reference: string;
  date: string;
  status: "active" | "completed";
  countedBy: string;
  items: StockTakeItem[];
  totalVarianceValue: number;
  notes?: string;
  completedAt?: string;
}

export interface Shift {
  id: string;
  shiftNumber: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  closingCash?: number;
  status: "open" | "closed";
  totalSales: number;
  totalCashSales: number;
  totalCardSales: number;
  totalOnlineSales: number;
  orderCount: number;
  cancelledOrders: number;
  totalExpenses: number;
  expectedCash: number;
  cashDifference?: number;
  notes?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderAmount: number;
  maxDiscount?: number;
  usageLimit: number;
  usedCount: number;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  applicableTo: "all" | "dineIn" | "delivery" | "takeAway" | "online";
  createdAt: string;
}

export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  guestCount: number;
  tableNumber?: string;
  status: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "noShow";
  specialRequests?: string;
  createdAt: string;
  source: "phone" | "walkin" | "online";
}

export interface RestaurantTable {
  id: string;
  number: string;
  capacity: number;
  floor: string;
  shape: "square" | "round" | "rectangle";
  status: "available" | "occupied" | "reserved" | "maintenance";
  currentOrderId?: string;
  reservationId?: string;
}

// ── Shift Scheduling & Leave Management ──

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
}

export interface StaffScheduleEntry {
  day: number; // 0=Mon, 6=Sun
  templateId: string;
  templateName: string;
  startTime: string;
  endTime: string;
}

export interface StaffSchedule {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  weekStart: string; // ISO date of Monday
  shifts: StaffScheduleEntry[];
  status: "draft" | "published";
  createdBy: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  leaveType: "sick" | "casual" | "annual" | "emergency";
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  appliedOn: string;
  reviewedBy?: string;
  reviewedOn?: string;
  reviewNote?: string;
}

export interface LeaveBalance {
  employeeId: string;
  employeeName: string;
  annual: { total: number; used: number };
  sick: { total: number; used: number };
  casual: { total: number; used: number };
}

// ── Mock data for new collections ──

const mockDeals: Deal[] = [
  { id: "deal-1", name: "Weekend Pizza Blast", description: "20% off all pizzas this month", type: "percentage", discountPercent: 20, applicableCategories: ["Pizza"], validFrom: "2026-03-01", validTo: "2026-03-31", isActive: true, createdAt: "2026-03-01" },
  { id: "deal-2", name: "Family Combo", description: "1 Pizza + 2 Fries + 2 Drinks at Rs. 999", type: "combo", comboItems: [{ itemId: "1", qty: 1 }, { itemId: "12", qty: 2 }, { itemId: "14", qty: 2 }], comboPrice: 999, validFrom: "2026-01-01", validTo: "always", isActive: true, createdAt: "2026-01-01" },
  { id: "deal-3", name: "Happy Hour", description: "15% off all items 2PM-5PM", type: "timeBased", startTime: "14:00", endTime: "17:00", timeDiscountPercent: 15, validFrom: "2026-01-01", validTo: "always", isActive: true, createdAt: "2026-01-01" },
  { id: "deal-4", name: "Deal 4 — Two Pizzas + Drink", description: "Choose any 2 Small Pizzas + 1 Drink at Rs. 999", type: "optionCombo", dealPrice: 999, optionGroups: [
    { id: "g1", label: "Choose 1st Pizza Flavor", allowedItems: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"], maxSelections: 1 },
    { id: "g2", label: "Choose 2nd Pizza Flavor", allowedItems: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"], maxSelections: 1 },
    { id: "g3", label: "Choose Drink", allowedItems: ["17", "18", "19", "20"], maxSelections: 1 },
  ], validFrom: "2026-01-01", validTo: "always", isActive: true, createdAt: "2026-03-10" },
  { id: "deal-5", name: "Burger Meal Deal", description: "Any Burger + Fries + Drink at Rs. 699", type: "optionCombo", dealPrice: 699, optionGroups: [
    { id: "g1", label: "Choose Burger", allowedItems: ["13", "14"], maxSelections: 1 },
    { id: "g2", label: "Choose Fries", allowedItems: ["1", "15", "16"], maxSelections: 1 },
    { id: "g3", label: "Choose Drink", allowedItems: ["17", "18", "19", "20"], maxSelections: 1 },
  ], validFrom: "2026-01-01", validTo: "always", isActive: true, createdAt: "2026-03-10" },
];

const mockRiders: DeliveryRider[] = [
  { id: "rider-1", name: "Ali Khan", phone: "0321-1234567", isAvailable: true, activeDeliveries: 1 },
  { id: "rider-2", name: "Bilal Ahmed", phone: "0333-7654321", isAvailable: true, activeDeliveries: 0 },
];

const mockDeliveryAssignments: DeliveryAssignment[] = [];

const mockLoyaltySettings: LoyaltySettings = {
  pointsPerAmount: 1, amountPerPoint: 100, signupBonus: 100, birthdayBonus: 50,
  tiers: [
    { name: "Bronze", minPoints: 0, multiplier: 1 },
    { name: "Silver", minPoints: 500, multiplier: 1.5 },
    { name: "Gold", minPoints: 2000, multiplier: 2 },
    { name: "Platinum", minPoints: 5000, multiplier: 3 },
  ],
};

const mockLoyaltyMembers: LoyaltyMember[] = [
  { id: "lm-1", customerId: "cust-1", customerName: "Ahmad Khan", phone: "0300-1234567", totalPoints: 1200, availablePoints: 800, tier: "Silver", joinedDate: "2025-06-15" },
  { id: "lm-2", customerId: "cust-2", customerName: "Sara Ali", phone: "0333-9876543", totalPoints: 3500, availablePoints: 2100, tier: "Gold", joinedDate: "2025-03-20" },
];

const mockLoyaltyRewards: LoyaltyReward[] = [
  { id: "lr-1", name: "Free Margherita Pizza", pointsRequired: 500, type: "freeItem", value: "Margherita", isActive: true },
  { id: "lr-2", name: "10% Off Next Order", pointsRequired: 200, type: "percentDiscount", value: "10", isActive: true },
  { id: "lr-3", name: "Free Drink", pointsRequired: 100, type: "freeItem", value: "Soft Drink", isActive: true },
];

const mockLoyaltyTransactions: LoyaltyTransaction[] = [
  { id: "lt-1", memberId: "lm-1", type: "earn", points: 150, description: "Order #ORD-012", orderId: "ord-12", date: "2026-03-08" },
  { id: "lt-2", memberId: "lm-2", type: "redeem", points: 500, description: "Redeemed: Free Pizza", date: "2026-03-07" },
];

const mockStockTakes: StockTake[] = [
  {
    id: "st-1", reference: "ST-001", date: "2026-03-01", status: "completed", countedBy: "Admin",
    items: [
      { ingredientId: "1", ingredientName: "Flour", unit: "kg", systemQty: 50, countedQty: 48.5, variance: -1.5, varianceValue: -225 },
      { ingredientId: "2", ingredientName: "Mozzarella Cheese", unit: "kg", systemQty: 25, countedQty: 25, variance: 0, varianceValue: 0 },
    ],
    totalVarianceValue: -800, completedAt: "2026-03-01",
  },
];

const mockShifts: Shift[] = [
  {
    id: "sh-1", shiftNumber: "SH-011", cashierId: "user-1", cashierName: "Admin User",
    openedAt: "2026-03-08T09:00:00", closedAt: "2026-03-08T17:30:00",
    openingCash: 5000, closingCash: 17200, status: "closed",
    totalSales: 45000, totalCashSales: 12500, totalCardSales: 8200, totalOnlineSales: 1300,
    orderCount: 35, cancelledOrders: 2, totalExpenses: 1500,
    expectedCash: 16000, cashDifference: 1200, notes: "",
  },
];

const mockCoupons: Coupon[] = [
  { id: "coup-1", code: "PIZZA20", type: "percentage", value: 20, minOrderAmount: 500, maxDiscount: 300, usageLimit: 100, usedCount: 15, validFrom: "2026-03-01", validTo: "2026-03-31", isActive: true, applicableTo: "all", createdAt: "2026-03-01" },
  { id: "coup-2", code: "FLAT500", type: "fixed", value: 500, minOrderAmount: 2000, usageLimit: 50, usedCount: 8, validFrom: "2026-03-01", validTo: "2026-04-15", isActive: true, applicableTo: "all", createdAt: "2026-03-01" },
  { id: "coup-3", code: "WELCOME", type: "percentage", value: 10, minOrderAmount: 0, maxDiscount: 200, usageLimit: 0, usedCount: 3, validFrom: "2026-01-01", validTo: "never", isActive: true, applicableTo: "all", createdAt: "2026-01-01" },
];

const mockReservations: Reservation[] = [
  { id: "res-1", customerName: "Ahmad Khan", customerPhone: "0300-1234567", date: "2026-03-09", time: "19:00", guestCount: 4, tableNumber: "T-3", status: "confirmed", createdAt: "2026-03-08", source: "phone" },
  { id: "res-2", customerName: "Sara Ali", customerPhone: "0333-9876543", date: "2026-03-09", time: "19:30", guestCount: 2, tableNumber: "T-1", status: "pending", createdAt: "2026-03-09", source: "online" },
  { id: "res-3", customerName: "Usman Tariq", customerPhone: "0321-5556789", date: "2026-03-09", time: "20:30", guestCount: 3, status: "pending", specialRequests: "Birthday celebration, need cake", createdAt: "2026-03-09", source: "phone" },
  { id: "res-4", customerName: "Fatima Zahra", customerPhone: "0345-1112233", date: "2026-03-10", time: "20:00", guestCount: 6, tableNumber: "T-5", status: "confirmed", createdAt: "2026-03-08", source: "walkin" },
];

const mockShiftTemplates: ShiftTemplate[] = [
  { id: "st-morning", name: "Morning", startTime: "08:00", endTime: "16:00", color: "bg-info/10 text-info border-info/30" },
  { id: "st-evening", name: "Evening", startTime: "16:00", endTime: "00:00", color: "bg-accent/10 text-accent border-accent/30" },
  { id: "st-night", name: "Night", startTime: "00:00", endTime: "08:00", color: "bg-gold/10 text-gold border-gold/30" },
  { id: "st-split", name: "Split", startTime: "10:00", endTime: "14:00 & 18:00-22:00", color: "bg-warning/10 text-warning border-warning/30" },
  { id: "st-off", name: "Day Off", startTime: "", endTime: "", color: "bg-muted text-muted-foreground" },
];

const mockStaffSchedules: StaffSchedule[] = [
  {
    id: "sched-1", employeeId: "1", employeeName: "Admin User", employeeRole: "Super Admin", weekStart: "2026-03-09",
    shifts: [
      { day: 0, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 1, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 2, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 3, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 4, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 5, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
      { day: 6, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
    ], status: "published", createdBy: "Admin", createdAt: "2026-03-07",
  },
  {
    id: "sched-2", employeeId: "2", employeeName: "Ali Hassan", employeeRole: "Manager", weekStart: "2026-03-09",
    shifts: [
      { day: 0, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 1, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 2, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
      { day: 3, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
      { day: 4, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
      { day: 5, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 6, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
    ], status: "published", createdBy: "Admin", createdAt: "2026-03-07",
  },
  {
    id: "sched-3", employeeId: "3", employeeName: "Ahmed Khan", employeeRole: "Cashier", weekStart: "2026-03-09",
    shifts: [
      { day: 0, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
      { day: 1, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
      { day: 2, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
      { day: 3, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
      { day: 4, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
      { day: 5, templateId: "st-evening", templateName: "Evening", startTime: "16:00", endTime: "00:00" },
      { day: 6, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
    ], status: "published", createdBy: "Admin", createdAt: "2026-03-07",
  },
  {
    id: "sched-4", employeeId: "4", employeeName: "Usman Raza", employeeRole: "Kitchen Staff", weekStart: "2026-03-09",
    shifts: [
      { day: 0, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 1, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 2, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 3, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
      { day: 4, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 5, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
      { day: 6, templateId: "st-morning", templateName: "Morning", startTime: "08:00", endTime: "16:00" },
    ], status: "published", createdBy: "Admin", createdAt: "2026-03-07",
  },
  {
    id: "sched-5", employeeId: "5", employeeName: "Bilal Sheikh", employeeRole: "Waiter", weekStart: "2026-03-09",
    shifts: [
      { day: 0, templateId: "st-split", templateName: "Split", startTime: "10:00", endTime: "14:00 & 18:00-22:00" },
      { day: 1, templateId: "st-split", templateName: "Split", startTime: "10:00", endTime: "14:00 & 18:00-22:00" },
      { day: 2, templateId: "st-split", templateName: "Split", startTime: "10:00", endTime: "14:00 & 18:00-22:00" },
      { day: 3, templateId: "st-split", templateName: "Split", startTime: "10:00", endTime: "14:00 & 18:00-22:00" },
      { day: 4, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
      { day: 5, templateId: "st-split", templateName: "Split", startTime: "10:00", endTime: "14:00 & 18:00-22:00" },
      { day: 6, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" },
    ], status: "published", createdBy: "Admin", createdAt: "2026-03-07",
  },
];

const mockLeaveRequests: LeaveRequest[] = [
  { id: "lr-1", employeeId: "3", employeeName: "Ahmed Khan", employeeRole: "Cashier", leaveType: "sick", startDate: "2026-03-18", endDate: "2026-03-19", totalDays: 2, reason: "Feeling unwell, doctor advised rest", status: "pending", appliedOn: "2026-03-14" },
  { id: "lr-2", employeeId: "5", employeeName: "Bilal Sheikh", employeeRole: "Waiter", leaveType: "casual", startDate: "2026-03-20", endDate: "2026-03-20", totalDays: 1, reason: "Family function", status: "pending", appliedOn: "2026-03-13" },
  { id: "lr-3", employeeId: "4", employeeName: "Usman Raza", employeeRole: "Kitchen Staff", leaveType: "annual", startDate: "2026-03-10", endDate: "2026-03-12", totalDays: 3, reason: "Going out of city for a wedding", status: "approved", appliedOn: "2026-03-05", reviewedBy: "Admin User", reviewedOn: "2026-03-06", reviewNote: "Approved. Arrange coverage." },
  { id: "lr-4", employeeId: "2", employeeName: "Ali Hassan", employeeRole: "Manager", leaveType: "emergency", startDate: "2026-03-08", endDate: "2026-03-08", totalDays: 1, reason: "Urgent family matter", status: "approved", appliedOn: "2026-03-08", reviewedBy: "Admin User", reviewedOn: "2026-03-08" },
  { id: "lr-5", employeeId: "3", employeeName: "Ahmed Khan", employeeRole: "Cashier", leaveType: "casual", startDate: "2026-02-20", endDate: "2026-02-21", totalDays: 2, reason: "Personal work", status: "rejected", appliedOn: "2026-02-18", reviewedBy: "Admin User", reviewedOn: "2026-02-18", reviewNote: "Short staff that week, please reschedule" },
];

const mockLeaveBalances: LeaveBalance[] = [
  { employeeId: "1", employeeName: "Admin User", annual: { total: 18, used: 2 }, sick: { total: 10, used: 1 }, casual: { total: 8, used: 0 } },
  { employeeId: "2", employeeName: "Ali Hassan", annual: { total: 14, used: 3 }, sick: { total: 8, used: 2 }, casual: { total: 6, used: 2 } },
  { employeeId: "3", employeeName: "Ahmed Khan", annual: { total: 14, used: 1 }, sick: { total: 8, used: 0 }, casual: { total: 6, used: 2 } },
  { employeeId: "4", employeeName: "Usman Raza", annual: { total: 14, used: 5 }, sick: { total: 8, used: 1 }, casual: { total: 6, used: 0 } },
  { employeeId: "5", employeeName: "Bilal Sheikh", annual: { total: 14, used: 1 }, sick: { total: 8, used: 0 }, casual: { total: 6, used: 1 } },
  { employeeId: "6", employeeName: "Faisal Iqbal", annual: { total: 14, used: 0 }, sick: { total: 8, used: 0 }, casual: { total: 6, used: 0 } },
  { employeeId: "7", employeeName: "Hassan Raza", annual: { total: 14, used: 2 }, sick: { total: 8, used: 1 }, casual: { total: 6, used: 0 } },
];

const mockTables: RestaurantTable[] = [
  { id: "tbl-1", number: "T-1", capacity: 4, floor: "Main Hall", shape: "square", status: "available" },
  { id: "tbl-2", number: "T-2", capacity: 2, floor: "Main Hall", shape: "round", status: "occupied", currentOrderId: "ord-1" },
  { id: "tbl-3", number: "T-3", capacity: 6, floor: "Main Hall", shape: "rectangle", status: "reserved", reservationId: "res-1" },
  { id: "tbl-4", number: "T-4", capacity: 4, floor: "Main Hall", shape: "square", status: "available" },
  { id: "tbl-5", number: "T-5", capacity: 2, floor: "Outdoor", shape: "round", status: "available" },
  { id: "tbl-6", number: "T-6", capacity: 4, floor: "Outdoor", shape: "square", status: "available" },
  { id: "tbl-7", number: "T-7", capacity: 8, floor: "VIP Room", shape: "rectangle", status: "available" },
];

// ── DataStore ──

interface DataStore {
  orders: Order[];
  customers: any[];
  suppliers: any[];
  purchases: any[];
  expenses: any[];
  ingredients: any[];
  foodMenuItems: any[];
  foodCategories: any[];
  foodRecipes: Record<string, { ingredientId: string; qtyPerUnit: number }[]>;
  modifiers: any[];
  ingredientCategories: any[];
  ingredientUnits: any[];
  preMadeFood: any[];
  users: any[];
  outlets: any[];
  attendance: any[];
  kitchens: any[];
  wasteRecords: any[];
  transfers: any[];
  stockAdjustments: any[];
  productions: any[];
  smsHistory: any[];
  settings: Settings;
  revenueChartData: any[];
  orderTypeData: any[];
  // New collections
  deals: Deal[];
  riders: DeliveryRider[];
  deliveryAssignments: DeliveryAssignment[];
  loyaltySettings: LoyaltySettings;
  loyaltyMembers: LoyaltyMember[];
  loyaltyRewards: LoyaltyReward[];
  loyaltyTransactions: LoyaltyTransaction[];
  stockTakes: StockTake[];
  shifts: Shift[];
  coupons: Coupon[];
  reservations: Reservation[];
  tables: RestaurantTable[];
  shiftTemplates: ShiftTemplate[];
  staffSchedules: StaffSchedule[];
  leaveRequests: LeaveRequest[];
  leaveBalances: LeaveBalance[];
}

function getDefaults(): DataStore {
  return {
    // All collections start empty — real data comes from the API phase by phase
    orders: [], customers: [], suppliers: [],
    purchases: [], expenses: [], ingredients: [],
    foodMenuItems: [], foodCategories: [],
    foodRecipes: {}, modifiers: [],
    ingredientCategories: [], ingredientUnits: [],
    preMadeFood: [], users: [], outlets: [],
    attendance: [], kitchens: [], wasteRecords: [],
    transfers: [], stockAdjustments: [],
    productions: [], smsHistory: [],
    settings: defaultSettings,
    revenueChartData: [], orderTypeData: [],
    deals: [], riders: [], deliveryAssignments: [],
    loyaltySettings: mockLoyaltySettings,
    loyaltyMembers: [], loyaltyRewards: [], loyaltyTransactions: [],
    stockTakes: [], shifts: [], coupons: [],
    reservations: [], tables: [],
    shiftTemplates: mockShiftTemplates, // structural config, not data
    staffSchedules: [], leaveRequests: [], leaveBalances: [],
  };
}

function loadStore(): DataStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // If version mismatch, discard old mock-seeded localStorage and start fresh
      if (parsed.__version !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        return getDefaults();
      }
      return { ...getDefaults(), ...parsed };
    }
  } catch { /* ignore */ }
  return getDefaults();
}

type CollectionKey = keyof Omit<DataStore, "settings" | "foodRecipes" | "revenueChartData" | "orderTypeData" | "loyaltySettings">;

interface DataContextType extends DataStore {
  addItem: <K extends CollectionKey>(key: K, item: DataStore[K][number]) => void;
  updateItem: <K extends CollectionKey>(key: K, id: string, updates: Partial<DataStore[K][number]>) => void;
  removeItem: <K extends CollectionKey>(key: K, id: string) => void;
  addOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  adjustStock: (ingredientId: string, qty: number, type: "add" | "deduct") => void;
  updateSettings: (updates: Partial<Settings>) => void;
  updateFoodRecipes: (recipes: Record<string, { ingredientId: string; qtyPerUnit: number }[]>) => void;
  updateLoyaltySettings: (updates: Partial<LoyaltySettings>) => void;
  resetToDefaults: () => void;
}

const DataContext = createContext<DataContextType | null>(null);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [store, setStore] = useState<DataStore>(loadStore);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, __version: STORAGE_VERSION }));
  }, [store]);

  const update = useCallback((updater: (prev: DataStore) => DataStore) => {
    setStore(updater);
  }, []);

  const addItem = useCallback(<K extends CollectionKey>(key: K, item: any) => {
    update(prev => ({ ...prev, [key]: [...(prev[key] as any[]), item] }));
  }, [update]);

  const updateItem = useCallback(<K extends CollectionKey>(key: K, id: string, updates: any) => {
    update(prev => ({
      ...prev,
      [key]: (prev[key] as any[]).map((x: any) => x.id === id ? { ...x, ...updates } : x),
    }));
  }, [update]);

  const removeItem = useCallback(<K extends CollectionKey>(key: K, id: string) => {
    update(prev => ({
      ...prev,
      [key]: (prev[key] as any[]).filter((x: any) => x.id !== id),
    }));
  }, [update]);

  const adjustStock = useCallback((ingredientId: string, qty: number, type: "add" | "deduct") => {
    update(prev => ({
      ...prev,
      ingredients: prev.ingredients.map(i =>
        i.id === ingredientId
          ? { ...i, currentStock: Math.max(0, type === "add" ? i.currentStock + qty : i.currentStock - qty) }
          : i
      ),
    }));
  }, [update]);

  const addOrder = useCallback((order: Order) => {
    update(prev => {
      const newOrders = [...prev.orders, order];
      let newIngredients = [...prev.ingredients];
      for (const item of order.items) {
        const recipe = prev.foodRecipes[item.name];
        if (recipe) {
          for (const r of recipe) {
            const required = r.qtyPerUnit * item.qty;
            newIngredients = newIngredients.map(ig =>
              ig.id === r.ingredientId
                ? { ...ig, currentStock: Math.max(0, ig.currentStock - required) }
                : ig
            );
          }
        }
      }
      return { ...prev, orders: newOrders, ingredients: newIngredients };
    });
  }, [update]);

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    update(prev => ({
      ...prev,
      orders: prev.orders.map(o => o.id === id ? { ...o, status } : o),
    }));
  }, [update]);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    update(prev => ({ ...prev, settings: { ...prev.settings, ...updates } }));
  }, [update]);

  const updateFoodRecipes = useCallback((recipes: Record<string, { ingredientId: string; qtyPerUnit: number }[]>) => {
    update(prev => ({ ...prev, foodRecipes: recipes }));
  }, [update]);

  const updateLoyaltySettings = useCallback((updates: Partial<LoyaltySettings>) => {
    update(prev => ({ ...prev, loyaltySettings: { ...prev.loyaltySettings, ...updates } }));
  }, [update]);

  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStore(getDefaults());
  }, []);

  const value: DataContextType = {
    ...store,
    addItem, updateItem, removeItem,
    addOrder, updateOrderStatus,
    adjustStock,
    updateSettings, updateFoodRecipes,
    updateLoyaltySettings,
    resetToDefaults,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
