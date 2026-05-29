import React, { useState } from "react";
import type { PastPaperQuestion } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RotateCcw, ClipboardCheck } from "lucide-react";

interface PastPaperViewProps {
  questions: PastPaperQuestion[];
}

export function PastPaperView({ questions }: PastPaperViewProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (id: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleRestart = () => {
    setAnswers({});
    setSubmitted(false);
  };

  if (questions.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        No past paper questions available for this source.
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="w-full max-w-3xl mx-auto pb-16 space-y-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Mark Scheme</h2>
          <Button variant="outline" size="sm" onClick={handleRestart}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Start Again
          </Button>
        </div>

        {questions.map((q) => {
          const userAnswer = (answers[q.id] ?? "").trim();
          return (
            <Card key={q.id} className="p-6 border-2 border-border">
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">
                  Q{q.questionNumber}
                </span>
                {q.marks != null && (
                  <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                    [{q.marks} {q.marks === 1 ? "mark" : "marks"}]
                  </span>
                )}
              </div>
              <p className="font-medium text-foreground leading-relaxed mb-5">{q.question}</p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-muted/40 p-4 border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Your Answer</p>
                  <p className={["text-sm leading-relaxed whitespace-pre-wrap", userAnswer ? "text-foreground" : "text-muted-foreground italic"].join(" ")}>
                    {userAnswer || "No answer given"}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-4 border border-emerald-200 dark:border-emerald-800/40">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-2">Mark Scheme</p>
                  <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed whitespace-pre-wrap">{q.markScheme}</p>
                </div>
              </div>
            </Card>
          );
        })}

        <div className="flex justify-center pt-4">
          <Button onClick={handleRestart} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto pb-16 space-y-6">
      <p className="text-sm text-muted-foreground text-center">
        Answer all questions below, then click <strong>Submit</strong> to see the mark scheme.
      </p>

      {questions.map((q, i) => (
        <Card key={q.id} className="p-6">
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">
              Q{q.questionNumber}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              Question {i + 1} of {questions.length}
            </span>
            {q.marks != null && (
              <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                [{q.marks} {q.marks === 1 ? "mark" : "marks"}]
              </span>
            )}
          </div>
          <p className="font-medium text-foreground leading-relaxed mb-4">{q.question}</p>
          <textarea
            value={answers[q.id] ?? ""}
            onChange={(e) => handleChange(q.id, e.target.value)}
            placeholder="Write your answer here..."
            rows={4}
            className="w-full resize-y rounded-xl border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </Card>
      ))}

      <div className="flex justify-end pt-2">
        <Button size="lg" onClick={() => setSubmitted(true)}>
          <ClipboardCheck className="w-4 h-4 mr-2" />
          Submit & See Mark Scheme
        </Button>
      </div>
    </div>
  );
}
