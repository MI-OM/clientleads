/** Map RPC error constants to visitor-friendly messages. */
export function friendlyBookError(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("BOOKING_SLOT_UNAVAILABLE"))
    return "That time was just taken — please pick another slot.";
  if (m.includes("BOOKING_RATE_LIMITED"))
    return "Too many bookings from this network recently. Please try again in a while.";
  if (m.includes("BOOKING_UNAVAILABLE")) return "That service isn't bookable right now.";
  if (m.includes("BOOKING_EMAIL_REQUIRED")) return "A valid email address is required.";
  if (m.includes("BOOKING_NAME_REQUIRED")) return "Your name is required.";
  if (m.includes("APPOINTMENT_NOT_FOUND")) return "We couldn't find that booking.";
  if (m.includes("APPOINTMENT_NOT_CANCELLABLE")) return "That booking can't be cancelled anymore.";
  if (m.includes("APPOINTMENT_NOT_RESCHEDULABLE"))
    return "That booking can't be rescheduled anymore.";
  return "Something went wrong. Please try again.";
}
