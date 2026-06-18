"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
} from "react";
import {
  Send,
  LayoutTemplate,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  Square,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCan } from "@/hooks/use-can";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES,
} from "@/lib/storage/upload-media";
import { isMetaAcceptedAudio } from "@/lib/whatsapp/audio-transcode";
import { ReplyQuote } from "./reply-quote";

/** Media content types an agent can send from the composer. */
export type ComposerMediaKind = "image" | "video" | "document" | "audio";

export interface SendMediaPayload {
  kind: ComposerMediaKind;
  /** Public chat-media URL Meta fetches at send time. */
  mediaUrl: string;
  /** Optional caption (image/video/document only). */
  caption?: string;
  /** Original file name — surfaced to the recipient for documents. */
  filename?: string;
  replyToId?: string;
}

interface ReplyDraft {
  /** Internal UUID of the message being replied to — sent back through onSend. */
  id: string;
  authorLabel: string;
  preview: string;
}

const CHAT_MEDIA_BUCKET = "chat-media";

// Mirrors the chat-media bucket's allowed_mime_types (migration 023) for
// the file picker so unsupported files are rejected before upload rather
// than failing with a confusing Storage error. Audio has no picker — it's
// captured via the recorder.
const PICKER_ACCEPT: Record<"image" | "video" | "document", string> = {
  image: "image/png,image/jpeg,image/webp",
  video: "video/mp4,video/3gpp",
  document:
    "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain",
};

interface MediaDraft {
  kind: ComposerMediaKind;
  mediaUrl: string;
  filename: string;
  caption: string;
}

