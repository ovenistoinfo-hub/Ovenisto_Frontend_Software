// ==================== OUTLETS ====================
export const outlets = [
  { id: "1", name: "Ovenisto (Main Branch)", code: "OV-001", address: "164-J LDA AVENUE-1 Lahore", city: "Lahore", phone: "03201119898", email: "admin@ovenisto.com", isActive: true },
  { id: "2", name: "Ovenisto DHA", code: "OV-002", address: "45-C DHA Phase 6, Lahore", city: "Lahore", phone: "03211119898", email: "dha@ovenisto.com", isActive: true },
];

// ==================== FOOD CATEGORIES ====================
export const foodCategories = [
  { id: "1", name: "Pizza", displayOrder: 1, itemCount: 6, status: "active" },
  { id: "2", name: "Premium Pizza", displayOrder: 2, itemCount: 4, status: "active" },
  { id: "3", name: "Fries", displayOrder: 3, itemCount: 3, status: "active" },
  { id: "4", name: "Drinks", displayOrder: 4, itemCount: 4, status: "active" },
  { id: "5", name: "Grill Burger", displayOrder: 5, itemCount: 2, status: "active" },
  { id: "6", name: "Chicken Burger", displayOrder: 6, itemCount: 2, status: "active" },
  { id: "7", name: "Saucy Sensation", displayOrder: 7, itemCount: 2, status: "active" },
  { id: "8", name: "Misc", displayOrder: 8, itemCount: 0, status: "active" },
  { id: "9", name: "Promotions", displayOrder: 9, itemCount: 0, status: "active" },
];

