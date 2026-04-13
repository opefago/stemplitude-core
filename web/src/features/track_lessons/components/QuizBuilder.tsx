import { useState } from "react";

import { KidCheckbox, KidDropdown } from "../../../components/ui";
import type { QuizPayload } from "../../../lib/api/trackLessons";

type QuizQuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_answer";

type QuizBuilderQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices: string[];
  correctChoiceIndexes: number[];
  expectedAnswer: string;
};

const QUESTION_TYPE_OPTIONS: Array<{ value: QuizQuestionType; label: string }> = [
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

function createQuestion(type: QuizQuestionType = "single_choice"): QuizBuilderQuestion {
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

type QuizBuilderProps = {
  formTitle?: string;
  onSubmit: (payload: QuizPayload) => Promise<void> | void;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

export function QuizBuilder({
  formTitle = "Quiz builder",
  onSubmit,
  onCancel,
  isSubmitting = false,
}: QuizBuilderProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState<QuizBuilderQuestion[]>([createQuestion()]);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="track-lessons-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const cleanTitle = title.trim();
        if (!cleanTitle) {
          setError("Quiz title is required.");
          return;
        }
        const normalized = questions.map((question) => {
          const expectedAnswers = question.expectedAnswer
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          const choices = question.type === "short_answer"
            ? []
            : question.type === "true_false"
              ? ["True", "False"]
              : question.choices.map((item) => item.trim()).filter(Boolean);
          const correctChoiceIndexes = question.type === "short_answer"
            ? []
            : question.type === "true_false"
              ? [question.correctChoiceIndexes[0] === 1 ? 1 : 0]
              : question.correctChoiceIndexes.filter((idx) => idx >= 0 && idx < choices.length);
          return {
            ...question,
            prompt: question.prompt.trim(),
            choices,
            correctChoiceIndexes,
            expectedAnswer: expectedAnswers.join(", "),
            expectedAnswers,
          };
        });
        if (normalized.some((question) => !question.prompt)) {
          setError("Each question needs a prompt.");
          return;
        }
        if (
          normalized.some((question) =>
            question.type !== "short_answer"
            && (question.choices.length < 2 || question.correctChoiceIndexes.length === 0),
          )
        ) {
          setError("Choice questions need at least 2 options and a correct answer.");
          return;
        }
        if (normalized.some((question) => question.type === "short_answer" && question.expectedAnswers.length === 0)) {
          setError("Short-answer questions need at least one accepted answer.");
          return;
        }
        setError(null);
        await onSubmit({
          title: cleanTitle,
          description: description.trim() || undefined,
          instructions: instructions.trim() || undefined,
          visibility: "tenant_only",
          status: "draft",
          schema_json: {
            version: 1,
            questions: normalized.map((question, index) => ({
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
        });
      }}
    >
      <h3>{formTitle}</h3>
      <label className="ui-form-field">
        <span>Quiz title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="ui-form-field">
        <span>Description</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      </label>
      <label className="ui-form-field">
        <span>Instructions (optional)</span>
        <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} />
      </label>
      <div className="track-lessons-quiz-builder">
        {questions.map((question, index) => (
          <div key={question.id} className="track-lessons-quiz-builder__question">
            <div className="track-lessons-actions">
              <strong>Question {index + 1}</strong>
              <button
                type="button"
                className="kid-button kid-button--ghost"
                disabled={questions.length <= 1}
                onClick={() => setQuestions((prev) => prev.length <= 1 ? prev : prev.filter((row) => row.id !== question.id))}
              >
                Remove
              </button>
            </div>
            <label className="ui-form-field">
              <span>Type</span>
              <KidDropdown
                value={question.type}
                onChange={(value) =>
                  setQuestions((prev) => prev.map((row) => {
                    if (row.id !== question.id) return row;
                    const next = createQuestion(value as QuizQuestionType);
                    return { ...next, id: row.id, prompt: row.prompt };
                  }))
                }
                ariaLabel={`Question ${index + 1} type`}
                fullWidth
                options={QUESTION_TYPE_OPTIONS}
              />
            </label>
            <label className="ui-form-field">
              <span>Prompt</span>
              <input value={question.prompt} onChange={(event) => setQuestions((prev) => prev.map((row) => row.id === question.id ? { ...row, prompt: event.target.value } : row))} />
            </label>
            {question.type === "short_answer" ? (
              <label className="ui-form-field">
                <span>Accepted answer(s) (comma-separated)</span>
                <input
                  value={question.expectedAnswer}
                  onChange={(event) => setQuestions((prev) => prev.map((row) => row.id === question.id ? { ...row, expectedAnswer: event.target.value } : row))}
                  placeholder="e.g. Ohm's Law, V = I * R"
                />
              </label>
            ) : (
              <div className="track-lessons-quiz-builder__choices">
                <p className="track-lessons-help">
                  Mark the correct answer using the selector beside each option.
                </p>
                {question.choices.map((choice, choiceIndex) => (
                  <div key={`${question.id}-${choiceIndex}`} className="track-lessons-quiz-builder__choice-row">
                    <KidCheckbox
                      checked={question.correctChoiceIndexes.includes(choiceIndex)}
                      compact
                      ariaLabel={`Mark option ${choiceIndex + 1} as correct`}
                      onChange={(nextChecked) =>
                        setQuestions((prev) => prev.map((row) => {
                          if (row.id !== question.id) return row;
                          if (question.type === "multiple_choice") {
                            if (nextChecked) {
                              return row.correctChoiceIndexes.includes(choiceIndex)
                                ? row
                                : { ...row, correctChoiceIndexes: [...row.correctChoiceIndexes, choiceIndex] };
                            }
                            return {
                              ...row,
                              correctChoiceIndexes: row.correctChoiceIndexes.filter((idx) => idx !== choiceIndex),
                            };
                          }
                          if (!nextChecked) return row;
                          return { ...row, correctChoiceIndexes: [choiceIndex] };
                        }))
                      }
                    />
                    <input
                      value={choice}
                      disabled={question.type === "true_false"}
                      onChange={(event) =>
                        setQuestions((prev) => prev.map((row) =>
                          row.id === question.id
                            ? { ...row, choices: row.choices.map((item, idx) => idx === choiceIndex ? event.target.value : item) }
                            : row,
                        ))
                      }
                    />
                    {question.type !== "true_false" ? (
                      <button
                        type="button"
                        className="kid-button kid-button--ghost"
                        disabled={question.choices.length <= 2}
                        onClick={() =>
                          setQuestions((prev) => prev.map((row) => {
                            if (row.id !== question.id || row.choices.length <= 2) return row;
                            const nextChoices = row.choices.filter((_, idx) => idx !== choiceIndex);
                            const nextCorrect = row.correctChoiceIndexes
                              .filter((idx) => idx !== choiceIndex)
                              .map((idx) => (idx > choiceIndex ? idx - 1 : idx));
                            return { ...row, choices: nextChoices, correctChoiceIndexes: nextCorrect };
                          }))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                {question.type !== "true_false" ? (
                  <button
                    type="button"
                    className="kid-button kid-button--ghost"
                    onClick={() =>
                      setQuestions((prev) => prev.map((row) =>
                        row.id === question.id
                          ? { ...row, choices: [...row.choices, `Option ${row.choices.length + 1}`] }
                          : row,
                      ))
                    }
                  >
                    Add option
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="kid-button kid-button--ghost" onClick={() => setQuestions((prev) => [...prev, createQuestion()])}>
        Add question
      </button>
      {error ? <p className="track-lessons-help">{error}</p> : null}
      <div className="track-lessons-form-actions">
        <button type="button" className="track-lessons-cancel-button" onClick={() => onCancel?.()}>
          Cancel
        </button>
        <button type="submit" className="kid-button" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save quiz"}
        </button>
      </div>
    </form>
  );
}
