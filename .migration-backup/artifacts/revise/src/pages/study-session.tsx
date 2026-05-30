import React from "react";
import { useParams, Link } from "wouter";
import { useGetSource, useReviewFlashcard, getGetSourceQueryKey, getListSourcesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FlashcardView } from "@/components/flashcard-view";
import { MindMapView } from "@/components/mind-map-view";
import { PracticeQuestionsView } from "@/components/practice-questions-view";
import { PastPaperView } from "@/components/past-paper-view";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, Loader2, Layers, GitBranch, HelpCircle, ScrollText } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type StudyMode = "flashcards" | "mindmap" | "questions" | "pastpaper";

export default function StudySession() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const [isSummaryOpen, setIsSummaryOpen] = React.useState(false);
  const [studyMode, setStudyMode] = React.useState<StudyMode | null>(null);

  const { data: source, isLoading, error } = useGetSource(id, {
    query: {
      enabled: !!id,
      queryKey: getGetSourceQueryKey(id)
    }
  });

  const reviewMutation = useReviewFlashcard({
    mutation: {
      onSuccess: (updatedCard) => {
        queryClient.setQueryData(getGetSourceQueryKey(id), (old: any) => {
          if (!old) return old;
          const updatedCards = old.flashcards.map((c: any) =>
            c.id === updatedCard.id ? { ...c, known: updatedCard.known } : c
          );
          const newKnownCount = updatedCards.filter((c: any) => c.known).length;
          return { ...old, flashcards: updatedCards, knownCount: newKnownCount };
        });
        queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
      }
    }
  });

  const handleReview = React.useCallback((cardId: number, known: boolean) => {
    reviewMutation.mutate({ id: cardId, data: { known } });
  }, [reviewMutation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center max-w-md mx-auto text-center px-4">
        <h2 className="text-2xl font-bold mb-4">Source not found</h2>
        <p className="text-muted-foreground mb-8">This source might have been deleted or the ID is invalid.</p>
        <Link href="/">
          <Button>Back to Library</Button>
        </Link>
      </div>
    );
  }

  const progress = source.flashcardCount > 0 ? (source.knownCount / source.flashcardCount) * 100 : 0;

  const hasPastPaper = (source.pastPaperQuestions?.length ?? 0) > 0;

  const modes: { key: StudyMode; label: string; icon: React.ReactNode }[] = [
    ...(source.flashcards?.length > 0 ? [{ key: "flashcards" as const, label: "Flashcards", icon: <Layers className="w-4 h-4" /> }] : []),
    ...(source.mindMap ? [{ key: "mindmap" as const, label: "Mind Map", icon: <GitBranch className="w-4 h-4" /> }] : []),
    ...(source.questions?.length > 0 ? [{ key: "questions" as const, label: "Practice Quiz", icon: <HelpCircle className="w-4 h-4" /> }] : []),
    ...(hasPastPaper ? [{ key: "pastpaper" as const, label: "Past Paper", icon: <ScrollText className="w-4 h-4" /> }] : []),
  ];

  const defaultMode: StudyMode = hasPastPaper && source.flashcards?.length === 0 ? "pastpaper"
    : source.flashcards?.length > 0 ? "flashcards"
    : source.questions?.length > 0 ? "questions"
    : "pastpaper";

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-3 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Library
            </Button>
          </Link>
          {studyMode === "flashcards" && (
            <div className="text-sm font-medium flex items-center gap-3">
              <span className="hidden sm:inline-block text-muted-foreground">{source.knownCount} / {source.flashcardCount} mastered</span>
              <div className="w-24 sm:w-32">
                <Progress value={progress} className="h-2" />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-8 pt-10">
        <div className="mb-10 text-center max-w-3xl mx-auto">
          {source.sourceType === "youtube" && (
            <span className="inline-block px-3 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-full text-xs font-semibold mb-4 tracking-wide uppercase">
              YouTube Video
            </span>
          )}
          {source.sourceType === "text" && (
            <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold mb-4 tracking-wide uppercase">
              Document
            </span>
          )}
          {source.sourceType === "pdf" && (
            <span className="inline-block px-3 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 rounded-full text-xs font-semibold mb-4 tracking-wide uppercase">
              PDF
            </span>
          )}
          {source.sourceType === "pastpaper" && (
            <span className="inline-block px-3 py-1 bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 rounded-full text-xs font-semibold mb-4 tracking-wide uppercase">
              Past Paper
            </span>
          )}
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground balance">{source.title}</h1>
          {source.channelName && (
            <p className="text-lg text-muted-foreground">{source.channelName}</p>
          )}
        </div>

        {source.summary && (
          <Collapsible
            open={isSummaryOpen}
            onOpenChange={setIsSummaryOpen}
            className="mb-10 bg-muted/30 border rounded-xl overflow-hidden max-w-3xl mx-auto transition-all"
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full flex items-center justify-between p-4 h-auto rounded-none hover:bg-muted/50">
                <div className="flex items-center text-base font-semibold">
                  <BookOpen className="w-4 h-4 mr-3 text-primary" />
                  Source Summary
                </div>
                {isSummaryOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-6 pt-2 border-t bg-card/50 prose prose-sm md:prose-base dark:prose-invert max-w-none font-serif leading-relaxed">
                {source.summary.split('\n').map((paragraph, i) => (
                  paragraph.trim() ? <p key={i}>{paragraph}</p> : null
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Study Mode Tabs */}
        {modes.length > 1 && (
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-muted/50 rounded-xl p-1 gap-1 border flex-wrap justify-center">
              {modes.map(({ key, label, icon }) => {
                const active = (studyMode ?? defaultMode) === key;
                return (
                  <button
                    key={key}
                    onClick={() => setStudyMode(key)}
                    className={[
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      active
                        ? "bg-background text-foreground shadow-sm border border-border/60"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {icon}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4">
          {(studyMode ?? defaultMode) === "flashcards" && (
            <FlashcardView
              cards={source.flashcards || []}
              onReview={handleReview}
              isReviewing={reviewMutation.isPending}
            />
          )}
          {(studyMode ?? defaultMode) === "mindmap" && (
            <MindMapView mindMapJson={source.mindMap ?? null} />
          )}
          {(studyMode ?? defaultMode) === "questions" && (
            <PracticeQuestionsView questions={source.questions || []} />
          )}
          {(studyMode ?? defaultMode) === "pastpaper" && (
            <PastPaperView questions={source.pastPaperQuestions || []} />
          )}
        </div>
      </main>
    </div>
  );
}
