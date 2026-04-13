import { KidCheckbox, KidDropdown, SearchableDropdown, TimePicker } from "../../components/ui";
import { CLASSROOM_FORM_DAYS, CLASSROOM_FORM_TIP } from "./classroomFormTips";
import { ClassroomFormLabelRow, FieldInfoIcon } from "./ClassroomFormLabels";
import { PERMITTED_LAB_OPTIONS } from "../../lib/permittedLabs";
import type { ClassroomWizardState } from "./useClassroomWizardState";
import type { Program as ProgramRecord } from "../../lib/api/programs";

export type ClassroomWizardPanelContext = {
  mode: "create" | "edit";
  idPrefix: string;
  selectableInstructors: Array<{ id: string; label: string; email: string }>;
  availableInstructorCount: number;
  loadingInstructors: boolean;
  programs: ProgramRecord[];
  curriculumOptions: Array<{ value: string; label: string; searchText: string }>;
  meetingTimeOptions: Array<{ value: string; label: string; searchText: string }>;
  timeZoneOptions: Array<{ value: string; label: string; searchText: string }>;
  duplicateNameExists: boolean;
  checkingDuplicateName: boolean;
  hasInstructorScheduleConflict: boolean;
  missingScheduleRequired: boolean;
  invalidTimeRange: boolean;
  programLockedByCurriculum: boolean;
  lessonOptions: Array<{ id: string; label: string }>;
  selectedLessonIds: string[];
  onOpenLessonPicker: () => void;
  onInviteInstructors: () => void;
};

