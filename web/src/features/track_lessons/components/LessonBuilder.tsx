import { useEffect, useMemo, useState } from "react";

import {
  createTenantQuiz,
  listTenantQuizVersions,
  listTenantQuizzes,
  updateTenantQuiz,
  uploadLocalMedia,
  type LessonPayload,
  type QuizSummary,
  type QuizVersion,
} from "../../../lib/api/trackLessons";
import { getAssetLibrary } from "../../../lib/api/assets";
import { KidCheckbox, KidDialog, KidDropdown } from "../../../components/ui";
import { MediaSelector } from "./MediaSelector";

const GRADE_OPTIONS = [
  "",
  "K",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;

const LAB_OPTIONS = [
  { id: "", label: "No lab linked" },
  { id: "circuit-maker", label: "Circuit Maker" },
  { id: "robotics-lab", label: "Robo Maker" },
  { id: "python-game-maker", label: "Python Game Maker" },
  { id: "game-maker", label: "Game Maker" },
  { id: "design-maker", label: "Design Maker" },
  { id: "mcu", label: "MCU Lab" },
] as const;

function formatAssetTypeLabel(assetType?: string) {
  if (!assetType) return "File";
  return assetType.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

type QuizQuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_answer";

type QuizBuilderQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices: string[];
  correctChoiceIndexes: number[];
  expectedAnswer: string;
};

const QUIZ_QUESTION_TYPE_OPTIONS: Array<{ value: QuizQuestionType; label: string }> = [
  { value: "single_choice", label: "Single choice" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short answer" },
];

function createQuestionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBuilderQuestion(type: QuizQuestionType = "single_choice"): QuizBuilderQuestion {
  if (type === "true_false") {
    return {
      id: createQuestionId(),
      type,
      prompt: "",
      choices: ["True", "False"],
      correctChoiceIndexes: [0],
      expectedAnswer: "",
    };
  }
  if (type === "short_answer") {
    return {
      id: createQuestionId(),
      type,
      prompt: "",
      choices: [],
      correctChoiceIndexes: [],
      expectedAnswer: "",
    };
  }
  return {
    id: createQuestionId(),
    type,
    prompt: "",
    choices: ["Option 1", "Option 2"],
    correctChoiceIndexes: [0],
    expectedAnswer: "",
  };
}

function readQuestionsFromQuizSchema(schema?: Record<string, unknown>) {
  const rawQuestions = Array.isArray(schema?.questions) ? schema.questions as Array<Record<string, unknown>> : [];
  const parsed = rawQuestions.map((question) => {
    const type = (question.type as QuizQuestionType) || "single_choice";
    const choices = Array.isArray(question.choices) ? question.choices.map((item) => String(item)) : [];
    const correctChoiceIndexes = Array.isArray(question.correct_choice_indexes)
      ? question.correct_choice_indexes.map((item) => Number(item)).filter((item) => Number.isInteger(item))
      : [];
    return {
      id: typeof question.id === "string" ? question.id : createQuestionId(),
      type,
      prompt: typeof question.prompt === "string" ? question.prompt : "",
      choices:
        type === "short_answer"
          ? []
          : type === "true_false"
            ? ["True", "False"]
            : choices.length >= 2
              ? choices
              : ["Option 1", "Option 2"],
      correctChoiceIndexes:
        type === "short_answer"
          ? []
          : type === "true_false"
            ? [correctChoiceIndexes[0] === 1 ? 1 : 0]
            : correctChoiceIndexes.length
              ? correctChoiceIndexes
              : [0],
      expectedAnswer: typeof question.expected_answer === "string" ? question.expected_answer : "",
    } satisfies QuizBuilderQuestion;
  });
  return parsed.length ? parsed : [createBuilderQuestion()];
}

type LessonBuilderProps = {
  onSubmit: (payload: LessonPayload) => Promise<void> | void;
  formTitle?: string;
  onCancel?: () => void;
};

export function LessonBuilder({ onSubmit, formTitle = "Lesson builder", onCancel }: LessonBuilderProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [transcript, setTranscript] = useState("");
  const [videoProvider, setVideoProvider] = useState<"youtube" | "r2">("youtube");
  const [videoSource, setVideoSource] = useState("");
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [materialTitle, setMaterialTitle] = useState("Learning material");
  const [materialUrl, setMaterialUrl] = useState("");
  const [materialNotes, setMaterialNotes] = useState("");
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [materialSearchInput, setMaterialSearchInput] = useState("");
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");
  const [materialPickerLoading, setMaterialPickerLoading] = useState(false);
  const [materialPickerError, setMaterialPickerError] = useState<string | null>(null);
  const [materialAssets, setMaterialAssets] = useState<Array<{ id: string; name: string; blob_key?: string; asset_type?: string }>>([]);
  const [selectedMaterialAssetId, setSelectedMaterialAssetId] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState("Quiz");
  const [quizUrl, setQuizUrl] = useState("");
  const [quizNotes, setQuizNotes] = useState("");
  const [quizPickerOpen, setQuizPickerOpen] = useState(false);
  const [quizSearchInput, setQuizSearchInput] = useState("");
  const [quizSearchQuery, setQuizSearchQuery] = useState("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizLoadError, setQuizLoadError] = useState<string | null>(null);
  const [quizRows, setQuizRows] = useState<QuizSummary[]>([]);
  const [selectedQuizIds, setSelectedQuizIds] = useState<string[]>([]);
  const [quickQuizTitle, setQuickQuizTitle] = useState("");
  const [creatingQuickQuiz, setCreatingQuickQuiz] = useState(false);
  const [quizBuilderOpen, setQuizBuilderOpen] = useState(false);
  const [quizBuilderTitle, setQuizBuilderTitle] = useState("");
  const [quizBuilderInstructions, setQuizBuilderInstructions] = useState("");
  const [quizBuilderQuestions, setQuizBuilderQuestions] = useState<QuizBuilderQuestion[]>([createBuilderQuestion()]);
  const [quizBuilderError, setQuizBuilderError] = useState<string | null>(null);
  const [creatingBuilderQuiz, setCreatingBuilderQuiz] = useState(false);
  const [quizBuilderEditingQuizId, setQuizBuilderEditingQuizId] = useState<string | null>(null);
  const [quizBuilderVersions, setQuizBuilderVersions] = useState<QuizVersion[]>([]);
  const selectedMaterialAsset = useMemo(
    () => materialAssets.find((asset) => asset.id === selectedMaterialAssetId) ?? null,
    [materialAssets, selectedMaterialAssetId],
  );
  const filteredMaterialAssets = useMemo(() => {
    const needle = materialSearchQuery.trim().toLowerCase();
    return materialAssets
      .filter((asset) => asset.asset_type !== "video")
      .filter((asset) => {
        if (!needle) return true;
        return `${asset.name} ${asset.blob_key ?? ""} ${asset.asset_type ?? ""}`.toLowerCase().includes(needle);
      });
  }, [materialAssets, materialSearchQuery]);
  const filteredQuizzes = useMemo(() => {
    const needle = quizSearchQuery.trim().toLowerCase();
    return quizRows.filter((quiz) => {
      if (!needle) return true;
      return `${quiz.title} ${quiz.description ?? ""}`.toLowerCase().includes(needle);
    });
  }, [quizRows, quizSearchQuery]);
  const selectedQuizzes = useMemo(
    () => selectedQuizIds.map((quizId) => quizRows.find((quiz) => quiz.id === quizId)).filter(Boolean) as QuizSummary[],
    [quizRows, selectedQuizIds],
  );

  useEffect(() => {
    if (!materialPickerOpen) return;
    let cancelled = false;
    setMaterialPickerLoading(true);
    setMaterialPickerError(null);
    void getAssetLibrary()
      .then((library) => {
        if (cancelled) return;
        const rows = [...library.own, ...library.shared].map((asset) => ({
          id: asset.id,
          name: asset.name,
          blob_key: asset.blob_key,
          asset_type: asset.asset_type,
        }));
        setMaterialAssets(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        setMaterialPickerError(error instanceof Error ? error.message : "Failed to load files");
      })
      .finally(() => {
        if (cancelled) return;
        setMaterialPickerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [materialPickerOpen]);
  useEffect(() => {
    if (!quizPickerOpen) return;
    let cancelled = false;
    setQuizLoading(true);
    setQuizLoadError(null);
    void listTenantQuizzes(true)
      .then((rows) => {
        if (cancelled) return;
        setQuizRows(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        setQuizLoadError(error instanceof Error ? error.message : "Failed to load quizzes");
      })
      .finally(() => {
        if (cancelled) return;
        setQuizLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quizPickerOpen]);

  const [lab, setLab] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState("tenant_only");

  const pushTags = (raw: string) => {
    const parsed = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!parsed.length) return;
    setTags((prev) => {
      const next = [...prev];
      for (const tag of parsed) {
        if (!next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
          next.push(tag);
        }
      }
      return next;
    });
  };

  const handleLocalUpload = async (file: File) => {
    setVideoUploadError(null);
    setIsUploadingVideo(true);
    try {
      const uploaded = await uploadLocalMedia(file);
      setVideoProvider("r2");
      setVideoSource(uploaded.storage_key);
    } catch (error) {
      setVideoUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const resetQuizBuilder = () => {
    setQuizBuilderTitle("");
    setQuizBuilderInstructions("");
    setQuizBuilderQuestions([createBuilderQuestion()]);
    setQuizBuilderError(null);
    setQuizBuilderEditingQuizId(null);
    setQuizBuilderVersions([]);
  };

  const createQuizFromBuilder = async () => {
    const titleValue = quizBuilderTitle.trim();
    if (!titleValue) {
      setQuizBuilderError("Quiz title is required.");
      return;
    }
    const normalizedQuestions = quizBuilderQuestions.map((question) => {
      const cleanedChoices = question.choices.map((choice) => choice.trim()).filter(Boolean);
      const cleanedIndexes = question.correctChoiceIndexes.filter((idx) => idx >= 0 && idx < cleanedChoices.length);
      const expectedAnswers = question.expectedAnswer
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        ...question,
        prompt: question.prompt.trim(),
        choices: question.type === "short_answer" ? [] : (question.type === "true_false" ? ["True", "False"] : cleanedChoices),
        correctChoiceIndexes:
          question.type === "short_answer"
            ? []
            : question.type === "true_false"
              ? [cleanedIndexes[0] === 1 ? 1 : 0]
              : cleanedIndexes,
        expectedAnswer: expectedAnswers.join(", "),
        expectedAnswers,
      };
    });
    const hasInvalidPrompt = normalizedQuestions.some((question) => !question.prompt);
    if (hasInvalidPrompt) {
      setQuizBuilderError("Every question needs a prompt.");
      return;
    }
    const hasInvalidChoiceQuestion = normalizedQuestions.some((question) => {
      if (question.type === "short_answer") return false;
      if (question.choices.length < 2) return true;
      if (question.correctChoiceIndexes.length === 0) return true;
      return false;
    });
    if (hasInvalidChoiceQuestion) {
      setQuizBuilderError("Choice-based questions need at least two options and one correct answer.");
      return;
    }
    const hasInvalidShortAnswer = normalizedQuestions.some(
      (question) => question.type === "short_answer" && question.expectedAnswers.length === 0,
    );
    if (hasInvalidShortAnswer) {
      setQuizBuilderError("Short-answer questions need at least one accepted answer.");
      return;
    }
    setQuizBuilderError(null);
    setCreatingBuilderQuiz(true);
    try {
      const payload = {
        title: titleValue,
        instructions: quizBuilderInstructions.trim() || undefined,
        status: "draft",
        visibility: "tenant_only",
        schema_json: {
          version: 1,
          questions: normalizedQuestions.map((question, index) => ({
            id: question.id,
            order_index: index,
            type: question.type,
            prompt: question.prompt,
            choices: question.choices,
            correct_choice_indexes: question.correctChoiceIndexes,
            expected_answer: question.expectedAnswers[0] || undefined,
            expected_answers: question.expectedAnswers,
          })),
        },
      };
      const created = quizBuilderEditingQuizId
        ? await updateTenantQuiz(quizBuilderEditingQuizId, payload)
        : await createTenantQuiz(payload);
      setQuizRows((prev) => [created, ...prev.filter((quiz) => quiz.id !== created.id)]);
      setSelectedQuizIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setQuizBuilderOpen(false);
      resetQuizBuilder();
    } catch (error) {
      setQuizBuilderError(error instanceof Error ? error.message : "Failed to create quiz");
    } finally {
      setCreatingBuilderQuiz(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (tagInput.trim()) {
      pushTags(tagInput);
      setTagInput("");
    }
    const finalTags = [
      ...tags,
      ...tagInput.split(",").map((item) => item.trim()).filter(Boolean),
    ].filter((value, index, arr) => arr.findIndex((v) => v.toLowerCase() === value.toLowerCase()) === index);
    const payload: LessonPayload = {
      title,
      summary,
      subject,
      grade: grade || undefined,
      tags: finalTags,
      visibility,
      video: videoSource
        ? { provider: videoProvider, provider_ref: videoSource }
        : null,
      transcript,
      resources: [
        selectedMaterialAsset || materialUrl || materialNotes
          ? {
              resource_type: "worksheet",
              title: materialTitle || "Learning material",
              body: materialNotes || undefined,
              url: materialUrl || undefined,
              metadata: selectedMaterialAsset
                ? {
                    asset_id: selectedMaterialAsset.id,
                    blob_key: selectedMaterialAsset.blob_key,
                    source: "tenant_asset",
                  }
                : undefined,
            }
          : null,
        quizUrl || quizNotes
          ? {
              resource_type: "quiz",
              title: quizTitle || "Quiz",
              body: quizNotes || undefined,
              url: quizUrl || undefined,
            }
          : null,
        lab
          ? {
              resource_type: "lab",
              title: "Lab",
              body: lab,
              metadata: { lab_id: lab },
            }
          : null,
        notes ? { resource_type: "notes", title: "Notes", body: notes } : null,
      ].filter(Boolean) as LessonPayload["resources"],
      quiz_ids: selectedQuizIds,
    };
    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="track-lessons-form">
      <h3>{formTitle}</h3>
      <label className="ui-form-field">
        <span>Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="ui-form-field">
        <span>Summary</span>
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
      </label>
      <div className="track-lessons-inline-grid">
        <label className="ui-form-field">
          <span>Subject</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className="ui-form-field">
          <span>Grade (optional)</span>
          <KidDropdown
            value={grade}
            onChange={setGrade}
            ariaLabel="Lesson grade"
            fullWidth
            options={GRADE_OPTIONS.map((option) => ({
              value: option,
              label: option ? `Grade ${option}` : "Any grade",
            }))}
          />
        </label>
      </div>
      <label className="ui-form-field">
        <span>Tags</span>
        <div className="track-lessons-tags-wrap">
          {tags.map((tag) => (
            <span key={tag} className="track-lessons-tag-pill">
              {tag}
              <button
                type="button"
                className="track-lessons-tag-remove"
                aria-label={`Remove ${tag}`}
                onClick={() => setTags((prev) => prev.filter((item) => item !== tag))}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "," || event.key === "Enter") {
                event.preventDefault();
                pushTags(tagInput);
                setTagInput("");
              }
            }}
            onBlur={() => {
              if (!tagInput.trim()) return;
              pushTags(tagInput);
              setTagInput("");
            }}
            placeholder="Type a tag and press comma"
          />
        </div>
      </label>
      <MediaSelector
        provider={videoProvider}
        source={videoSource}
        onProviderChange={setVideoProvider}
        onSourceChange={setVideoSource}
        onUploadLocalFile={handleLocalUpload}
        isUploadingLocalFile={isUploadingVideo}
        localUploadError={videoUploadError}
      />
      <label className="ui-form-field">
        <span>Transcript</span>
        <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={4} placeholder="Paste transcript text (optional for now)" />
      </label>
      <p className="track-lessons-help">
        For now transcript is manual. Next step should be background transcription after upload (e.g. queue + worker).
      </p>
      <label className="ui-form-field">
        <span>Learning material title</span>
        <input value={materialTitle} onChange={(event) => setMaterialTitle(event.target.value)} />
      </label>
      <div className="track-lessons-inline-grid">
        <label className="ui-form-field">
          <span>Linked material file</span>
          <div className="track-lessons-actions">
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => {
                setMaterialPickerOpen(true);
                setMaterialSearchInput("");
                setMaterialSearchQuery("");
              }}
            >
              Browse tenant files
            </button>
            {selectedMaterialAsset ? (
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => setSelectedMaterialAssetId(null)}
              >
                Clear selection
              </button>
            ) : null}
          </div>
          <p className="track-lessons-help">
            {selectedMaterialAsset
              ? `Selected: ${selectedMaterialAsset.name}${selectedMaterialAsset.blob_key ? ` (${selectedMaterialAsset.blob_key})` : ""}`
              : "No file selected yet."}
          </p>
        </label>
        <label className="ui-form-field">
          <span>Material notes</span>
          <input value={materialNotes} onChange={(event) => setMaterialNotes(event.target.value)} placeholder="Optional teacher instructions" />
        </label>
      </div>
      <label className="ui-form-field">
        <span>External material URL (optional fallback)</span>
        <input
          value={materialUrl}
          onChange={(event) => {
            const next = event.target.value;
            setMaterialUrl(next);
            if (next.trim()) {
              setSelectedMaterialAssetId(null);
            }
          }}
          placeholder={selectedMaterialAsset ? "Clear selected file to use URL" : "https://..."}
          disabled={Boolean(selectedMaterialAsset)}
        />
      </label>
      {selectedMaterialAsset ? (
        <p className="track-lessons-help">
          Linked material source is set to tenant file. Clear selected file to switch to external URL.
        </p>
      ) : null}
      <label className="ui-form-field">
        <span>Quiz title</span>
        <input value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} />
      </label>
      <label className="ui-form-field">
        <span>Attach existing quizzes</span>
        <div className="track-lessons-actions">
          <button
            type="button"
            className="kid-button kid-button--ghost"
            onClick={() => {
              setQuizPickerOpen(true);
              setQuizSearchInput("");
              setQuizSearchQuery("");
            }}
          >
            Browse quizzes
          </button>
          {selectedQuizIds.length ? (
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => setSelectedQuizIds([])}
            >
              Clear attached
            </button>
          ) : null}
        </div>
        <p className="track-lessons-help">
          {selectedQuizIds.length
            ? `${selectedQuizIds.length} quiz${selectedQuizIds.length > 1 ? "zes" : ""} attached.`
            : "No linked quizzes yet."}
        </p>
        {selectedQuizzes.length ? (
          <div className="track-lessons-tags-wrap">
            {selectedQuizzes.map((quiz) => (
              <span key={quiz.id} className="track-lessons-tag-pill">
                {quiz.title}
                <button
                  type="button"
                  className="track-lessons-tag-remove"
                  aria-label={`Remove ${quiz.title}`}
                  onClick={() => setSelectedQuizIds((prev) => prev.filter((id) => id !== quiz.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </label>
      <div className="track-lessons-inline-grid">
        <label className="ui-form-field">
          <span>Quiz URL</span>
          <input value={quizUrl} onChange={(event) => setQuizUrl(event.target.value)} placeholder="https://..." />
        </label>
        <label className="ui-form-field">
          <span>Quiz notes</span>
          <input value={quizNotes} onChange={(event) => setQuizNotes(event.target.value)} placeholder="Optional quiz context" />
        </label>
      </div>
      <p className="track-lessons-help">
        Quizzes now support a form builder. You can also link an external quiz URL when needed.
      </p>
      <label className="ui-form-field">
        <span>Lab (optional)</span>
        <KidDropdown
          value={lab}
          onChange={setLab}
          ariaLabel="Lesson lab"
          fullWidth
          options={LAB_OPTIONS.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
        />
      </label>
      <label className="ui-form-field">
        <span>Notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
      </label>
      <label className="ui-form-field">
        <span>Visibility</span>
        <KidDropdown
          value={visibility}
          onChange={setVisibility}
          ariaLabel="Lesson visibility"
          fullWidth
          options={[
            { value: "public", label: "Public" },
            { value: "platform_private", label: "Platform private" },
            { value: "tenant_only", label: "Tenant only" },
            { value: "classroom_only", label: "Classroom only" },
            { value: "draft", label: "Draft" },
          ]}
        />
      </label>
      <div className="track-lessons-form-actions">
        <button
          type="button"
          className="track-lessons-cancel-button"
          onClick={() => onCancel?.()}
        >
          Cancel
        </button>
        <button type="submit" className="kid-button">Save lesson</button>
      </div>
      <KidDialog
        isOpen={materialPickerOpen}
        onClose={() => setMaterialPickerOpen(false)}
        closeVariant="neutral"
        title="Select linked material"
        showActions={false}
      >
        <div className="track-lessons-lesson-picker">
          <label className="ui-form-field">
            <span>Search files</span>
            <div className="track-lessons-lesson-picker__search">
              <input
                value={materialSearchInput}
                onChange={(event) => setMaterialSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  setMaterialSearchQuery(materialSearchInput);
                }}
                placeholder="Search by file name"
              />
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => setMaterialSearchQuery(materialSearchInput)}
              >
                Search
              </button>
            </div>
          </label>
          <div className="track-lessons-lesson-picker__list">
            {materialPickerLoading ? (
              <div className="track-lessons-lesson-picker__empty">
                <p className="track-lessons-help">Loading tenant files...</p>
              </div>
            ) : null}
            {materialPickerError ? (
              <div className="track-lessons-lesson-picker__empty">
                <p className="track-lessons-help">{materialPickerError}</p>
              </div>
            ) : null}
            {!materialPickerLoading && !materialPickerError && filteredMaterialAssets.length === 0 ? (
              <div className="track-lessons-lesson-picker__empty">
                <p className="track-lessons-help">No files found for your tenant.</p>
              </div>
            ) : (
              filteredMaterialAssets.map((asset) => (
                <label
                  key={asset.id}
                  className={`track-lessons-lesson-picker__item ${selectedMaterialAssetId === asset.id ? "track-lessons-lesson-picker__item--selected" : ""}`}
                >
                  <KidCheckbox
                    checked={selectedMaterialAssetId === asset.id}
                    compact
                    ariaLabel={`Select ${asset.name}`}
                    onChange={(nextChecked) => {
                      if (!nextChecked) return;
                      setSelectedMaterialAssetId(asset.id);
                      setMaterialUrl("");
                    }}
                  />
                  <div className="track-lessons-lesson-picker__content">
                    <span className="track-lessons-lesson-picker__title">{asset.name}</span>
                    <span className="track-lessons-lesson-picker__meta">
                      <span className="track-lessons-lesson-picker__badge">{formatAssetTypeLabel(asset.asset_type)}</span>
                      {asset.blob_key ? <span className="track-lessons-lesson-picker__path">{asset.blob_key}</span> : null}
                    </span>
                  </div>
                </label>
              ))
            )}
          </div>
          <div className="track-lessons-actions">
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => setMaterialPickerOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="kid-button"
              disabled={!selectedMaterialAssetId}
              onClick={() => setMaterialPickerOpen(false)}
            >
              Use selected file
            </button>
          </div>
        </div>
      </KidDialog>
      <KidDialog
        isOpen={quizPickerOpen}
        onClose={() => setQuizPickerOpen(false)}
        closeVariant="neutral"
        title="Attach quizzes"
        showActions={false}
      >
        <div className="track-lessons-lesson-picker">
          <label className="ui-form-field">
            <span>Search quizzes</span>
            <div className="track-lessons-lesson-picker__search">
              <input
                value={quizSearchInput}
                onChange={(event) => setQuizSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  setQuizSearchQuery(quizSearchInput);
                }}
                placeholder="Search by quiz title"
              />
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => setQuizSearchQuery(quizSearchInput)}
              >
                Search
              </button>
            </div>
          </label>
          <label className="ui-form-field">
            <span>Quick create quiz</span>
            <div className="track-lessons-lesson-picker__search">
              <input
                value={quickQuizTitle}
                onChange={(event) => setQuickQuizTitle(event.target.value)}
                placeholder="Quiz title"
              />
              <button
                type="button"
                className="kid-button"
                disabled={!quickQuizTitle.trim() || creatingQuickQuiz}
                onClick={async () => {
                  if (!quickQuizTitle.trim()) return;
                  setCreatingQuickQuiz(true);
                  setQuizLoadError(null);
                  try {
                    const created = await createTenantQuiz({
                      title: quickQuizTitle.trim(),
                      status: "draft",
                      visibility: "tenant_only",
                      schema_json: {},
                    });
                    setQuizRows((prev) => [created, ...prev.filter((quiz) => quiz.id !== created.id)]);
                    setSelectedQuizIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
                    setQuickQuizTitle("");
                  } catch (error) {
                    setQuizLoadError(error instanceof Error ? error.message : "Failed to create quiz");
                  } finally {
                    setCreatingQuickQuiz(false);
                  }
                }}
              >
                {creatingQuickQuiz ? "Creating..." : "Create"}
              </button>
            </div>
          </label>
          <div className="track-lessons-actions">
              <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => {
                setQuizPickerOpen(false);
                resetQuizBuilder();
                setQuizBuilderOpen(true);
              }}
            >
              Open quiz builder
            </button>
          </div>
          <div className="track-lessons-lesson-picker__list">
            {quizLoading ? (
              <div className="track-lessons-lesson-picker__empty">
                <p className="track-lessons-help">Loading quizzes...</p>
              </div>
            ) : null}
            {quizLoadError ? (
              <div className="track-lessons-lesson-picker__empty">
                <p className="track-lessons-help">{quizLoadError}</p>
              </div>
            ) : null}
            {!quizLoading && !quizLoadError && filteredQuizzes.length === 0 ? (
              <div className="track-lessons-lesson-picker__empty">
                <p className="track-lessons-help">No quizzes found.</p>
              </div>
            ) : (
              filteredQuizzes.map((quiz) => {
                const checked = selectedQuizIds.includes(quiz.id);
                return (
                  <label
                    key={quiz.id}
                    className={`track-lessons-lesson-picker__item ${checked ? "track-lessons-lesson-picker__item--selected" : ""}`}
                  >
                    <KidCheckbox
                      checked={checked}
                      compact
                      ariaLabel={`Select quiz ${quiz.title}`}
                      onChange={() =>
                        setSelectedQuizIds((prev) =>
                          prev.includes(quiz.id) ? prev.filter((id) => id !== quiz.id) : [...prev, quiz.id],
                        )
                      }
                    />
                    <div className="track-lessons-lesson-picker__content">
                      <span className="track-lessons-lesson-picker__title">{quiz.title}</span>
                      <span className="track-lessons-lesson-picker__meta">
                        <span className="track-lessons-lesson-picker__badge">
                          {quiz.owner_type === "stemplitude" ? "Platform" : "Tenant"}
                        </span>
                        <span className="track-lessons-lesson-picker__path">{quiz.status}</span>
                      </span>
                    </div>
                    {quiz.owner_type !== "stemplitude" ? (
                      <button
                        type="button"
                        className="kid-button kid-button--ghost"
                        onClick={async (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setQuizBuilderEditingQuizId(quiz.id);
                          setQuizBuilderTitle(quiz.title);
                          setQuizBuilderInstructions(quiz.instructions ?? "");
                          setQuizBuilderQuestions(readQuestionsFromQuizSchema(quiz.schema_json));
                          setQuizBuilderError(null);
                          setQuizBuilderVersions([]);
                          try {
                            const versions = await listTenantQuizVersions(quiz.id);
                            setQuizBuilderVersions(versions);
                          } catch {
                            setQuizBuilderVersions([]);
                          }
                          setQuizPickerOpen(false);
                          setQuizBuilderOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>
          <div className="track-lessons-actions">
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => setQuizPickerOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="kid-button"
              onClick={() => setQuizPickerOpen(false)}
            >
              Done ({selectedQuizIds.length})
            </button>
          </div>
        </div>
      </KidDialog>
      <KidDialog
        isOpen={quizBuilderOpen}
        onClose={() => {
          setQuizBuilderOpen(false);
          resetQuizBuilder();
        }}
        closeVariant="neutral"
        layout="fullscreen"
        title={quizBuilderEditingQuizId ? "Edit quiz" : "Build quiz"}
        showActions={false}
      >
        <div className="track-lessons-lesson-picker">
          <label className="ui-form-field">
            <span>Quiz title</span>
            <input
              value={quizBuilderTitle}
              onChange={(event) => setQuizBuilderTitle(event.target.value)}
              placeholder="e.g. Electricity quiz"
            />
          </label>
          <label className="ui-form-field">
            <span>Instructions (optional)</span>
            <textarea
              value={quizBuilderInstructions}
              onChange={(event) => setQuizBuilderInstructions(event.target.value)}
              rows={3}
              placeholder="Student instructions"
            />
          </label>
          <div className="track-lessons-quiz-builder">
            {quizBuilderQuestions.map((question, index) => (
              <div key={question.id} className="track-lessons-quiz-builder__question">
                <div className="track-lessons-actions">
                  <strong>Question {index + 1}</strong>
                  <button
                    type="button"
                    className="kid-button kid-button--ghost"
                    onClick={() =>
                      setQuizBuilderQuestions((prev) =>
                        prev.length <= 1 ? prev : prev.filter((row) => row.id !== question.id),
                      )
                    }
                    disabled={quizBuilderQuestions.length <= 1}
                  >
                    Remove
                  </button>
                </div>
                <label className="ui-form-field">
                  <span>Type</span>
                  <KidDropdown
                    value={question.type}
                    onChange={(value) =>
                      setQuizBuilderQuestions((prev) =>
                        prev.map((row) => {
                          if (row.id !== question.id) return row;
                          const nextType = value as QuizQuestionType;
                          if (nextType === "true_false") {
                            return { ...row, type: nextType, choices: ["True", "False"], correctChoiceIndexes: [0], expectedAnswer: "" };
                          }
                          if (nextType === "short_answer") {
                            return { ...row, type: nextType, choices: [], correctChoiceIndexes: [], expectedAnswer: row.expectedAnswer ?? "" };
                          }
                          return {
                            ...row,
                            type: nextType,
                            choices: row.choices.length >= 2 ? row.choices : ["Option 1", "Option 2"],
                            correctChoiceIndexes: row.correctChoiceIndexes.length ? row.correctChoiceIndexes : [0],
                            expectedAnswer: "",
                          };
                        }),
                      )
                    }
                    ariaLabel={`Question ${index + 1} type`}
                    fullWidth
                    options={QUIZ_QUESTION_TYPE_OPTIONS}
                  />
                </label>
                <label className="ui-form-field">
                  <span>Prompt</span>
                  <input
                    value={question.prompt}
                    onChange={(event) =>
                      setQuizBuilderQuestions((prev) =>
                        prev.map((row) => (row.id === question.id ? { ...row, prompt: event.target.value } : row)),
                      )
                    }
                    placeholder="Question prompt"
                  />
                </label>
                {question.type === "short_answer" ? (
                  <label className="ui-form-field">
                    <span>Accepted answer(s) (comma-separated)</span>
                    <input
                      value={question.expectedAnswer}
                      onChange={(event) =>
                        setQuizBuilderQuestions((prev) =>
                          prev.map((row) => (row.id === question.id ? { ...row, expectedAnswer: event.target.value } : row)),
                        )
                      }
                      placeholder="e.g. Ohm's Law, V = I * R"
                    />
                  </label>
                ) : (
                  <>
                    <p className="track-lessons-help">
                      Mark the correct answer using the selector beside each option.
                    </p>
                    <div className="track-lessons-quiz-builder__choices">
                      {question.choices.map((choice, choiceIndex) => {
                        const selected = question.correctChoiceIndexes.includes(choiceIndex);
                        return (
                          <div key={`${question.id}-${choiceIndex}`} className="track-lessons-quiz-builder__choice-row">
                            <input
                              type={question.type === "multiple_choice" ? "checkbox" : "radio"}
                              checked={selected}
                              onChange={() =>
                                setQuizBuilderQuestions((prev) =>
                                  prev.map((row) => {
                                    if (row.id !== question.id) return row;
                                    if (question.type === "multiple_choice") {
                                      return {
                                        ...row,
                                        correctChoiceIndexes: selected
                                          ? row.correctChoiceIndexes.filter((item) => item !== choiceIndex)
                                          : [...row.correctChoiceIndexes, choiceIndex],
                                      };
                                    }
                                    return { ...row, correctChoiceIndexes: [choiceIndex] };
                                  }),
                                )
                              }
                            />
                            <input
                              value={choice}
                              onChange={(event) =>
                                setQuizBuilderQuestions((prev) =>
                                  prev.map((row) =>
                                    row.id === question.id
                                      ? {
                                          ...row,
                                          choices: row.choices.map((item, itemIndex) =>
                                            itemIndex === choiceIndex ? event.target.value : item,
                                          ),
                                        }
                                      : row,
                                  ),
                                )
                              }
                              disabled={question.type === "true_false"}
                            />
                            <button
                              type="button"
                              className="kid-button kid-button--ghost"
                              onClick={() =>
                                setQuizBuilderQuestions((prev) =>
                                  prev.map((row) => {
                                    if (row.id !== question.id || row.type === "true_false" || row.choices.length <= 2) return row;
                                    const nextChoices = row.choices.filter((_, idx) => idx !== choiceIndex);
                                    const nextCorrect = row.correctChoiceIndexes
                                      .filter((idx) => idx !== choiceIndex)
                                      .map((idx) => (idx > choiceIndex ? idx - 1 : idx));
                                    return { ...row, choices: nextChoices, correctChoiceIndexes: nextCorrect };
                                  }),
                                )
                              }
                              disabled={question.type === "true_false" || question.choices.length <= 2}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {question.type !== "true_false" ? (
                      <button
                        type="button"
                        className="kid-button kid-button--ghost"
                        onClick={() =>
                          setQuizBuilderQuestions((prev) =>
                            prev.map((row) =>
                              row.id === question.id
                                ? { ...row, choices: [...row.choices, `Option ${row.choices.length + 1}`] }
                                : row,
                            ),
                          )
                        }
                      >
                        Add option
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="track-lessons-actions">
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => setQuizBuilderQuestions((prev) => [...prev, createBuilderQuestion()])}
            >
              Add question
            </button>
          </div>
          {quizBuilderError ? <p className="track-lessons-help">{quizBuilderError}</p> : null}
          {quizBuilderVersions.length ? (
            <p className="track-lessons-help">
              Version history: {quizBuilderVersions.map((version) => `v${version.version}`).join(", ")}
            </p>
          ) : null}
          <div className="track-lessons-actions">
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => {
                setQuizBuilderOpen(false);
                resetQuizBuilder();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="kid-button"
              onClick={() => void createQuizFromBuilder()}
              disabled={creatingBuilderQuiz}
            >
              {creatingBuilderQuiz ? "Saving..." : quizBuilderEditingQuizId ? "Save new version" : "Save quiz"}
            </button>
          </div>
        </div>
      </KidDialog>
    </form>
  );
}