interface MessageComposerProps {
  conversationId: string;
  sessionExpired: boolean;
  onSend: (text: string, replyToId?: string) => void;
  onSendMedia: (payload: SendMediaPayload) => void;
  onOpenTemplates: () => void;
  replyTo?: ReplyDraft | null;
  onClearReply?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Map a Meta-accepted audio MIME to a file extension for the upload path.
 * Recordings that aren't already accepted are transcoded to OGG upstream,
 * so this only ever sees accepted types.
 */
function audioExtForMime(mime: string): string {
  const base = mime.split(";")[0];
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mp4")) return "m4a";
  if (base.includes("mpeg")) return "mp3";
  if (base.includes("aac")) return "aac";
  if (base.includes("amr")) return "amr";
  return "ogg";
}

export function MessageComposer({
  conversationId,
  sessionExpired,
  onSend,
  onSendMedia,
  onOpenTemplates,
  replyTo,
  onClearReply,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Media attachment state. `draft` holds an uploaded-but-not-yet-sent
  // attachment; `busy` covers the upload/transcode window.
  const [draft, setDraft] = useState<MediaDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state.
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Viewers (read-only role) can browse the inbox but never send.
  // For solo users this is always true — single-owner accounts pass
  // every capability — so the disabled branch is a no-op there.
  const canSend = useCan("send-messages");
  const readOnly = !canSend;
  // Media (like free-form text) is only allowed inside the 24h window.
  const inputsDisabled = readOnly || sessionExpired;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Tear down any live recording + timer on unmount so a mid-record
  // navigation doesn't leak the mic.
  useEffect(() => {
    return () => {
      clearTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [clearTimer]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max 4 lines (~96px)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || sessionExpired) return;

    setSending(true);
    try {
      onSend(trimmed, replyTo?.id);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, onSend, replyTo?.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  // Upload a captured file to chat-media and stage it as a draft.
  const stageUpload = useCallback(
    async (kind: ComposerMediaKind, file: File) => {
      if (file.size > MEDIA_MAX_BYTES) {
        toast.error(
          `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is 16 MB.`,
        );
        return;
      }
      setBusy(true);
      try {
        const { publicUrl } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        setDraft({ kind, mediaUrl: publicUrl, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handlePicked = useCallback(
    (kind: "image" | "video" | "document", file: File | undefined) => {
      if (file) void stageUpload(kind, file);
    },
    [stageUpload],
  );

  // ---- Voice recording ----------------------------------------------

  const finalizeRecording = useCallback(
    async (blob: Blob, mime: string) => {
      setBusy(true);
      try {
        let file: File;
        if (isMetaAcceptedAudio(mime)) {
          // Firefox (ogg) / Safari (mp4) already give a Meta-accepted
          // format — upload as-is.
          const base = mime.split(";")[0];
          file = new File([blob], `voice-${Date.now()}.${audioExtForMime(mime)}`, {
            type: base,
          });
        } else {
          // Chromium records WebM/Opus, which Meta rejects — remux to
          // OGG/Opus server-side first.
          const form = new FormData();
          form.append("file", blob, "recording");
          const res = await fetch("/api/whatsapp/transcode-audio", {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload?.error || `Transcode failed (HTTP ${res.status})`);
          }
          const ogg = await res.blob();
          file = new File([ogg], `voice-${Date.now()}.ogg`, { type: "audio/ogg" });
        }
        if (file.size > MEDIA_MAX_BYTES) {
          toast.error("Recording is too long (over 16 MB).");
          return;
        }
        const { publicUrl } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        setDraft({ kind: "audio", mediaUrl: publicUrl, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not process the recording.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const startRecording = useCallback(async () => {
    if (inputsDisabled || busy || recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Prefer a Meta-accepted container (Firefox supports ogg/opus) so
      // we can skip the transcode round-trip; Chromium falls back to webm.
      const preferred = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (cancelledRef.current) return;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size > 0) void finalizeRecording(blob, type);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      toast.error("Microphone access denied or unavailable.");
    }
  }, [inputsDisabled, busy, recording, finalizeRecording]);

  const stopRecording = useCallback(() => {
    clearTimer();
    setRecording(false);
    recorderRef.current?.stop();
  }, [clearTimer]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setRecording(false);
    recorderRef.current?.stop();
  }, [clearTimer]);

  // ---- Draft send / discard -----------------------------------------

  const sendDraft = useCallback(() => {
    if (!draft || busy) return;
    onSendMedia({
      kind: draft.kind,
      mediaUrl: draft.mediaUrl,
      // Audio takes no caption (Meta rejects it). Everything else: the
      // trimmed caption, or undefined when blank.
      caption:
        draft.kind === "audio" ? undefined : draft.caption.trim() || undefined,
      filename: draft.kind === "document" ? draft.filename : undefined,
      replyToId: replyTo?.id,
    });
    setDraft(null);
    onClearReply?.();
  }, [draft, busy, onSendMedia, replyTo?.id, onClearReply]);

  const discardDraft = useCallback(() => setDraft(null), []);

  // ---- Render --------------------------------------------------------

  const DraftPreview = () => {
    if (!draft) return null;
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {draft.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.mediaUrl}
                alt={draft.filename}
                className="max-h-40 rounded-lg object-cover"
              />
            )}
            {draft.kind === "video" && (
              <video src={draft.mediaUrl} controls className="max-h-40 rounded-lg" />
            )}
            {draft.kind === "audio" && (
              <audio src={draft.mediaUrl} controls className="w-full" />
            )}
            {draft.kind === "document" && (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="truncate">{draft.filename}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={discardDraft}
            aria-label="Remove attachment"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex items-end gap-2">
          {draft.kind !== "audio" && (
            <input
              value={draft.caption}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, caption: e.target.value } : d))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendDraft();
                }
              }}
              placeholder="Add a caption…"
              className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50"
            />
          )}
          <GatedButton
            size="sm"
            canAct={!readOnly}
            gateReason="send messages"
            disabled={busy}
            onClick={sendDraft}
            className={cn(
              "h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90 disabled:opacity-40",
              draft.kind === "audio" && "ml-auto",
            )}
          >
            <Send className="h-4 w-4" />
          </GatedButton>
        </div>
      </div>
    );
  };

  return (
    <div className="border-t border-border bg-card p-3">
      {replyTo && (
        <div className="mb-2">
          <ReplyQuote
            authorLabel={replyTo.authorLabel}
            preview={replyTo.preview}
            onDismiss={onClearReply}
          />
        </div>
      )}
      {sessionExpired && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-400">
            24-hour session expired. Use a template to re-engage.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-400 hover:text-amber-300"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate className="mr-1 h-3 w-3" />
            Templates
          </Button>
        </div>
      )}

      {/* Hidden file inputs driven by the attach menu. */}
      <input
        ref={imageInputRef}
        type="file"
        accept={PICKER_ACCEPT.image}
        className="hidden"
        onChange={(e) => {
          handlePicked("image", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={PICKER_ACCEPT.video}
        className="hidden"
        onChange={(e) => {
          handlePicked("video", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={PICKER_ACCEPT.document}
        className="hidden"
        onChange={(e) => {
          handlePicked("document", e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {draft ? (
        <DraftPreview />
      ) : recording ? (
        // Recording bar — replaces the composer while the mic is live.
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-2.5">
          <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="flex-1 text-sm text-foreground">
            Recording… {formatDuration(recordSeconds)}
          </span>
          <button
            type="button"
            onClick={cancelRecording}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-card hover:text-foreground"
          >
            Cancel
          </button>
          <Button
            size="sm"
            onClick={stopRecording}
            className="h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90"
            title="Stop and attach"
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {/* Attach menu — photo / video / document / voice. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={inputsDisabled || busy}
              title={
                readOnly
                  ? "Read-only — your role can't send messages"
                  : inputsDisabled
                    ? undefined
                    : "Attach media"
              }
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-0 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border bg-popover">
              <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="mr-2 h-4 w-4" />
                Photo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => videoInputRef.current?.click()}>
                <Video className="mr-2 h-4 w-4" />
                Video
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                <FileText className="mr-2 h-4 w-4" />
                Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void startRecording()}>
                <Mic className="mr-2 h-4 w-4" />
                Voice note
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="send messages"
            title={readOnly ? undefined : "Send template"}
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate className="h-4 w-4" />
          </GatedButton>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              readOnly
                ? "Read-only — viewers can browse but not reply"
                : sessionExpired
                  ? "Session expired - use a template"
                  : "Type a message... (Shift+Enter for new line)"
            }
            disabled={sessionExpired || readOnly}
            rows={1}
            // Textarea keeps its own inline title — the GatedButton
            // wrapping pattern doesn't apply to non-button inputs.
            // The placeholder text also surfaces the read-only state.
            title={readOnly ? "Read-only — your role can't send messages" : undefined}
            className={cn(
              "flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50",
              (sessionExpired || readOnly) && "cursor-not-allowed opacity-50"
            )}
          />

          <GatedButton
            size="sm"
            canAct={!readOnly}
            gateReason="send messages"
            disabled={!text.trim() || sessionExpired || sending}
            onClick={handleSend}
            className="h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </GatedButton>
        </div>
      )}

      {/* Hint sits outside the flex row so its height doesn't push
          `items-end` buttons below the textarea. Indented to line up
          under the textarea left edge. */}
      {!draft && !recording && (
        <p className="mt-1 pl-[5.5rem] text-[10px] text-muted-foreground">
          Type &apos;/&apos; for quick replies
        </p>
      )}
    </div>
  );
}
