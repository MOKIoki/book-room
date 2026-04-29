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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ReportRoomDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReport: (body: string) => Promise<void>;
};

export default function ReportRoomDialog({
  open,
  onOpenChange,
  onReport,
}: ReportRoomDialogProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onReport(body.trim());
    setBody("");
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>管理人に伝える</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-6 text-neutral-500">
          この部屋について気になる点があれば、運営に伝えてください。
        </p>

        <div className="space-y-2">
          <Label htmlFor="report-body">気になった点</Label>
          <Textarea
            id="report-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="例：宣伝や勧誘の投稿がある / 攻撃的な投稿が多い"
            className="min-h-[120px] rounded-2xl"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
          <Button
            className="rounded-2xl"
            onClick={submit}
            disabled={submitting}
          >
            送信
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
