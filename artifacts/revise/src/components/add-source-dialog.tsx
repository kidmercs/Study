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
import { Link2, FileText, Loader2, FileUp, CreditCard, Network, HelpCircle, ScrollText } from "lucide-react";

const youtubeSchema = z.object({
  youtubeUrl: z.string().url({ message: "Please enter a valid URL." }).min(1, "Required"),
  maxFlashcards: z.number().min(5).max(100),
  maxQuestions: z.number().min(3).max(20),
});

const textSchema = z.object({
  textTitle: z.string().min(1, "Title is required").max(100),
  textContent: z.string().min(10, "Text content must be at least 10 characters"),
  maxFlashcards: z.number().min(5).max(100),
  maxQuestions: z.number().min(3).max(20),
});

const pdfSchema = z.object({
  maxFlashcards: z.number().min(5).max(100),
  maxQuestions: z.number().min(3).max(20),
});

const pastPaperTextSchema = z.object({
  paperTitle: z.string().min(1, "Title is required").max(150),
  paperContent: z.string().min(20, "Please paste the paper content (at least 20 characters)"),
});

interface StudyModes {
  flashcards: boolean;
  mindMap: boolean;
  quiz: boolean;
}

interface AddSourceDialogProps {
  children?: React.ReactNode;
}

function CountSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="text-sm font-bold text-primary w-8 text-right">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary bg-muted"
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function StudyModeToggle({
  modes,
  onChange,
}: {
  modes: StudyModes;
  onChange: (modes: StudyModes) => void;
}) {
  const options = [
    { key: "flashcards" as const, label: "Flashcards", Icon: CreditCard },
    { key: "mindMap" as const, label: "Mind Map", Icon: Network },
    { key: "quiz" as const, label: "Practice Quiz", Icon: HelpCircle },
  ];

  const toggle = (key: keyof StudyModes) => {
    const next = { ...modes, [key]: !modes[key] };
    if (!next.flashcards && !next.mindMap && !next.quiz) return;
    onChange(next);
  };

  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">Generate</p>
      <div className="flex gap-2">
        {options.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={[
              "flex-1 flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 text-xs font-semibold transition-colors",
              modes[key]
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40",
            ].join(" ")}
          >
            <Icon className="w-4 h-4" />
            {label}
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
  const [tab, setTab] = React.useState<"youtube" | "text" | "pdf" | "pastpaper">("youtube");
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [isExtractingPdf, setIsExtractingPdf] = React.useState(false);
  const [ppPdfFile, setPpPdfFile] = React.useState<File | null>(null);
  const [isExtractingPpPdf, setIsExtractingPpPdf] = React.useState(false);
  const [modes, setModes] = React.useState<StudyModes>({ flashcards: true, mindMap: true, quiz: true });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ppFileInputRef = useRef<HTMLInputElement>(null);
  const createSource = useCreateSource();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const youtubeForm = useForm<z.infer<typeof youtubeSchema>>({
    resolver: zodResolver(youtubeSchema),
    defaultValues: { youtubeUrl: "", maxFlashcards: 10, maxQuestions: 5 },
  });

  const textForm = useForm<z.infer<typeof textSchema>>({
    resolver: zodResolver(textSchema),
    defaultValues: { textTitle: "", textContent: "", maxFlashcards: 10, maxQuestions: 5 },
  });

  const pdfForm = useForm<z.infer<typeof pdfSchema>>({
    resolver: zodResolver(pdfSchema),
    defaultValues: { maxFlashcards: 10, maxQuestions: 5 },
  });

  const pastPaperTextForm = useForm<z.infer<typeof pastPaperTextSchema>>({
    resolver: zodResolver(pastPaperTextSchema),
    defaultValues: { paperTitle: "", paperContent: "" },
  });

  const buildModeData = (flashcards: number, questions: number) => ({
    generateFlashcards: modes.flashcards,
    generateMindMap: modes.mindMap,
    generateQuiz: modes.quiz,
    maxFlashcards: modes.flashcards ? flashcards : undefined,
    maxQuestions: modes.quiz ? questions : undefined,
  });

  const onSubmitYoutube = (values: z.infer<typeof youtubeSchema>) => {
    createSource.mutate(
      {
        data: {
          sourceType: "youtube",
          youtubeUrl: values.youtubeUrl,
          ...buildModeData(values.maxFlashcards, values.maxQuestions),
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
          ...buildModeData(values.maxFlashcards, values.maxQuestions),
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
            ...buildModeData(values.maxFlashcards, values.maxQuestions),
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

  const onSubmitPastPaperText = (values: z.infer<typeof pastPaperTextSchema>) => {
    createSource.mutate(
      {
        data: {
          sourceType: "pastpaper",
          textTitle: values.paperTitle,
          textContent: values.paperContent,
          generateFlashcards: false,
          generateMindMap: false,
          generateQuiz: false,
          generatePastPaper: true,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          setOpen(false);
          pastPaperTextForm.reset();
          toast({ title: "Past paper added", description: "Extracting questions and mark scheme..." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add past paper.", variant: "destructive" });
        },
      }
    );
  };

  const onSubmitPastPaperPdf = async () => {
    if (!ppPdfFile) {
      toast({ title: "No file selected", description: "Please choose a PDF file.", variant: "destructive" });
      return;
    }
    setIsExtractingPpPdf(true);
    try {
      const text = await extractPdfText(ppPdfFile);
      if (!text.trim()) {
        toast({ title: "Could not read PDF", description: "The PDF appears to have no extractable text.", variant: "destructive" });
        return;
      }
      createSource.mutate(
        {
          data: {
            sourceType: "pastpaper",
            textTitle: ppPdfFile.name.replace(/\.pdf$/i, ""),
            textContent: text,
            generateFlashcards: false,
            generateMindMap: false,
            generateQuiz: false,
            generatePastPaper: true,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
            setOpen(false);
            setPpPdfFile(null);
            toast({ title: "Past paper added", description: "Extracting questions and mark scheme..." });
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to add past paper.", variant: "destructive" });
          },
        }
      );
    } catch {
      toast({ title: "Error reading PDF", description: "Could not extract text from this file.", variant: "destructive" });
    } finally {
      setIsExtractingPpPdf(false);
    }
  };

  const isPending = createSource.isPending || isExtractingPdf || isExtractingPpPdf;

  const renderModeOptions = (flashcardsField: React.ReactNode, questionsField: React.ReactNode) => (
    <div className="space-y-4">
      <StudyModeToggle modes={modes} onChange={setModes} />
      {modes.flashcards && flashcardsField}
      {modes.quiz && questionsField}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button data-testid="button-add-source">Add Source</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a new study source</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="youtube" data-testid="tab-youtube">
              <Link2 className="w-3.5 h-3.5 mr-1" />
              YouTube
            </TabsTrigger>
            <TabsTrigger value="text" data-testid="tab-text">
              <FileText className="w-3.5 h-3.5 mr-1" />
              Text
            </TabsTrigger>
            <TabsTrigger value="pdf" data-testid="tab-pdf">
              <FileUp className="w-3.5 h-3.5 mr-1" />
              PDF
            </TabsTrigger>
            <TabsTrigger value="pastpaper" data-testid="tab-pastpaper">
              <ScrollText className="w-3.5 h-3.5 mr-1" />
              Past Paper
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
                {renderModeOptions(
                  <FormField
                    control={youtubeForm.control}
                    name="maxFlashcards"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <CountSlider label="Number of flashcards" value={field.value} onChange={field.onChange} min={5} max={100} step={5} />
                        </FormControl>
                      </FormItem>
                    )}
                  />,
                  <FormField
                    control={youtubeForm.control}
                    name="maxQuestions"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <CountSlider label="Number of quiz questions" value={field.value} onChange={field.onChange} min={3} max={20} step={1} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={isPending} data-testid="button-submit-youtube">
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Generate
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
                          className="min-h-[110px] resize-none"
                          {...field}
                          data-testid="input-text-content"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {renderModeOptions(
                  <FormField
                    control={textForm.control}
                    name="maxFlashcards"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <CountSlider label="Number of flashcards" value={field.value} onChange={field.onChange} min={5} max={100} step={5} />
                        </FormControl>
                      </FormItem>
                    )}
                  />,
                  <FormField
                    control={textForm.control}
                    name="maxQuestions"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <CountSlider label="Number of quiz questions" value={field.value} onChange={field.onChange} min={3} max={20} step={1} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={isPending} data-testid="button-submit-text">
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Generate
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
                {renderModeOptions(
                  <FormField
                    control={pdfForm.control}
                    name="maxFlashcards"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <CountSlider label="Number of flashcards" value={field.value} onChange={field.onChange} min={5} max={100} step={5} />
                        </FormControl>
                      </FormItem>
                    )}
                  />,
                  <FormField
                    control={pdfForm.control}
                    name="maxQuestions"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <CountSlider label="Number of quiz questions" value={field.value} onChange={field.onChange} min={3} max={20} step={1} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={isPending || !pdfFile} data-testid="button-submit-pdf">
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isExtractingPdf ? "Reading PDF..." : "Generate"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
          <TabsContent value="pastpaper">
            <div className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Paste your past paper as text or upload a PDF. The AI will extract every question and generate a mark scheme.
              </p>

              {/* Sub-tabs: Text vs PDF */}
              <Tabs defaultValue="pptext" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="pptext">
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Paste Text
                  </TabsTrigger>
                  <TabsTrigger value="pppdf">
                    <FileUp className="w-3.5 h-3.5 mr-1.5" />
                    Upload PDF
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pptext">
                  <Form {...pastPaperTextForm}>
                    <form onSubmit={pastPaperTextForm.handleSubmit(onSubmitPastPaperText)} className="space-y-4">
                      <FormField
                        control={pastPaperTextForm.control}
                        name="paperTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Paper Title</FormLabel>
                            <FormControl>
                              <Input placeholder="E.g., Biology Unit 2 June 2023" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={pastPaperTextForm.control}
                        name="paperContent"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Paper Content</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Paste the full text of the past paper here..."
                                className="min-h-[130px] resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end">
                        <Button type="submit" disabled={isPending}>
                          {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Extract Questions
                        </Button>
                      </div>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="pppdf">
                  <div className="space-y-4">
                    <div
                      className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
                      onClick={() => ppFileInputRef.current?.click()}
                    >
                      <input
                        ref={ppFileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={(e) => setPpPdfFile(e.target.files?.[0] ?? null)}
                      />
                      {ppPdfFile ? (
                        <div className="flex flex-col items-center gap-2">
                          <FileUp className="w-8 h-8 text-primary" />
                          <p className="text-sm font-medium text-foreground truncate max-w-full">{ppPdfFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(ppPdfFile.size / 1024 / 1024).toFixed(1)} MB — click to change</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <FileUp className="w-8 h-8 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Click to upload the past paper PDF</p>
                          <p className="text-xs text-muted-foreground/60">Supports text-based PDFs</p>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={onSubmitPastPaperPdf} disabled={isPending || !ppPdfFile} type="button">
                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {isExtractingPpPdf ? "Reading PDF..." : "Extract Questions"}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
