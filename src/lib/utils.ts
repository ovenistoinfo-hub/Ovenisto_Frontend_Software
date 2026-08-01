import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format raw Pakistani phone number string into 11-digit formatted string: XXXX-XXXXXXX (e.g. 0300-1234567).
 * As the user types digits, it dynamically inserts hyphen after 4 digits: e.g. 0300-1234567.
 */
export function formatPakistaniPhone(value: string | null | undefined): string {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length === 12) {
    digits = "0" + digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length > 4) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return digits;
}

/**
 * Validates if the phone number string represents a valid 11-digit Pakistani phone number.
 */
export function isValidPakistaniPhone(value: string | null | undefined): boolean {
  if (!value) return false;
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length === 12) {
    digits = "0" + digits.slice(2);
  }
  return digits.length === 11;
}
