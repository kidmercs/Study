import React, { useRef } from "react";
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
import { Link2, FileText, Loader2, FileUp } from "lucide-react";

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

const pdfSchema = z.object({
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

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }
  return pages.join("\n\n");
}

export function AddSourceDialog({ children }: AddSourceDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"youtube" | "text" | "pdf">("youtube");
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [isExtractingPdf, setIsExtractingPdf] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const pdfForm = useForm<z.infer<typeof pdfSchema>>({
    resolver: zodResolver(pdfSchema),
    defaultValues: { maxFlashcards: 10 },
  });

  const onSubmitYoutube = (values: z.infer<typeof youtubeSchema>) => {
    createSource.mutate(
      { data: { sourceType: "youtube", youtubeUrl: values.youtubeUrl, maxFlashcards: values.maxFlashcards } },
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

  const onSubmitPdf = async (values: z.infer<typeof pdfSchema>) => {
    if (!pdfFile) {
      toast({ title: "No file selected", description: "Please choose a PDF file.", variant: "destructive" });
      return;
    }
    setIsExtractingPdf(true);
    try {
      const text = await extractPdfText(pdfFile);
      if (!text.trim()) {
        toast({ title: "Could not read PDF", description: "The PDF appears to have no extractable text.", variant: "destructive" });
        return;
      }
      createSource.mutate(
        {
          data: {
            sourceType: "pdf",
            textTitle: pdfFile.name.replace(/\.pdf$/i, ""),
            textContent: text,
            maxFlashcards: values.maxFlashcards,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
            setOpen(false);
            setPdfFile(null);
            pdfForm.reset();
            toast({ title: "Source added", description: "Processing your PDF..." });
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to add source.", variant: "destructive" });
          },
        }
      );
    } catch {
      toast({ title: "Error reading PDF", description: "Could not extract text from this file.", variant: "destructive" });
    } finally {
      setIsExtractingPdf(false);
    }
  };

  const isPending = createSource.isPending || isExtractingPdf;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button data-testid="button-add-source">Add Source</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a new study source</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="youtube" data-testid="tab-youtube">
              <Link2 className="w-4 h-4 mr-1.5" />
              YouTube
            </TabsTrigger>
            <TabsTrigger value="text" data-testid="tab-text">
              <FileText className="w-4 h-4 mr-1.5" />
              Text
            </TabsTrigger>
            <TabsTrigger value="pdf" data-testid="tab-pdf">
              <FileUp className="w-4 h-4 mr-1.5" />
              PDF
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
                        <Input placeholder="https://youtube.com/watch?v=..." {...field} data-testid="input-youtube-url" />
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
                  <Button type="submit" disabled={isPending} data-testid="button-submit-youtube">
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Generate Study Materials
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
                        <Input placeholder="E.g., Chapter 4: Cellular Respiration" {...field} data-testid="input-text-title" />
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
                  <Button type="submit" disabled={isPending} data-testid="button-submit-text">
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Generate Study Materials
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="pdf">
            <Form {...pdfForm}>
              <form onSubmit={pdfForm.handleSubmit(onSubmitPdf)} className="space-y-5 pt-4">
                <div>
                  <p className="text-sm font-medium mb-2 text-foreground">PDF File</p>
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                    />
                    {pdfFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileUp className="w-8 h-8 text-primary" />
                        <p className="text-sm font-medium text-foreground truncate max-w-full">{pdfFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB — click to change</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <FileUp className="w-8 h-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Click to upload a PDF</p>
                        <p className="text-xs text-muted-foreground/60">Supports text-based PDFs</p>
                      </div>
                    )}
                  </div>
                </div>
                <FormField
                  control={pdfForm.control}
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
                  <Button type="submit" disabled={isPending || !pdfFile} data-testid="button-submit-pdf">
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isExtractingPdf ? "Reading PDF..." : "Generate Study Materials"}
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
