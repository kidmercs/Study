import React from "react";
import { Link } from "wouter";
import { useListSources, useGetStats, getListSourcesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SourceCard } from "@/components/source-card";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { UserSwitcher } from "@/components/user-switcher";
import { useUser } from "@/contexts/user-context";
import { BookOpen, BrainCircuit, Library, Loader2 } from "lucide-react";

export default function Dashboard() {
  const { user: maybeUser } = useUser();
  const user = maybeUser!;

  const { data: stats, isLoading: statsLoading } = useGetStats();
  
  const { data: sources, isLoading: sourcesLoading } = useListSources({
    query: {
      queryKey: [...getListSourcesQueryKey(), user.id],
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data && Array.isArray(data)) {
          const hasProcessing = data.some(s => s.status === "processing" || s.status === "pending");
          return hasProcessing ? 3000 : false;
        }
        return false;
      }
    }
  });

  const isLoading = statsLoading || sourcesLoading;

  if (isLoading && !sources) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasSources = sources && sources.length > 0;

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-4 py-10 md:px-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Library</h1>
          <p className="text-muted-foreground mt-2">{user.name}'s study environment.</p>
        </div>
        <div className="flex items-center gap-3">
          <UserSwitcher />
          <AddSourceDialog />
        </div>
      </header>

      {hasSources ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card className="bg-card">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Library className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Sources</p>
                  <h3 className="text-2xl font-bold">{stats?.totalSources || 0}</h3>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Flashcards</p>
                  <h3 className="text-2xl font-bold">{stats?.totalFlashcards || 0}</h3>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <BrainCircuit className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Cards Known</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-bold">{stats?.knownFlashcards || 0}</h3>
                    {stats?.totalFlashcards ? (
                      <span className="text-xs text-muted-foreground font-medium">
                        ({Math.round(((stats.knownFlashcards || 0) / stats.totalFlashcards) * 100)}%)
                      </span>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              Recent Materials
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sources.map(source => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-20 max-w-md mx-auto text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-primary/5 rounded-2xl flex items-center justify-center mb-6">
            <BookOpen className="w-10 h-10 text-primary/40" />
          </div>
          <h2 className="text-2xl font-semibold mb-3 text-foreground">{user.name}'s library is empty</h2>
          <p className="text-muted-foreground mb-8">
            Add a YouTube video or paste your study notes to automatically generate smart flashcards and summaries.
          </p>
          <AddSourceDialog>
            <Button size="lg" className="w-full sm:w-auto px-8" data-testid="button-empty-add-source">
              Add Your First Source
            </Button>
          </AddSourceDialog>
        </div>
      )}
    </div>
  );
}
