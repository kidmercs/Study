import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateSource, getListSourcesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link2, FileText, Loader2 } from "lucide-react";

const CARD_COUNT_OPTIONS = [5, 10, 20, 30, 50, 75, 100] as const;

const youtubeSchema = z.object({
  youtubeUrl: z.string().url({ message: "Please enter a valid URL." }).min(1, "Required"),
  maxFlashcards: z.number().min(5).max(100),
});

const textSchema = z.object({
  textTitle: z.string().min(1, "Title is required").max(100),
  textContent: z.string().min(10, "Text content must be at least 10 characters"),
  maxFlashcards: z.number().min(5).max(100),
});

interface AddSourceDialogProps {
  children?: React.ReactNode;
}

function CardCountPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium mb-2 text-foreground">Number of flashcards</p>
      <div className="flex flex-wrap gap-2">
        {CARD_COUNT_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={[
              "px-3 py-1 rounded-md text-sm font-semibold border transition-colors",
              value === n
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AddSourceDialog({ children }: AddSourceDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"youtube" | "text">("youtube");
  const createSource = useCreateSource();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const youtubeForm = useForm<z.infer<typeof youtubeSchema>>({
    resolver: zodResolver(youtubeSchema),
    defaultValues: { youtubeUrl: "", maxFlashcards: 10 },
  });

  const textForm = useForm<z.infer<typeof textSchema>>({
    resolver: zodResolver(textSchema),
    defaultValues: { textTitle: "", textContent: "", maxFlashcards: 10 },
  });

  const onSubmitYoutube = (values: z.infer<typeof youtubeSchema>) => {
    createSource.mutate(
      {
        data: {
          sourceType: "youtube",
          youtubeUrl: values.youtubeUrl,
          maxFlashcards: values.maxFlashcards,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          setOpen(false);
          youtubeForm.reset();
          toast({ title: "Source added", description: "Processing your YouTube video..." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add source.", variant: "destructive" });
        },
      }
    );
  };

  const onSubmitText = (values: z.infer<typeof textSchema>) => {
    createSource.mutate(
      {
        data: {
          sourceType: "text",
          textTitle: values.textTitle,
          textContent: values.textContent,
          maxFlashcards: values.maxFlashcards,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          setOpen(false);
          textForm.reset();
          toast({ title: "Source added", description: "Processing your text document..." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add source.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button data-testid="button-add-source">Add Source</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a new study source</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "youtube" | "text")} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="youtube" data-testid="tab-youtube">
              <Link2 className="w-4 h-4 mr-2" />
              YouTube Video
            </TabsTrigger>
            <TabsTrigger value="text" data-testid="tab-text">
              <FileText className="w-4 h-4 mr-2" />
              Text Document
            </TabsTrigger>
          </TabsList>

          <TabsContent value="youtube">
            <Form {...youtubeForm}>
              <form onSubmit={youtubeForm.handleSubmit(onSubmitYoutube)} className="space-y-5 pt-4">
                <FormField
                  control={youtubeForm.control}
                  name="youtubeUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>YouTube URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://youtube.com/watch?v=..."
                          {...field}
                          data-testid="input-youtube-url"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={youtubeForm.control}
                  name="maxFlashcards"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <CardCountPicker value={field.value} onChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    disabled={createSource.isPending}
                    data-testid="button-submit-youtube"
                  >
                    {createSource.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Generate Flashcards
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="text">
            <Form {...textForm}>
              <form onSubmit={textForm.handleSubmit(onSubmitText)} className="space-y-5 pt-4">
                <FormField
                  control={textForm.control}
                  name="textTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="E.g., Chapter 4: Cellular Respiration"
                          {...field}
                          data-testid="input-text-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={textForm.control}
                  name="textContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Text Content</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Paste your study material here..."
                          className="min-h-[130px] resize-none"
                          {...field}
                          data-testid="input-text-content"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={textForm.control}
                  name="maxFlashcards"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <CardCountPicker value={field.value} onChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    disabled={createSource.isPending}
                    data-testid="button-submit-text"
                  >
                    {createSource.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Generate Flashcards
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