function toggleChip(
  value: string,
  setState: (updater: (prev: string[]) => string[]) => void,
) {
  setState((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
}

export function ClassroomWizardBasicsStep({
  w,
  ctx,
}: {
  w: ClassroomWizardState;
  ctx: ClassroomWizardPanelContext;
}) {
  const p = ctx.idPrefix;
  return (
    <>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow
          htmlFor={`${p}-class-name`}
          required
          tip={CLASSROOM_FORM_TIP.name}
          ariaTopic="classroom name"
        >
          Classroom name
        </ClassroomFormLabelRow>
        <input
          id={`${p}-class-name`}
          type="text"
          value={w.name}
          onChange={(e) => {
            w.setName(e.target.value);
            w.setNameTouched(true);
          }}
          placeholder="e.g., Robotics 201"
          required
          className="classroom-list__create-input"
        />
      </div>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow required tip={CLASSROOM_FORM_TIP.instructor} ariaTopic="instructor">
          Instructor
        </ClassroomFormLabelRow>
        <div className="classroom-list__switch-row">
          <div className="classroom-list__switch-row-label-with-info">
            <label htmlFor={`${p}-include-admin-owners`}>Include admins/owners in instructor options</label>
            <FieldInfoIcon
              content={CLASSROOM_FORM_TIP.includeAdmins}
              ariaLabel="More about including admins and owners"
            />
          </div>
          <KidCheckbox
            id={`${p}-include-admin-owners`}
            checked={w.includeAdminOwners}
            onChange={w.setIncludeAdminOwners}
            ariaLabel="Include admins and owners in instructor options"
          />
        </div>
        <SearchableDropdown
          value={w.instructorId}
          onChange={(value) => {
            w.setInstructorId(value);
            w.setScheduleTouched(true);
          }}
          fullWidth
          ariaLabel="Instructor"
          searchPlaceholder="Search available instructors..."
          placeholder="Select..."
          emptyLabel={
            ctx.selectableInstructors.length === 0
              ? "No matching instructors found with current filters."
              : "No matching instructors found."
          }
          emptyActionLabel={ctx.availableInstructorCount === 0 ? "Invite instructor" : undefined}
          onEmptyAction={ctx.availableInstructorCount === 0 ? ctx.onInviteInstructors : undefined}
          disabled={ctx.loadingInstructors}
          disableSearch={ctx.selectableInstructors.length === 0}
          options={ctx.selectableInstructors.map((item) => ({
            value: item.id,
            label: item.label,
            searchText: `${item.label} ${item.email}`,
          }))}
        />
      </div>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow htmlFor={`${p}-capacity`} tip={CLASSROOM_FORM_TIP.capacity} ariaTopic="capacity">
          Capacity
        </ClassroomFormLabelRow>
        <input
          id={`${p}-capacity`}
          type="number"
          value={w.capacity}
          onChange={(e) => w.setCapacity(e.target.value)}
          min={0}
          className="classroom-list__create-input"
        />
        <p className="classroom-list__helper-copy">0 or empty = no limit</p>
      </div>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow tip={CLASSROOM_FORM_TIP.classLocation} ariaTopic="class location">
          Class location
        </ClassroomFormLabelRow>
        <KidDropdown
          value={w.deliveryMode}
          onChange={(v) => w.setDeliveryMode(v as "online" | "in-person" | "hybrid")}
          fullWidth
          ariaLabel="Class location mode"
          options={[
            { value: "online", label: "Remote / Virtual" },
            { value: "hybrid", label: "Hybrid (remote + in-person)" },
            { value: "in-person", label: "In person" },
          ]}
        />
      </div>
      {w.deliveryMode !== "in-person" && (
        <>
          <div className="classroom-list__create-field">
            <ClassroomFormLabelRow tip={CLASSROOM_FORM_TIP.meetingLink} ariaTopic="meeting link">
              Video / Meeting
            </ClassroomFormLabelRow>
            <KidDropdown
              value={w.meetingMode}
              onChange={(v) => w.setMeetingMode(v as "built_in" | "generate" | "paste")}
              fullWidth
              ariaLabel="Meeting link mode"
              options={[
                { value: "built_in", label: "Use built-in video" },
                { value: "generate", label: "Auto-generate link (external)" },
                { value: "paste", label: "Paste existing link" },
              ]}
            />
          </div>
          {w.meetingMode === "generate" && (
            <div className="classroom-list__create-field">
              <ClassroomFormLabelRow tip={CLASSROOM_FORM_TIP.meetingProvider} ariaTopic="meeting provider">
                Provider
              </ClassroomFormLabelRow>
              <KidDropdown
                value={w.meetingProvider}
                onChange={(v) => w.setMeetingProvider(v as "zoom" | "meet" | "teams")}
                fullWidth
                ariaLabel="Meeting provider"
                options={[
                  { value: "zoom", label: "Zoom" },
                  { value: "meet", label: "Google Meet" },
                  { value: "teams", label: "Microsoft Teams" },
                ]}
              />
            </div>
          )}
          {w.meetingMode === "paste" && (
            <div className="classroom-list__create-field">
              <ClassroomFormLabelRow
                htmlFor={`${p}-meeting-url`}
                tip={CLASSROOM_FORM_TIP.meetingUrl}
                ariaTopic="meeting URL"
              >
                Meeting URL
              </ClassroomFormLabelRow>
              <input
                id={`${p}-meeting-url`}
                type="url"
                value={w.manualMeetingLink}
                onChange={(e) => w.setManualMeetingLink(e.target.value)}
                className="classroom-list__create-input"
                placeholder="https://..."
              />
            </div>
          )}
        </>
      )}
      {(w.deliveryMode === "in-person" || w.deliveryMode === "hybrid") && (
        <div className="classroom-list__create-field classroom-list__create-field--full">
          <ClassroomFormLabelRow htmlFor={`${p}-address`} tip={CLASSROOM_FORM_TIP.address} ariaTopic="in-person address">
            Address{w.deliveryMode === "hybrid" ? " (optional)" : " (optional)"}
          </ClassroomFormLabelRow>
          <input
            id={`${p}-address`}
            type="text"
            value={w.locationAddress}
            onChange={(e) => w.setLocationAddress(e.target.value)}
            className="classroom-list__create-input"
            placeholder="e.g., 123 STEM Ave, Maker Room B"
          />
        </div>
      )}
      <div className="classroom-list__create-field classroom-list__create-field--full">
        <ClassroomFormLabelRow htmlFor={`${p}-desc`} tip={CLASSROOM_FORM_TIP.description} ariaTopic="description">
          Description
        </ClassroomFormLabelRow>
        <input
          id={`${p}-desc`}
          type="text"
          value={w.description}
          onChange={(e) => w.setDescription(e.target.value)}
          placeholder="Brief description of the classroom"
          className="classroom-list__create-input"
        />
      </div>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow
          htmlFor={`${p}-content-window`}
          tip={CLASSROOM_FORM_TIP.contentWindow}
          ariaTopic="content edit window"
        >
          Content edit window (hours)
        </ClassroomFormLabelRow>
        <input
          id={`${p}-content-window`}
          type="number"
          value={w.contentWindow}
          onChange={(e) => w.setContentWindow(e.target.value)}
          min={1}
          max={720}
          className="classroom-list__create-input"
        />
      </div>
    </>
  );
}

export function ClassroomWizardProgramCurriculumStep({ w, ctx }: { w: ClassroomWizardState; ctx: ClassroomWizardPanelContext }) {
  return (
    <>
      <p className="classroom-list__create-step-intro classroom-list__create-field--full">
        Link a program and curriculum if you use them, and choose which labs students can open. Everything here is optional—you
        can skip and set this up later.
      </p>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow tip={CLASSROOM_FORM_TIP.program} ariaTopic="program">
          Program
        </ClassroomFormLabelRow>
        <SearchableDropdown
          value={w.programId}
          onChange={w.setProgramId}
          fullWidth
          ariaLabel="Program"
          searchPlaceholder="Search programs..."
          placeholder="Optional"
          disabled={ctx.programLockedByCurriculum}
          disableSearch={ctx.programLockedByCurriculum}
          options={ctx.programs.map((program) => ({
            value: program.id,
            label: program.name,
            searchText: `${program.name} ${program.description ?? ""}`,
          }))}
        />
        {ctx.programLockedByCurriculum && (
          <p className="classroom-list__helper-copy">
            Auto-assigned from the selected curriculum's program. Change the curriculum to pick a different program.
          </p>
        )}
      </div>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow tip={CLASSROOM_FORM_TIP.curriculum} ariaTopic="curriculum">
          Curriculum
        </ClassroomFormLabelRow>
        <SearchableDropdown
          value={w.curriculumId}
          onChange={w.setCurriculumId}
          fullWidth
          ariaLabel="Curriculum"
          searchPlaceholder="Search curricula..."
          placeholder="Optional (quick setup if empty)"
          options={ctx.curriculumOptions}
        />
        <p className="classroom-list__helper-copy">
          {w.curriculumId
            ? "Linked class — permitted labs below may follow this curriculum’s defaults (you can still change them)."
            : "Quick setup (unlinked)"}
        </p>
      </div>
      <div className="classroom-list__create-field classroom-list__create-field--full">
        <ClassroomFormLabelRow tip={CLASSROOM_FORM_TIP.permittedLabs} ariaTopic="permitted labs">
          Permitted labs
        </ClassroomFormLabelRow>
        <div className="classroom-list__chip-group">
          {PERMITTED_LAB_OPTIONS.map((lab) => (
            <button
              key={lab}
              type="button"
              className={`classroom-list__chip ${w.permittedLabs.includes(lab) ? "classroom-list__chip--active" : ""}`}
              onClick={() => toggleChip(lab, w.setPermittedLabs)}
            >
              {lab}
            </button>
          ))}
        </div>
      </div>
      <div className="classroom-list__create-field classroom-list__create-field--full">
        <ClassroomFormLabelRow ariaTopic="optional lesson assignments">
          Optional lesson assignments
        </ClassroomFormLabelRow>
        <p className="classroom-list__helper-copy">
          Pick lessons to auto-assign when you save this classroom.
        </p>
        <div className="track-lessons-actions">
          <button
            type="button"
            className="kid-button kid-button--ghost"
            onClick={ctx.onOpenLessonPicker}
          >
            {ctx.selectedLessonIds.length > 0
              ? `Manage lessons (${ctx.selectedLessonIds.length})`
              : "Add lessons (optional)"}
          </button>
        </div>
        {ctx.selectedLessonIds.length > 0 ? (
          <p className="classroom-list__helper-copy">
            Selected: {ctx.selectedLessonIds
              .map((id) => ctx.lessonOptions.find((item) => item.id === id)?.label ?? id)
              .slice(0, 3)
              .join(", ")}
            {ctx.selectedLessonIds.length > 3 ? ` +${ctx.selectedLessonIds.length - 3} more` : ""}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function ClassroomWizardScheduleStep({ w, ctx }: { w: ClassroomWizardState; ctx: ClassroomWizardPanelContext }) {
  const p = ctx.idPrefix;
  return (
    <>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow required tip={CLASSROOM_FORM_TIP.timezone} ariaTopic="timezone">
          Timezone
        </ClassroomFormLabelRow>
        <SearchableDropdown
          value={w.timeZone}
          onChange={w.setTimeZone}
          fullWidth
          ariaLabel="Timezone"
          placeholder="Select timezone"
          searchPlaceholder="Search timezone..."
          options={ctx.timeZoneOptions}
        />
      </div>
      <div className="classroom-list__create-field">
        <ClassroomFormLabelRow required tip={CLASSROOM_FORM_TIP.meetingDay} ariaTopic="meeting day">
          Meeting day
        </ClassroomFormLabelRow>
        <div className="classroom-list__chip-group" role="group" aria-label="Meeting days of the week">
          {CLASSROOM_FORM_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={`classroom-list__chip ${w.selectedDays.includes(day) ? "classroom-list__chip--active" : ""}`}
              onClick={() => {
                toggleChip(day, w.setSelectedDays);
                w.setScheduleTouched(true);
              }}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="classroom-list__checkbox-inline-with-info">
          <KidCheckbox
            id={`${p}-recurring`}
            className="classroom-list__checkbox-inline"
            checked={w.isRecurring}
            onChange={(v) => {
              w.setIsRecurring(v);
              w.setScheduleTouched(true);
            }}
          >
            Recurring class
          </KidCheckbox>
          <FieldInfoIcon content={CLASSROOM_FORM_TIP.recurring} ariaLabel="More about recurring class" />
        </div>
      </div>
      <div className="classroom-list__create-field classroom-list__create-field--full">
        <ClassroomFormLabelRow required tip={CLASSROOM_FORM_TIP.meetingTime} ariaTopic="meeting time">
          Meeting time
        </ClassroomFormLabelRow>
        <div className="classroom-list__time-range">
          <div className="classroom-list__time-range-item">
            <ClassroomFormLabelRow required tip={CLASSROOM_FORM_TIP.startTime} ariaTopic="start time">
              Start time
            </ClassroomFormLabelRow>
            <TimePicker
              value={w.startTime}
              onChange={(value) => {
                w.setStartTime(value);
                w.setScheduleTouched(true);
                w.setTimeTouched(true);
              }}
              placeholder="Select start time"
              minuteStep={15}
              error={
                ctx.invalidTimeRange && w.startTime && w.endTime
                  ? "Start must be before end"
                  : null
              }
            />
          </div>
          <div className="classroom-list__time-range-item">
            <ClassroomFormLabelRow required tip={CLASSROOM_FORM_TIP.endTime} ariaTopic="end time">
              End time
            </ClassroomFormLabelRow>
            <TimePicker
              value={w.endTime}
              onChange={(value) => {
                w.setEndTime(value);
                w.setScheduleTouched(true);
                w.setTimeTouched(true);
              }}
              placeholder="Select end time"
              minuteStep={15}
              min={w.startTime || undefined}
              error={
                ctx.invalidTimeRange && w.startTime && w.endTime
                  ? "End must be after start"
                  : null
              }
            />
          </div>
        </div>
        {ctx.invalidTimeRange && w.startTime && w.endTime && (
          <p className="classroom-list__create-error" role="alert">
            End time must be after start time.
          </p>
        )}
      </div>
    </>
  );
}
