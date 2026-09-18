/** Canonical business status vocabulary shared by UI and server guards. */
export const VIP_OFFER_STATUSES = [
  "forming",
  "confirmed",
  "admin_review",
  "merge_pending",
  "merged",
  "decision_pending",
  "supplement_payment_pending",
  "refund_pending",
  "refunding",
  "refunded",
  "cancelled",
] as const;

export type VipOfferStatus = (typeof VIP_OFFER_STATUSES)[number];

export const RESERVATION_STATUSES = [
  "pending_payment",
  "confirmed",
  "checked_in",
  "cancelled",
  "refunded",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** A pass remains valid after entry; check-in is a terminal presentation state. */
export function isPassAccessible(status: string): boolean {
  return status === "confirmed" || status === "checked_in";
}

/** checked_in_quantity is the canonical count for partial check-in. */
export function hasCheckedIn(checkedInQuantity: number | null | undefined): boolean {
  return Number(checkedInQuantity ?? 0) > 0;
}

