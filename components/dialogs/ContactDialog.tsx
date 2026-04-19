"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: string) => Promise<boolean>;
};

export default function ContactDialog({
  open,
  onOpenChange,
  onSubmit,
}: ContactDialogProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const handleClose = (next: boolean) => {
    if (!next) {
      setBody("");
      setDone(false);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    const ok = await onSubmit(body.trim());
    setSending(false);
    if (ok) {
      setDone(true);
      setBody("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>管理人に伝える</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-2">
            <div className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-700">
              送っていただきありがとうございます。必要に応じて対応します。
            </div>
            <DialogFooter>
              <Button
                className="rounded-2xl"
                onClick={() => handleClose(false)}
              >
                閉じる
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="text-sm leading-6 text-neutral-600">
              気になることや不具合、この場への要望などがあれば書いてください。
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="例: 特定の部屋が開けません / こういう機能がほしい 等"
              className="min-h-[140px] rounded-2xl"
            />
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => handleClose(false)}
              >
                閉じる
              </Button>
              <Button
                className="rounded-2xl"
                onClick={submit}
                disabled={sending || !body.trim()}
              >
                送信する
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
