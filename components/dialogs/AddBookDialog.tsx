"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AddBookDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 本を追加した直後に、最初の部屋を自動作成して最初の投稿を入れる。
   * 引数は必須 3 点のみ。description は後から編集する運用。
   */
  onCreate: (payload: {
    title: string;
    author: string;
    firstMessage: string;
  }) => Promise<void>;
};

export default function AddBookDialog({
  open,
  onOpenChange,
  onCreate,
}: AddBookDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 開き直したときにステップと入力を初期化する
  useEffect(() => {
    if (open) {
      setStep(1);
      setTitle("");
      setAuthor("");
      setFirstMessage("");
      setSubmitting(false);
    }
  }, [open]);

  const goNext = () => {
    if (!title.trim()) {
      alert("本のタイトルを入力してください");
      return;
    }
    setStep(2);
  };

  const submit = async () => {
    if (!firstMessage.trim()) {
      alert("最初のことばを入力してください");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        author: author.trim(),
        firstMessage: firstMessage.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "本を追加" : "最初のことば"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>タイトル</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 斜陽"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label>著者</Label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="例: 太宰治"
                className="rounded-2xl"
              />
            </div>
            <p className="text-xs text-neutral-500">
              本の説明などは後からでも編集できます。
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>この本を読んで、最初に出てくることばは?</Label>
              <Textarea
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder="一言でも、長くても OK。"
                className="min-h-[120px] rounded-2xl"
              />
            </div>
            <p className="text-xs text-neutral-500">
              この投稿が「{title || "この本"}」の最初の部屋のきっかけになります。
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => onOpenChange(false)}
              >
                閉じる
              </Button>
              <Button className="rounded-2xl" onClick={goNext}>
                次へ
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setStep(1)}
              >
                戻る
              </Button>
              <Button
                className="rounded-2xl"
                onClick={submit}
                disabled={submitting}
              >
                追加する
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
