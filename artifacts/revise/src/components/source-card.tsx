import React from "react";
import { Link } from "wouter";
import { useDeleteSource, getListSourcesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Source } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2, FileText, Youtube, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface SourceCardProps {
  source: Source;
}

export function SourceCard({ source }: SourceCardProps) {
  const deleteSource = useDeleteSource();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [retrying, setRetrying] = React.useState(false);

  const isReady = source.status === "done";
  const isProcessing = source.status === "processing" || source.status === "pending";
  const isError = source.status === "error";

  const progress = source.flashcardCount > 0 ? (source.knownCount / source.flashcardCount) * 100 : 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    deleteSource.mutate(
      { id: source.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          toast({ title: "Deleted", description: "Source has been removed." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to delete source.", variant: "destructive" });
        },
      }
    );
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault();
    setRetrying(true);
    try {
      const res = await fetch(`/api/sources/${source.id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Retry failed");
      queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
      toast({ title: "Retrying", description: "Processing started again..." });
    } catch {
      toast({ title: "Error", description: "Could not retry. Please try again.", variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const content = (
    <Card
      className={`group relative overflow-hidden flex flex-col transition-all duration-300 hover-elevate ${!isReady ? "opacity-80" : ""}`}
      data-testid={`card-source-${source.id}`}
    >
      {source.sourceType === "youtube" && source.thumbnail ? (
        <div className="w-full h-32 bg-muted relative overflow-hidden">
          <img
            src={source.thumbnail}
            alt={source.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
            <Youtube className="w-3 h-3 text-red-500" />
            YouTube
          </div>
        </div>
      ) : (
        <div className="w-full h-32 bg-primary/10 flex items-center justify-center relative">
          <FileText className="w-10 h-10 text-primary/40" />
          <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
            <FileText className="w-3 h-3 text-primary" />
            Document
          </div>
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <h3 className="font-semibold text-base line-clamp-2 leading-tight">{source.title}</h3>
          {source.channelName && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{source.channelName}</p>
          )}
        </div>

        <div className="mt-auto">
          {isReady ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{source.knownCount} of {source.flashcardCount} known</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          ) : isProcessing ? (
            <div className="flex items-center gap-2 text-sm text-primary font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing...</span>
            </div>
          ) : isError ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-destructive font-medium">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="line-clamp-2 text-xs">
                  {source.errorMessage?.startsWith("{")
                    ? "AI service temporarily unavailable."
                    : source.errorMessage || "Failed to process"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs gap-1.5"
                onClick={handleRetry}
                disabled={retrying}
              >
                {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.preventDefault()}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-sm">
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this source?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the source and all associated flashcards. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleteSource.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleteSource.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );

  if (isReady) {
    return (
      <Link href={`/sources/${source.id}`} className="block h-full cursor-pointer">
        {content}
      </Link>
    );
  }

  return <div className="h-full relative">{content}</div>;
}
