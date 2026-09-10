/**
 * Civil dates arrive as YYYY-MM-DD and must not be handed to `new Date()`
 * directly for display: that parses them as midnight UTC and can print the
 * previous day to anyone west of Greenwich. Formatting explicitly in UTC
 * keeps the date that was stored the date that is shown.
 */
export function formatCivilDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** The short form, for lists where the weekday is already implied. */
export function formatCivilDateShort(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A time-of-day greeting, so the app feels like it knows when you opened it. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The human-friendly stem of an email, for a greeting that is not a form. */
export function nameFromEmail(email: string): string {
  const stem = email.split("@")[0]?.split(/[.+_-]/)[0] ?? "";
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : "there";
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
