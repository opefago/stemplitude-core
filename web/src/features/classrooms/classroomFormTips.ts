/** Long help text for classroom create/edit wizard (Tippy). */
export const CLASSROOM_FORM_TIP = {
  name: "The name students, parents, and staff see for this class. Choose something clear and unique so it is easy to find on dashboards and in reports.",
  program:
    "Optional. Tie this class to a program (for example a camp track or school-wide offering) for grouping and reporting. Leave empty if you do not use programs.",
  curriculum:
    "Optional. When linked, lessons and progress can follow a curriculum’s structure. If the curriculum has default labs configured, permitted labs below update to match—you can still change them. Leave empty for a quick stand-alone class—you can link or change a curriculum later in class settings.",
  instructor:
    "The primary instructor for this class. They can run sessions, assignments, and rosters. Only members who can teach appear in this list.",
  includeAdmins:
    "When enabled, organization admins and owners who also teach can appear as instructor options. Turn off if you only want members in dedicated instructor roles.",
  capacity:
    "Maximum students allowed in this class. Enter 0 (or leave empty) for no limit. Any number 1 or higher sets a hard enrollment cap.",
  classLocation:
    "Whether sessions are remote (video) or in person. This controls which meeting fields appear below.",
  meetingLink:
    "For online classes: auto-generate a meeting link for this class, or paste a link you already use (for example from your organization’s Zoom or Meet account).",
  meetingProvider:
    "Which video platform to use when auto-generating links. Your workspace must be set up for the provider you pick.",
  meetingUrl: "Full URL students use to join live sessions (Zoom, Google Meet, Microsoft Teams, etc.).",
  address:
    "Optional. Physical location for in-person meetings—address, building, or room. Helpful for families and calendars.",
  permittedLabs:
    "Which hands-on labs students may open from this class. Limit choices to match your curriculum and student age.",
  description: "Optional short summary on class cards and in communications. Helps parents and co-teachers understand the offering.",
  timezone:
    "All meeting days and times are interpreted in this timezone. Pick the zone your families and instructor actually use.",
  meetingDay:
    "Which weekday(s) this class usually meets. Pick every day that applies if the schedule repeats on multiple days.",
  recurring:
    "When checked, the class repeats weekly on the day(s) you selected. Turn off for one-off or irregular schedules if your workflow allows it.",
  meetingTime:
    "The usual session window. Used for conflict checks with this instructor’s other classes and for displaying the schedule.",
  startTime: "When the live session starts, in the timezone selected above.",
  endTime: "When the live session ends. Must be after the start time.",
  contentWindow:
    "How long after a session ends instructors can still edit shared content and resources for that session.",
} as const;

export const CLASSROOM_FORM_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
