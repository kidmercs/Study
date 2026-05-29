import React, { useRef } from "react";
import { useParams, Link } from "wouter";
import { useGetSource, useReviewFlashcard, getGetSourceQueryKey, getListSourcesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FlashcardView } from "@/components/flashcard-view";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function StudySession() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const [isSummaryOpen, setIsSummaryOpen] = React.useState(false);

  const { data: source, isLoading, error } = useGetSource(id, {
    query: {
      enabled: !!id,
      queryKey: getGetSourceQueryKey(id)
    }
  });

  const reviewMutation = useReviewFlashcard({
    mutation: {
      onSuccess: (updatedCard) => {
        // Optimistically update the specific flashcard in the cache without triggering full refetch
        queryClient.setQueryData(getGetSourceQueryKey(id), (old: any) => {
          if (!old) return old;
          const updatedCards = old.flashcards.map((c: any) => 
            c.id === updatedCard.id ? { ...c, known: updatedCard.known } : c
          );
          
          const newKnownCount = updatedCards.filter((c: any) => c.known).length;
          
          return {
            ...old,
            flashcards: updatedCards,
            knownCount: newKnownCount
          };
        });
        
        // Background invalidation for lists
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

  return (
    <div className="min-h-screen pb-20">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-3 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Library
            </Button>
          </Link>
          <div className="text-sm font-medium flex items-center gap-3">
            <span className="hidden sm:inline-block text-muted-foreground">{source.knownCount} / {source.flashcardCount} mastered</span>
            <div className="w-24 sm:w-32">
              <Progress value={progress} className="h-2" />
            </div>
          </div>
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
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground balance">{source.title}</h1>
          {source.channelName && (
            <p className="text-lg text-muted-foreground">{source.channelName}</p>
          )}
        </div>

        {source.summary && (
          <Collapsible
            open={isSummaryOpen}
            onOpenChange={setIsSummaryOpen}
            className="mb-16 bg-muted/30 border rounded-xl overflow-hidden max-w-3xl mx-auto transition-all"
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

        <div className="mt-12">
          <FlashcardView 
            cards={source.flashcards || []} 
            onReview={handleReview} 
            isReviewing={reviewMutation.isPending}
          />
        </div>
      </main>
    </div>
  );
}
