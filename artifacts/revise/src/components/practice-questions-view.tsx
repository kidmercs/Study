import React, { useState } from "react";
import type { PracticeQuestion } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, X, RotateCcw, ChevronRight } from "lucide-react";

interface PracticeQuestionsViewProps {
  questions: PracticeQuestion[];
}

export function PracticeQuestionsView({ questions }: PracticeQuestionsViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [completed, setCompleted] = useState(false);

  const handleSelect = (optionIndex: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(optionIndex);
  };

  const handleNext = () => {
    const answers = [...userAnswers, selectedOption!];
    setUserAnswers(answers);
    setSelectedOption(null);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setUserAnswers([]);
    setCompleted(false);
  };

  if (questions.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        No practice questions available for this source.
      </div>
    );
  }

  if (completed) {
    const score = userAnswers.filter((a, i) => a === questions[i].correctIndex).length;
    const pct = Math.round((score / questions.length) * 100);

    return (
      <div className="w-full max-w-2xl mx-auto pb-12">
        <div className="flex flex-col items-center text-center py-8">
          <div
            className={[
              "w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-sm",
              pct >= 80
                ? "bg-emerald-100 text-emerald-700"
                : pct >= 50
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700",
            ].join(" ")}
          >
            <span className="text-2xl font-bold">{pct}%</span>
          </div>
          <h2 className="text-2xl font-bold mb-1">Quiz Complete!</h2>
          <p className="text-muted-foreground mb-6">
            You got <span className="font-semibold text-foreground">{score}</span> out of{" "}
            <span className="font-semibold text-foreground">{questions.length}</span> correct.
          </p>
          <Button onClick={handleRestart} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>

        <div className="space-y-4 mt-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Answer Review
          </h3>
          {questions.map((q, qi) => {
            const userIdx = userAnswers[qi];
            const correct = userIdx === q.correctIndex;
            return (
              <Card key={q.id} className={["p-5 border-2", correct ? "border-emerald-400/50" : "border-red-300/50"].join(" ")}>
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className={[
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                      correct ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600",
                    ].join(" ")}
                  >
                    {correct ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </div>
                  <p className="font-medium text-foreground leading-snug">{q.question}</p>
                </div>

                <div className="flex flex-col gap-2 mb-4 pl-9">
                  {q.options.map((opt, oi) => {
                    const isCorrect = oi === q.correctIndex;
                    const isUserWrong = oi === userIdx && !correct;
                    let style = "text-muted-foreground/60";
                    if (isCorrect) style = "text-emerald-700 font-semibold";
                    if (isUserWrong) style = "text-red-600 line-through";

                    return (
                      <div key={oi} className={`flex items-center gap-2 text-sm ${style}`}>
                        <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span>{opt}</span>
                        {isCorrect && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
                        {isUserWrong && <X className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
                      </div>
                    );
                  })}
                </div>

                <div className="pl-9 text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 leading-relaxed">
                  <span className="font-semibold text-foreground">Explanation: </span>
                  {q.explanation}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const answered = selectedOption !== null;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex justify-between items-center text-sm font-medium text-muted-foreground">
        <span>Question {currentIndex + 1} of {questions.length}</span>
        <span>
          {userAnswers.filter((a, i) => a === questions[i].correctIndex).length}/{currentIndex} correct
        </span>
      </div>

      <Card className="p-6 sm:p-8 shadow-md">
        <p className="text-lg sm:text-xl font-serif leading-relaxed text-foreground mb-6">
          {q.question}
        </p>
        <div className="flex flex-col gap-3">
          {q.options.map((option, i) => {
            let style = "border-2 border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted/40 transition-colors";
            if (answered) {
              if (i === q.correctIndex) {
                style = "border-2 border-emerald-500 bg-emerald-50 text-emerald-800";
              } else if (i === selectedOption) {
                style = "border-2 border-red-400 bg-red-50 text-red-800";
              } else {
                style = "border-2 border-border bg-background text-muted-foreground opacity-60";
              }
            }
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={answered}
                className={`w-full text-left px-4 py-3 rounded-xl font-medium text-sm sm:text-base flex items-center gap-3 ${style}`}
              >
                <span className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{option}</span>
                {answered && i === q.correctIndex && (
                  <Check className="w-4 h-4 ml-auto text-emerald-600" />
                )}
                {answered && i === selectedOption && i !== q.correctIndex && (
                  <X className="w-4 h-4 ml-auto text-red-500" />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {answered && (
        <div className="bg-muted/40 border rounded-xl p-4 text-sm text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Explanation: </span>
          {q.explanation}
        </div>
      )}

      {answered && (
        <div className="flex justify-end">
          <Button size="lg" onClick={handleNext}>
            {currentIndex < questions.length - 1 ? (
              <>
                Next Question
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            ) : (
              "See Results"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
