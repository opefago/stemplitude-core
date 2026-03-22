export function toDisplayTime(time24h: string): string {
  const [hh, mm] = time24h.split(":");
  const h = Number(hh);
  if (Number.isNaN(h)) return time24h;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${mm ?? "00"} ${suffix}`;
}

export function toMinutes(time24h?: string | null): number | null {
  if (!time24h) return null;
  const [hh, mm] = time24h.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** e.g. America/Vancouver → PST / PDT (based on `at`, default now). */
export function timeZoneShortName(ianaTimeZone: string, at: Date = new Date()): string {
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimeZone,
      timeZoneName: "short",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (short && !/^GMT/i.test(short)) return short;
    const generic = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimeZone,
      timeZoneName: "shortGeneric",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return generic ?? short ?? ianaTimeZone;
  } catch {
    return ianaTimeZone;
  }
}

export function buildMeetingTimeOptions(): Array<{ value: string; label: string; searchText: string }> {
  const slots: Array<{ value: string; label: string; searchText: string }> = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      const value = `${hh}:${mm}`;
      slots.push({
        value,
        label: toDisplayTime(value),
        searchText: value,
      });
    }
  }
  return slots;
}

export function buildTimeZoneOptions(): Array<{ value: string; label: string; searchText: string }> {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const supported =
    typeof intl.supportedValuesOf === "function"
      ? intl.supportedValuesOf("timeZone")
      : [
          "UTC",
          "Africa/Lagos",
          "Africa/Nairobi",
          "America/New_York",
          "America/Chicago",
          "America/Denver",
          "America/Los_Angeles",
          "Europe/London",
          "Europe/Paris",
          "Asia/Dubai",
          "Asia/Kolkata",
          "Asia/Singapore",
          "Australia/Sydney",
        ];
  return supported.map((tz) => ({
    value: tz,
    label: tz,
    searchText: tz.replace(/\//g, " "),
  }));
}
