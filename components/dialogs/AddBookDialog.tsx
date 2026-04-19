"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AddBookDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: {
    title: string;
    author: string;
    description: string;
  }) => Promise<void>;
};

export default function AddBookDialog({
  open,
  onOpenChange,
  onCreate,
}: AddBookDialogProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      alert("本のタイトルを入力してください");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    await onCreate({
      title: title.trim(),
      author: author.trim(),
      description: description.trim(),
    });
    setTitle("");
    setAuthor("");
    setDescription("");
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>本を追加</DialogTitle>
        </DialogHeader>

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

          <div className="space-y-2">
            <Label>説明</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例: 戦後文学の代表作のひとつ。"
              className="min-h-[120px] rounded-2xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
          <Button className="rounded-2xl" onClick={submit} disabled={submitting}>
            追加する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}