// ==================== FOOD MENU ====================
export const foodMenuItems = [
  { id: "1", name: "French Frise", category: "Fries", price: 300, available: true, code: "FF-001", image: "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=200&h=200&fit=crop", tags: ["vegetarian"], cookingTime: 8 },
  { id: "2", name: "Z-Heat", category: "Pizza", price: 400, available: true, code: "PZ-001", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop", tags: [], cookingTime: 15, variants: [{ name: "Small 6\"", price: 400 }, { name: "Medium 10\"", price: 700 }, { name: "Large 14\"", price: 1050 }] },
  { id: "3", name: "Z-Smoke", category: "Pizza", price: 400, available: true, code: "PZ-002", image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=200&h=200&fit=crop", tags: [], cookingTime: 15, variants: [{ name: "Small 6\"", price: 400 }, { name: "Medium 10\"", price: 700 }, { name: "Large 14\"", price: 1050 }] },
  { id: "4", name: "Charcoal BBQ", category: "Pizza", price: 550, available: true, code: "PZ-003", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop", tags: [], cookingTime: 18, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 900 }, { name: "Large 14\"", price: 1350 }] },
  { id: "5", name: "Green Supreme", category: "Pizza", price: 550, available: true, code: "PZ-004", image: "https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=200&h=200&fit=crop", tags: ["vegetarian"], cookingTime: 15, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 900 }, { name: "Large 14\"", price: 1350 }] },
  { id: "6", name: "Lahori Tikka", category: "Pizza", price: 550, available: true, code: "PZ-005", image: "https://images.unsplash.com/photo-1588315029754-2dd089d39a1a?w=200&h=200&fit=crop", tags: [], cookingTime: 20, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 900 }, { name: "Large 14\"", price: 1350 }] },
  { id: "7", name: "Ranch Plus", category: "Pizza", price: 550, available: true, code: "PZ-006", image: "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=200&h=200&fit=crop", tags: [], cookingTime: 15, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 900 }, { name: "Large 14\"", price: 1350 }] },
  { id: "8", name: "Texan Fajita", category: "Premium Pizza", price: 550, available: true, code: "PP-001", image: "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=200&h=200&fit=crop", tags: [], cookingTime: 22, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 950 }, { name: "Large 14\"", price: 1450 }] },
  { id: "9", name: "Trio Cheese", category: "Premium Pizza", price: 550, available: true, code: "PP-002", image: "https://images.unsplash.com/photo-1528137871618-79d2761e3fd5?w=200&h=200&fit=crop", tags: ["vegetarian"], cookingTime: 18, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 950 }, { name: "Large 14\"", price: 1450 }] },
  { id: "10", name: "Velvet Tikka", category: "Premium Pizza", price: 550, available: true, code: "PP-003", image: "https://images.unsplash.com/photo-1606502281004-f86cf1282af5?w=200&h=200&fit=crop", tags: [], cookingTime: 20, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 950 }, { name: "Large 14\"", price: 1450 }] },
  { id: "11", name: "Arabian Spice", category: "Premium Pizza", price: 550, available: true, code: "PP-004", image: "https://images.unsplash.com/photo-1585238342024-78d387f4a707?w=200&h=200&fit=crop", tags: [], cookingTime: 20, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 950 }, { name: "Large 14\"", price: 1450 }] },
  { id: "12", name: "Golden Supreme", category: "Premium Pizza", price: 550, available: false, code: "PP-005", image: "https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=200&h=200&fit=crop", tags: [], cookingTime: 22, variants: [{ name: "Small 6\"", price: 550 }, { name: "Medium 10\"", price: 950 }, { name: "Large 14\"", price: 1450 }] },
  { id: "13", name: "Chicken Zinger Burger", category: "Chicken Burger", price: 450, available: true, code: "CB-001", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop", tags: [], cookingTime: 12 },
  { id: "14", name: "Mighty Grill Burger", category: "Grill Burger", price: 500, available: true, code: "GB-001", image: "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=200&h=200&fit=crop", tags: [], cookingTime: 14 },
  { id: "15", name: "Regular Fries", category: "Fries", price: 200, available: true, code: "FF-002", image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=200&h=200&fit=crop", tags: ["vegetarian"], cookingTime: 6 },
  { id: "16", name: "Loaded Fries", category: "Fries", price: 350, available: true, code: "FF-003", image: "https://images.unsplash.com/photo-1585109649139-366815a0d713?w=200&h=200&fit=crop", tags: ["vegetarian"], cookingTime: 10 },
  { id: "17", name: "Pepsi 350ml", category: "Drinks", price: 100, available: true, code: "DR-001", image: "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=200&h=200&fit=crop", tags: ["beverage"], cookingTime: 0 },
  { id: "18", name: "Pepsi 1.5L", category: "Drinks", price: 200, available: true, code: "DR-002", image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&h=200&fit=crop", tags: ["beverage"], cookingTime: 0 },
  { id: "19", name: "Water Bottle", category: "Drinks", price: 80, available: true, code: "DR-003", image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=200&h=200&fit=crop", tags: ["beverage"], cookingTime: 0 },
  { id: "20", name: "Mint Margarita", category: "Drinks", price: 150, available: true, code: "DR-004", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=200&h=200&fit=crop", tags: ["beverage"], cookingTime: 3 },
];

// ==================== FOOD RECIPES ====================
export const foodRecipes: Record<string, { ingredientId: string; qtyPerUnit: number }[]> = {
  "Lahori Tikka": [
    { ingredientId: "2", qtyPerUnit: 0.2 },
    { ingredientId: "1", qtyPerUnit: 0.1 },
    { ingredientId: "3", qtyPerUnit: 0.05 },
    { ingredientId: "4", qtyPerUnit: 0.1 },
  ],
  "Charcoal BBQ": [
    { ingredientId: "2", qtyPerUnit: 0.2 },
    { ingredientId: "1", qtyPerUnit: 0.15 },
    { ingredientId: "3", qtyPerUnit: 0.05 },
    { ingredientId: "5", qtyPerUnit: 0.12 },
  ],
  "Texan Fajita": [
    { ingredientId: "2", qtyPerUnit: 0.2 },
    { ingredientId: "1", qtyPerUnit: 0.1 },
    { ingredientId: "3", qtyPerUnit: 0.05 },
    { ingredientId: "10", qtyPerUnit: 0.05 },
    { ingredientId: "9", qtyPerUnit: 0.03 },
  ],
  "Chicken Zinger Burger": [
    { ingredientId: "5", qtyPerUnit: 0.15 },
    { ingredientId: "21", qtyPerUnit: 1 },
    { ingredientId: "22", qtyPerUnit: 0.03 },
    { ingredientId: "7", qtyPerUnit: 0.02 },
  ],
  "French Frise": [
    { ingredientId: "20", qtyPerUnit: 0.2 },
    { ingredientId: "19", qtyPerUnit: 0.05 },
    { ingredientId: "17", qtyPerUnit: 0.002 },
  ],
  "Z-Heat": [
    { ingredientId: "2", qtyPerUnit: 0.2 },
    { ingredientId: "1", qtyPerUnit: 0.12 },
    { ingredientId: "3", qtyPerUnit: 0.05 },
    { ingredientId: "18", qtyPerUnit: 0.02 },
  ],
  "Z-Smoke": [
    { ingredientId: "2", qtyPerUnit: 0.2 },
    { ingredientId: "1", qtyPerUnit: 0.12 },
    { ingredientId: "3", qtyPerUnit: 0.05 },
    { ingredientId: "4", qtyPerUnit: 0.08 },
  ],
  "Mighty Grill Burger": [
    { ingredientId: "6", qtyPerUnit: 1 },
    { ingredientId: "21", qtyPerUnit: 1 },
    { ingredientId: "22", qtyPerUnit: 0.03 },
    { ingredientId: "7", qtyPerUnit: 0.02 },
    { ingredientId: "8", qtyPerUnit: 0.03 },
  ],
};

// ==================== INGREDIENT UNITS ====================
export const ingredientUnits = [
  { id: "1", name: "kg", status: "active" },
  { id: "2", name: "gram", status: "active" },
  { id: "3", name: "liter", status: "active" },
  { id: "4", name: "ml", status: "active" },
  { id: "5", name: "piece", status: "active" },
  { id: "6", name: "dozen", status: "active" },
];

// ==================== INGREDIENT CATEGORIES ====================
export const ingredientCategories = [
  { id: "1", name: "Dairy", description: "Milk-based products", status: "active" },
  { id: "2", name: "Meat", description: "Chicken, beef, and other meats", status: "active" },
  { id: "3", name: "Vegetables", description: "Fresh vegetables", status: "active" },
  { id: "4", name: "Spices", description: "Seasoning and spice mixes", status: "active" },
  { id: "5", name: "Sauces", description: "Cooking and dipping sauces", status: "active" },
  { id: "6", name: "Bread/Dough", description: "Flour-based items", status: "active" },
  { id: "7", name: "Oils", description: "Cooking oils", status: "active" },
  { id: "8", name: "Packaging", description: "Boxes, bags, wraps", status: "active" },
];

// ==================== INGREDIENTS ====================
export const ingredients = [
  { id: "1", name: "Mozzarella Cheese", category: "Dairy", unit: "kg", purchasePrice: 1200, currentStock: 25, lowStockLevel: 10, status: "active" },
  { id: "2", name: "Pizza Dough", category: "Bread/Dough", unit: "kg", purchasePrice: 150, currentStock: 40, lowStockLevel: 15, status: "active" },
  { id: "3", name: "Pizza Sauce", category: "Sauces", unit: "liter", purchasePrice: 350, currentStock: 12, lowStockLevel: 5, status: "active" },
  { id: "4", name: "Chicken Tikka", category: "Meat", unit: "kg", purchasePrice: 800, currentStock: 8, lowStockLevel: 5, status: "active" },
  { id: "5", name: "Chicken Breast", category: "Meat", unit: "kg", purchasePrice: 750, currentStock: 15, lowStockLevel: 8, status: "active" },
  { id: "6", name: "Beef Patty", category: "Meat", unit: "piece", purchasePrice: 120, currentStock: 50, lowStockLevel: 20, status: "active" },
  { id: "7", name: "Lettuce", category: "Vegetables", unit: "kg", purchasePrice: 200, currentStock: 3, lowStockLevel: 5, status: "active" },
  { id: "8", name: "Tomato", category: "Vegetables", unit: "kg", purchasePrice: 180, currentStock: 6, lowStockLevel: 5, status: "active" },
  { id: "9", name: "Onion", category: "Vegetables", unit: "kg", purchasePrice: 100, currentStock: 10, lowStockLevel: 5, status: "active" },
  { id: "10", name: "Capsicum", category: "Vegetables", unit: "kg", purchasePrice: 250, currentStock: 4, lowStockLevel: 3, status: "active" },
  { id: "11", name: "Olives", category: "Vegetables", unit: "kg", purchasePrice: 900, currentStock: 2, lowStockLevel: 3, status: "active" },
  { id: "12", name: "Mushrooms", category: "Vegetables", unit: "kg", purchasePrice: 600, currentStock: 3, lowStockLevel: 3, status: "active" },
  { id: "13", name: "Jalapenos", category: "Vegetables", unit: "kg", purchasePrice: 400, currentStock: 2, lowStockLevel: 2, status: "active" },
  { id: "14", name: "Cooking Oil", category: "Oils", unit: "liter", purchasePrice: 500, currentStock: 20, lowStockLevel: 10, status: "active" },
  { id: "15", name: "Flour", category: "Bread/Dough", unit: "kg", purchasePrice: 120, currentStock: 50, lowStockLevel: 20, status: "active" },
  { id: "16", name: "Yeast", category: "Bread/Dough", unit: "kg", purchasePrice: 800, currentStock: 2, lowStockLevel: 1, status: "active" },
  { id: "17", name: "Salt", category: "Spices", unit: "kg", purchasePrice: 50, currentStock: 10, lowStockLevel: 3, status: "active" },
  { id: "18", name: "Spice Mix", category: "Spices", unit: "kg", purchasePrice: 600, currentStock: 5, lowStockLevel: 2, status: "active" },
  { id: "19", name: "Frying Oil", category: "Oils", unit: "liter", purchasePrice: 450, currentStock: 15, lowStockLevel: 8, status: "active" },
  { id: "20", name: "Potatoes", category: "Vegetables", unit: "kg", purchasePrice: 80, currentStock: 30, lowStockLevel: 15, status: "active" },
  { id: "21", name: "Buns", category: "Bread/Dough", unit: "piece", purchasePrice: 30, currentStock: 60, lowStockLevel: 25, status: "active" },
  { id: "22", name: "Mayo", category: "Sauces", unit: "liter", purchasePrice: 400, currentStock: 8, lowStockLevel: 3, status: "active" },
  { id: "23", name: "Ketchup", category: "Sauces", unit: "liter", purchasePrice: 300, currentStock: 10, lowStockLevel: 4, status: "active" },
  { id: "24", name: "Packaging Boxes", category: "Packaging", unit: "piece", purchasePrice: 15, currentStock: 200, lowStockLevel: 50, status: "active" },
];

// ==================== MODIFIERS ====================
export const modifiers = [
  { id: "1", name: "Extra Cheese", price: 150, type: "addon" as const, status: "active" },
  { id: "2", name: "No Onion", price: 0, type: "removal" as const, status: "active" },
  { id: "3", name: "Extra Sauce", price: 50, type: "addon" as const, status: "active" },
  { id: "4", name: "Spicy", price: 0, type: "addon" as const, status: "active" },
  { id: "5", name: "Less Salt", price: 0, type: "removal" as const, status: "active" },
  { id: "6", name: "Extra Jalapenos", price: 80, type: "addon" as const, status: "active" },
  { id: "7", name: "Double Patty", price: 200, type: "addon" as const, status: "active" },
];

// ==================== USERS ====================
export const users = [
  { id: "1", name: "Admin User", email: "admin@ovenisto.com", phone: "03201119898", role: "Super Admin", branch: "Main Branch", status: "active", lastLogin: "2026-03-08 09:00", avatar: "" },
  { id: "2", name: "Ali Hassan", email: "ali@ovenisto.com", phone: "03001234567", role: "Manager", branch: "Main Branch", status: "active", lastLogin: "2026-03-08 08:30", avatar: "" },
  { id: "3", name: "Ahmed Khan", email: "ahmed@ovenisto.com", phone: "03009876543", role: "Cashier", branch: "Main Branch", status: "active", lastLogin: "2026-03-08 10:00", avatar: "" },
  { id: "4", name: "Usman Raza", email: "usman@ovenisto.com", phone: "03005556789", role: "Kitchen Staff", branch: "Main Branch", status: "active", lastLogin: "2026-03-08 07:00", avatar: "" },
  { id: "5", name: "Bilal Sheikh", email: "bilal@ovenisto.com", phone: "03001112233", role: "Waiter", branch: "Main Branch", status: "active", lastLogin: "2026-03-08 09:30", avatar: "" },
  { id: "6", name: "Faisal Iqbal", email: "faisal@ovenisto.com", phone: "03214567890", role: "Waiter", branch: "Main Branch", status: "active", lastLogin: "2026-03-08 10:00", avatar: "" },
  { id: "7", name: "Hassan Raza", email: "hassan@ovenisto.com", phone: "03331234560", role: "Waiter", branch: "Main Branch", status: "active", lastLogin: "2026-03-08 09:15", avatar: "" },
];

// ==================== ORDERS ====================
export type OrderStatus = "completed" | "preparing" | "pending" | "cancelled" | "ready" | "scheduled";
export type OrderType = "Dine In" | "Take Away" | "Delivery" | "Online" | "Self Order" | "Foodpanda" | "Walk-in";
export type CustomerType = "walk-in" | "regular" | "corporate" | "vip";
export type OrderSource = "pos" | "self-order" | "website" | "foodpanda" | "phone";

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  discount: number;
  modifiers?: string[];
  cookingTime?: number;
  notes?: string;
}

export interface OrderModificationLog {
  timestamp: string;
  action: "item_added" | "item_removed" | "qty_changed" | "discount_changed" | "cancelled" | "type_changed" | "notes_changed";
  detail: string;
  staff: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: string;
  phone: string;
  type: OrderType;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentMethod: string;
  date: string;
  time: string;
  staff: string;
  tableNumber?: number;
  deliveryAddress?: string;
  rider?: string;
  // Future Sale fields
  isFutureSale?: boolean;
  scheduledDate?: string;
  scheduledTime?: string;
  futureNotes?: string;
  advancePayment?: number;
  // Enhanced POS fields
  isUrgent?: boolean;
  customerType?: CustomerType;
  orderSource?: OrderSource;
  modificationLog?: OrderModificationLog[];
}

export const orders: Order[] = [
  { id: "1", orderNumber: "ORD-001", customer: "Muhammad Ali", phone: "03001234567", type: "Dine In", items: [{ id: "1", name: "Lahori Tikka", price: 550, qty: 2, discount: 0 }, { id: "2", name: "Pepsi 350ml", price: 100, qty: 2, discount: 0 }], subtotal: 1300, discount: 0, tax: 208, total: 1508, status: "completed", paymentMethod: "Cash", date: "2026-03-08", time: "12:30 PM", staff: "Ahmed Khan", tableNumber: 3 },
  { id: "2", orderNumber: "ORD-002", customer: "Sara Ahmed", phone: "03009876543", type: "Delivery", items: [{ id: "1", name: "Charcoal BBQ", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Loaded Fries", price: 350, qty: 1, discount: 0 }, { id: "3", name: "Pepsi 1.5L", price: 200, qty: 1, discount: 0 }], subtotal: 1100, discount: 50, tax: 168, total: 1218, status: "preparing", paymentMethod: "Online", date: "2026-03-08", time: "1:15 PM", staff: "Ahmed Khan", deliveryAddress: "Flat 12, Model Town, Lahore", rider: "Rider 1" },
  { id: "3", orderNumber: "ORD-003", customer: "Hassan Raza", phone: "03112223344", type: "Take Away", items: [{ id: "1", name: "Chicken Zinger Burger", price: 450, qty: 2, discount: 0 }, { id: "2", name: "Regular Fries", price: 200, qty: 2, discount: 0 }], subtotal: 1300, discount: 0, tax: 208, total: 1508, status: "completed", paymentMethod: "Cash", date: "2026-03-08", time: "11:45 AM", staff: "Ahmed Khan" },
  { id: "4", orderNumber: "ORD-004", customer: "Fatima Khan", phone: "03005556789", type: "Dine In", items: [{ id: "1", name: "Texan Fajita", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Trio Cheese", price: 550, qty: 1, discount: 0 }, { id: "3", name: "Mint Margarita", price: 150, qty: 2, discount: 0 }], subtotal: 1400, discount: 100, tax: 208, total: 1508, status: "pending", paymentMethod: "Card", date: "2026-03-08", time: "2:00 PM", staff: "Ahmed Khan", tableNumber: 7 },
  { id: "5", orderNumber: "ORD-005", customer: "Usman Tariq", phone: "03331234567", type: "Online", items: [{ id: "1", name: "Green Supreme", price: 550, qty: 1, discount: 0 }, { id: "2", name: "French Frise", price: 300, qty: 1, discount: 0 }], subtotal: 850, discount: 0, tax: 136, total: 986, status: "completed", paymentMethod: "Online", date: "2026-03-08", time: "10:30 AM", staff: "Ahmed Khan" },
  { id: "6", orderNumber: "ORD-006", customer: "Ayesha Malik", phone: "03219876543", type: "Delivery", items: [{ id: "1", name: "Ranch Plus", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Velvet Tikka", price: 550, qty: 1, discount: 0 }, { id: "3", name: "Water Bottle", price: 80, qty: 2, discount: 0 }], subtotal: 1260, discount: 0, tax: 202, total: 1462, status: "preparing", paymentMethod: "Cash", date: "2026-03-08", time: "1:45 PM", staff: "Ahmed Khan", deliveryAddress: "Cantt Area, Lahore", rider: "Rider 2" },
  { id: "7", orderNumber: "ORD-007", customer: "Bilal Hussain", phone: "03001112233", type: "Dine In", items: [{ id: "1", name: "Mighty Grill Burger", price: 500, qty: 1, discount: 0 }, { id: "2", name: "Loaded Fries", price: 350, qty: 1, discount: 0 }, { id: "3", name: "Pepsi 350ml", price: 100, qty: 1, discount: 0 }], subtotal: 950, discount: 0, tax: 152, total: 1102, status: "ready", paymentMethod: "Cash", date: "2026-03-08", time: "12:00 PM", staff: "Bilal Sheikh", tableNumber: 5 },
  { id: "8", orderNumber: "ORD-008", customer: "Zainab Siddiqui", phone: "03451234567", type: "Take Away", items: [{ id: "1", name: "Z-Heat", price: 400, qty: 1, discount: 0 }, { id: "2", name: "Z-Smoke", price: 400, qty: 1, discount: 0 }], subtotal: 800, discount: 0, tax: 128, total: 928, status: "completed", paymentMethod: "Cash", date: "2026-03-07", time: "7:30 PM", staff: "Ahmed Khan" },
  { id: "9", orderNumber: "ORD-009", customer: "Omar Farooq", phone: "03329876543", type: "Dine In", items: [{ id: "1", name: "Arabian Spice", price: 550, qty: 2, discount: 0 }, { id: "2", name: "Pepsi 1.5L", price: 200, qty: 1, discount: 0 }], subtotal: 1300, discount: 0, tax: 208, total: 1508, status: "completed", paymentMethod: "Card", date: "2026-03-07", time: "8:15 PM", staff: "Ahmed Khan", tableNumber: 2 },
  { id: "10", orderNumber: "ORD-010", customer: "Nadia Qureshi", phone: "03005554321", type: "Delivery", items: [{ id: "1", name: "Golden Supreme", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Regular Fries", price: 200, qty: 1, discount: 0 }, { id: "3", name: "Pepsi 350ml", price: 100, qty: 2, discount: 0 }], subtotal: 950, discount: 0, tax: 152, total: 1102, status: "cancelled", paymentMethod: "Cash", date: "2026-03-07", time: "6:00 PM", staff: "Ahmed Khan" },
  { id: "11", orderNumber: "ORD-011", customer: "Kamran Shah", phone: "03211119898", type: "Dine In", items: [{ id: "1", name: "Lahori Tikka", price: 550, qty: 1, discount: 0 }], subtotal: 550, discount: 0, tax: 88, total: 638, status: "completed", paymentMethod: "Cash", date: "2026-03-07", time: "1:00 PM", staff: "Bilal Sheikh", tableNumber: 1 },
  { id: "12", orderNumber: "ORD-012", customer: "Sana Javed", phone: "03001239876", type: "Take Away", items: [{ id: "1", name: "Chicken Zinger Burger", price: 450, qty: 3, discount: 0 }, { id: "2", name: "Loaded Fries", price: 350, qty: 2, discount: 0 }], subtotal: 2050, discount: 150, tax: 304, total: 2204, status: "completed", paymentMethod: "Cash", date: "2026-03-06", time: "7:00 PM", staff: "Ahmed Khan" },
  { id: "13", orderNumber: "ORD-013", customer: "Rizwan Ali", phone: "03339876543", type: "Dine In", items: [{ id: "1", name: "Texan Fajita", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Mint Margarita", price: 150, qty: 1, discount: 0 }], subtotal: 700, discount: 0, tax: 112, total: 812, status: "completed", paymentMethod: "Card", date: "2026-03-06", time: "2:30 PM", staff: "Bilal Sheikh", tableNumber: 4 },
  { id: "14", orderNumber: "ORD-014", customer: "Hina Batool", phone: "03455551234", type: "Online", items: [{ id: "1", name: "Z-Heat", price: 400, qty: 2, discount: 0 }, { id: "2", name: "French Frise", price: 300, qty: 1, discount: 0 }, { id: "3", name: "Pepsi 1.5L", price: 200, qty: 1, discount: 0 }], subtotal: 1300, discount: 0, tax: 208, total: 1508, status: "completed", paymentMethod: "Online", date: "2026-03-06", time: "12:45 PM", staff: "Ahmed Khan" },
  { id: "15", orderNumber: "ORD-015", customer: "Adnan Malik", phone: "03009991234", type: "Delivery", items: [{ id: "1", name: "Ranch Plus", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Water Bottle", price: 80, qty: 1, discount: 0 }], subtotal: 630, discount: 0, tax: 101, total: 731, status: "completed", paymentMethod: "Cash", date: "2026-03-05", time: "8:00 PM", staff: "Ahmed Khan" },
  { id: "16", orderNumber: "ORD-016", customer: "Tariq Mehmood", phone: "03001234599", type: "Dine In", items: [{ id: "1", name: "Lahori Tikka", price: 550, qty: 2, discount: 0 }, { id: "2", name: "Mint Margarita", price: 150, qty: 2, discount: 0 }], subtotal: 1400, discount: 0, tax: 224, total: 1624, status: "pending", paymentMethod: "Cash", date: "2026-03-09", time: "12:15 PM", staff: "Ahmed Khan", tableNumber: 5 },
  { id: "17", orderNumber: "ORD-017", customer: "Imran Qureshi", phone: "03331234599", type: "Take Away", items: [{ id: "1", name: "Z-Heat", price: 400, qty: 2, discount: 0 }, { id: "2", name: "Loaded Fries", price: 350, qty: 1, discount: 0 }], subtotal: 1150, discount: 0, tax: 184, total: 1334, status: "preparing", paymentMethod: "Cash", date: "2026-03-09", time: "12:30 PM", staff: "Ahmed Khan" },
  { id: "18", orderNumber: "ORD-018", customer: "Saad Farooq", phone: "03009871234", type: "Delivery", items: [{ id: "1", name: "Texan Fajita", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Green Supreme", price: 550, qty: 1, discount: 0 }, { id: "3", name: "Pepsi 1.5L", price: 200, qty: 1, discount: 0 }], subtotal: 1300, discount: 50, tax: 200, total: 1450, status: "pending", paymentMethod: "Online", date: "2026-03-09", time: "12:45 PM", staff: "Bilal Sheikh" },
  { id: "19", orderNumber: "ORD-019", customer: "Kamran Shah", phone: "03211119898", type: "Take Away",
    items: [{ id: "1", name: "Lahori Tikka", price: 900, qty: 5, discount: 0 }, { id: "2", name: "Charcoal BBQ", price: 900, qty: 3, discount: 0 }, { id: "3", name: "Pepsi 1.5L", price: 200, qty: 4, discount: 0 }],
    subtotal: 8100, discount: 500, tax: 1216, total: 8816, status: "scheduled", paymentMethod: "Cash",
    date: "2026-03-11", time: "10:00 AM", staff: "Ahmed Khan",
    isFutureSale: true, scheduledDate: "2026-03-15", scheduledTime: "07:00 PM",
    futureNotes: "Iftari program for office \u2014 20 people", advancePayment: 3000 },
  { id: "20", orderNumber: "ORD-020", customer: "Fatima Khan", phone: "03005556789", type: "Delivery",
    items: [{ id: "1", name: "Texan Fajita", price: 950, qty: 4, discount: 0 }, { id: "2", name: "Trio Cheese", price: 950, qty: 2, discount: 0 }, { id: "3", name: "Mint Margarita", price: 150, qty: 6, discount: 0 }],
    subtotal: 6600, discount: 0, tax: 1056, total: 7656, status: "scheduled", paymentMethod: "Pending",
    date: "2026-03-11", time: "11:30 AM", staff: "Bilal Sheikh",
    deliveryAddress: "House 90, Gulberg III, Lahore",
    isFutureSale: true, scheduledDate: "2026-03-20", scheduledTime: "08:30 PM",
    futureNotes: "Birthday celebration \u2014 need special packaging", advancePayment: 5000 },
  { id: "21", orderNumber: "ORD-021", customer: "Sara Ahmed", phone: "03009876543", type: "Dine In",
    items: [{ id: "1", name: "Arabian Spice", price: 950, qty: 3, discount: 0 }, { id: "2", name: "Green Supreme", price: 900, qty: 2, discount: 0 }, { id: "3", name: "Loaded Fries", price: 350, qty: 4, discount: 0 }],
    subtotal: 6050, discount: 300, tax: 920, total: 6670, status: "scheduled", paymentMethod: "Card",
    date: "2026-03-11", time: "12:00 PM", staff: "Ahmed Khan",
    tableNumber: 5,
    isFutureSale: true, scheduledDate: "2026-03-12", scheduledTime: "01:00 PM",
    futureNotes: "Family lunch \u2014 reserved table 5", advancePayment: 2000 },
  // Self Order kiosk orders
  { id: "22", orderNumber: "ORD-022", customer: "Kiosk Guest", phone: "", type: "Dine In",
    items: [{ id: "1", name: "Mighty Grill Burger", price: 500, qty: 2, discount: 0 }, { id: "2", name: "Loaded Fries", price: 350, qty: 2, discount: 0 }, { id: "3", name: "Pepsi 350ml", price: 100, qty: 2, discount: 0 }],
    subtotal: 1900, discount: 0, tax: 304, total: 2204, status: "pending", paymentMethod: "Cash",
    date: "2026-03-09", time: "1:00 PM", staff: "Self Order", tableNumber: 3 },
  { id: "23", orderNumber: "ORD-023", customer: "Kiosk Guest", phone: "", type: "Take Away",
    items: [{ id: "1", name: "Z-Heat", price: 400, qty: 1, discount: 0 }, { id: "2", name: "French Frise", price: 300, qty: 1, discount: 0 }],
    subtotal: 700, discount: 0, tax: 112, total: 812, status: "preparing", paymentMethod: "JazzCash",
    date: "2026-03-09", time: "1:15 PM", staff: "Self Order" },
  // Online website orders (active - not completed/cancelled)
  { id: "24", orderNumber: "ORD-024", customer: "Zara Akhtar", phone: "03001234888", type: "Online",
    items: [{ id: "1", name: "Texan Fajita", price: 550, qty: 1, discount: 0 }, { id: "2", name: "Green Supreme", price: 550, qty: 1, discount: 0 }, { id: "3", name: "Pepsi 1.5L", price: 200, qty: 1, discount: 0 }],
    subtotal: 1300, discount: 0, tax: 208, total: 1508, status: "pending", paymentMethod: "Online",
    date: "2026-03-09", time: "1:30 PM", staff: "Website", deliveryAddress: "House 55, DHA Phase 5, Lahore" },
  { id: "25", orderNumber: "ORD-025", customer: "Amjad Hussain", phone: "03339876000", type: "Online",
    items: [{ id: "1", name: "Arabian Spice", price: 550, qty: 2, discount: 0 }, { id: "2", name: "Loaded Fries", price: 350, qty: 1, discount: 0 }],
    subtotal: 1450, discount: 0, tax: 232, total: 1682, status: "preparing", paymentMethod: "EasyPaisa",
    date: "2026-03-09", time: "1:45 PM", staff: "Website" },
];

// ==================== CUSTOMERS ====================
export const customers = [
  { id: "1", name: "Muhammad Ali", phone: "03001234567", email: "mali@gmail.com", totalOrders: 12, totalSpent: 15600, outstandingDue: 0, lastOrder: "2026-03-08", address: "House 45, Johar Town, Lahore", customerType: "regular" as CustomerType, loyaltyPoints: 156, customPriceList: null as string | null },
  { id: "2", name: "Sara Ahmed", phone: "03009876543", email: "sara@gmail.com", totalOrders: 8, totalSpent: 9800, outstandingDue: 1218, lastOrder: "2026-03-08", address: "Flat 12, Model Town, Lahore", customerType: "regular" as CustomerType, loyaltyPoints: 98, customPriceList: null as string | null },
  { id: "3", name: "Hassan Raza", phone: "03112223344", email: "hraza@gmail.com", totalOrders: 5, totalSpent: 7500, outstandingDue: 0, lastOrder: "2026-03-08", address: "67-B Garden Town, Lahore", customerType: "vip" as CustomerType, loyaltyPoints: 225, customPriceList: null as string | null },
  { id: "4", name: "Fatima Khan", phone: "03005556789", email: "fatima@gmail.com", totalOrders: 15, totalSpent: 22500, outstandingDue: 1508, lastOrder: "2026-03-08", address: "House 90, Gulberg III, Lahore", customerType: "corporate" as CustomerType, loyaltyPoints: 0, customPriceList: "corporate-10" as string | null },
  { id: "5", name: "Usman Tariq", phone: "03331234567", email: "usman@gmail.com", totalOrders: 3, totalSpent: 2958, outstandingDue: 0, lastOrder: "2026-03-08", address: "Defence Road, Lahore", customerType: "regular" as CustomerType, loyaltyPoints: 30, customPriceList: null as string | null },
  { id: "6", name: "Ayesha Malik", phone: "03219876543", email: "ayesha@gmail.com", totalOrders: 7, totalSpent: 10430, outstandingDue: 1462, lastOrder: "2026-03-08", address: "Cantt Area, Lahore", customerType: "corporate" as CustomerType, loyaltyPoints: 0, customPriceList: "corporate-10" as string | null },
];

// ==================== SUPPLIERS ====================
export const suppliers = [
  { id: "1", name: "Metro Cash & Carry", company: "Metro Pakistan", phone: "04235761234", email: "orders@metro.pk", totalPurchases: 245000, totalDue: 15000 },
  { id: "2", name: "Gourmet Foods", company: "Gourmet Group", phone: "04237891234", email: "supply@gourmet.pk", totalPurchases: 180000, totalDue: 0 },
  { id: "3", name: "Al-Fatah Store", company: "Al-Fatah Enterprises", phone: "04232451234", email: "bulk@alfatah.pk", totalPurchases: 95000, totalDue: 8500 },
  { id: "4", name: "Local Farm Supplier", company: "Green Valley Farms", phone: "03001119876", email: "farm@greenvalley.pk", totalPurchases: 65000, totalDue: 3200 },
];

// ==================== PURCHASES ====================
export const purchases = [
  { id: "1", date: "2026-03-07", invoiceNumber: "INV-2001", supplier: "Metro Cash & Carry", itemCount: 8, totalAmount: 45000, paymentStatus: "paid" as const },
  { id: "2", date: "2026-03-05", invoiceNumber: "INV-2002", supplier: "Gourmet Foods", itemCount: 5, totalAmount: 28000, paymentStatus: "paid" as const },
  { id: "3", date: "2026-03-04", invoiceNumber: "INV-2003", supplier: "Al-Fatah Store", itemCount: 12, totalAmount: 52000, paymentStatus: "partial" as const },
  { id: "4", date: "2026-03-02", invoiceNumber: "INV-2004", supplier: "Local Farm Supplier", itemCount: 6, totalAmount: 18000, paymentStatus: "unpaid" as const },
];

// ==================== EXPENSES ====================
export const expenses = [
  { id: "1", date: "2026-03-08", category: "Utilities", description: "Electricity bill March", amount: 45000, paymentMethod: "Bank Transfer", receipt: true },
  { id: "2", date: "2026-03-07", category: "Rent", description: "Monthly rent - Main Branch", amount: 150000, paymentMethod: "Bank Transfer", receipt: true },
  { id: "3", date: "2026-03-06", category: "Salary", description: "Staff salaries February", amount: 280000, paymentMethod: "Bank Transfer", receipt: true },
  { id: "4", date: "2026-03-05", category: "Maintenance", description: "Oven repair", amount: 12000, paymentMethod: "Cash", receipt: false },
  { id: "5", date: "2026-03-03", category: "Marketing", description: "Social media ads", amount: 25000, paymentMethod: "Online", receipt: true },
  { id: "6", date: "2026-03-01", category: "Misc", description: "Cleaning supplies", amount: 5000, paymentMethod: "Cash", receipt: false },
];

// ==================== KITCHENS ====================
export const kitchens = [
  { id: "1", name: "Main Kitchen", categories: ["Pizza", "Premium Pizza", "Fries"], printer: "Kitchen Printer 1" },
  { id: "2", name: "Grill Station", categories: ["Grill Burger", "Chicken Burger"], printer: "Kitchen Printer 2" },
  { id: "3", name: "Beverage Counter", categories: ["Drinks", "Saucy Sensation"], printer: "Bar Printer" },
];

// ==================== ATTENDANCE ====================
export const attendance = [
  { id: "1", employee: "Ali Hassan", role: "Manager", date: "2026-03-08", clockIn: "08:30", clockOut: "17:30", totalHours: 9, status: "present" as const },
  { id: "2", employee: "Ahmed Khan", role: "Cashier", date: "2026-03-08", clockIn: "09:00", clockOut: "18:00", totalHours: 9, status: "present" as const },
  { id: "3", employee: "Usman Raza", role: "Kitchen Staff", date: "2026-03-08", clockIn: "07:00", clockOut: "16:00", totalHours: 9, status: "present" as const },
  { id: "4", employee: "Bilal Sheikh", role: "Waiter", date: "2026-03-08", clockIn: "09:45", clockOut: "", totalHours: 0, status: "late" as const },
  { id: "5", employee: "Sana Javed", role: "Cashier", date: "2026-03-08", clockIn: "", clockOut: "", totalHours: 0, status: "absent" as const },
];

// ==================== WASTE ====================
export const wasteRecords = [
  { id: "1", date: "2026-03-08", item: "Pizza Dough", category: "Bread/Dough", qty: 2, unit: "kg", reason: "Expired", estimatedLoss: 300, recordedBy: "Usman Raza", notes: "Left overnight", wasteType: "raw" as const, responsiblePerson: "Usman Raza", disposedBy: "Ali Hassan", photo: "" },
  { id: "2", date: "2026-03-07", item: "Tomato", category: "Vegetables", qty: 3, unit: "kg", reason: "Spoiled", estimatedLoss: 540, recordedBy: "Usman Raza", notes: "", wasteType: "raw" as const, responsiblePerson: "Ahmed Khan", disposedBy: "Usman Raza", photo: "" },
  { id: "3", date: "2026-03-06", item: "Mozzarella Cheese", category: "Dairy", qty: 0.5, unit: "kg", reason: "Damaged", estimatedLoss: 600, recordedBy: "Ali Hassan", notes: "Packaging torn", wasteType: "raw" as const, responsiblePerson: "Ali Hassan", disposedBy: "Ali Hassan", photo: "" },
  { id: "4", date: "2026-03-05", item: "Chicken Tikka Pizza", category: "Finished Product", qty: 1, unit: "piece", reason: "Overcooked", estimatedLoss: 850, recordedBy: "Usman Raza", notes: "Burnt in oven", wasteType: "finished" as const, responsiblePerson: "Ahmed Khan", disposedBy: "Usman Raza", photo: "" },
  { id: "5", date: "2026-03-04", item: "Cooking Oil", category: "Oils", qty: 2, unit: "liter", reason: "Accidental", estimatedLoss: 1000, recordedBy: "Ali Hassan", notes: "Spilled on floor", wasteType: "raw" as const, responsiblePerson: "Ahmed Khan", disposedBy: "Ali Hassan", photo: "" },
];

// ==================== TRANSFERS ====================
export const transfers = [
  { id: "1", date: "2026-03-07", from: "Main Branch", to: "DHA Branch", itemCount: 5, totalValue: 12500, status: "completed" as const, transferredBy: "Ali Hassan" },
  { id: "2", date: "2026-03-05", from: "Main Branch", to: "DHA Branch", itemCount: 3, totalValue: 8000, status: "pending" as const, transferredBy: "Ali Hassan" },
];

// ==================== STOCK ADJUSTMENTS ====================
export const stockAdjustments = [
  { id: "1", date: "2026-03-08", ingredient: "Mozzarella Cheese", type: "addition" as const, qty: 10, reason: "Purchase received", adjustedBy: "Ali Hassan", notes: "" },
  { id: "2", date: "2026-03-07", ingredient: "Potatoes", type: "reduction" as const, qty: 5, reason: "Counting Error", adjustedBy: "Usman Raza", notes: "Physical count mismatch" },
  { id: "3", date: "2026-03-06", ingredient: "Chicken Tikka", type: "reduction" as const, qty: 2, reason: "Spoilage", adjustedBy: "Usman Raza", notes: "Refrigerator malfunction" },
];

// ==================== PRODUCTION ====================
export const productions = [
  { id: "1", date: "2026-03-08", product: "Pizza Dough (Pre-made)", qty: 20, ingredientsUsed: "Flour 10kg, Yeast 0.2kg, Salt 0.1kg, Water 5L", producedBy: "Usman Raza", notes: "Morning batch" },
  { id: "2", date: "2026-03-07", product: "Chicken Tikka (Pre-made)", qty: 10, ingredientsUsed: "Chicken Breast 8kg, Spice Mix 0.5kg", producedBy: "Usman Raza", notes: "" },
];

// ==================== PRE-MADE FOOD ====================
export const preMadeFood = [
  { id: "1", name: "Pre-made Pizza Dough", category: "Bread/Dough", sellingPrice: 0, costPrice: 150, stockQty: 40, status: "active" },
  { id: "2", name: "Marinated Chicken Tikka", category: "Meat", sellingPrice: 0, costPrice: 800, stockQty: 8, status: "active" },
  { id: "3", name: "Prepared Sauce Mix", category: "Sauces", sellingPrice: 0, costPrice: 200, stockQty: 15, status: "active" },
];

// ==================== SMS HISTORY ====================
export const smsHistory = [
  { id: "1", date: "2026-03-07", recipientCount: 150, message: "🍕 50% OFF on all Premium Pizzas this weekend! Order now at Ovenisto.", status: "sent" as const, cost: 750 },
  { id: "2", date: "2026-03-01", recipientCount: 200, message: "Ramadan Special! Buy 1 Get 1 Free on all large pizzas. Valid till month end.", status: "sent" as const, cost: 1000 },
];

// ==================== DASHBOARD CHART DATA ====================
export const revenueChartData = [
  { date: "Mar 2", revenue: 32000 },
  { date: "Mar 3", revenue: 28000 },
  { date: "Mar 4", revenue: 45000 },
  { date: "Mar 5", revenue: 38000 },
  { date: "Mar 6", revenue: 52000 },
  { date: "Mar 7", revenue: 48000 },
  { date: "Mar 8", revenue: 45280 },
];

export const orderTypeData = [
  { name: "Dine In", value: 45, color: "hsl(var(--primary))" },
  { name: "Take Away", value: 30, color: "hsl(var(--accent))" },
  { name: "Delivery", value: 20, color: "hsl(var(--info))" },
  { name: "Online", value: 5, color: "hsl(var(--gold))" },
];
