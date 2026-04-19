"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CreateRoomDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: {
    title: string;
    entryType: "open" | "approval";
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
  }) => Promise<void>;
};

export default function CreateRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateRoomDialogProps) {
  const [title, setTitle] = useState("");
  const [entryType, setEntryType] = useState<"open" | "approval">("open");
  const [spoiler, setSpoiler] = useState<"none" | "progress" | "read">("none");
  const [durationHours, setDurationHours] = useState("2");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    await onCreate({
      title: title.trim(),
      entryType,
      spoiler,
      durationHours: Number(durationHours),
      firstMessage: note.trim(),
    });
    setTitle("");
    setEntryType("open");
    setSpoiler("none");
    setDurationHours("2");
    setNote("");
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>部屋を作る</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>話題</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: Kはなぜ自殺したか"
              className="rounded-2xl"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>参加方式</Label>
              <Select value={entryType} onValueChange={(v: "open" | "approval") => setEntryType(v)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">飛び込みOK</SelectItem>
                  <SelectItem value="approval">承認制</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>ネタバレ範囲</Label>
              <Select value={spoiler} onValueChange={(v: "none" | "progress" | "read") => setSpoiler(v)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未読歓迎</SelectItem>
                  <SelectItem value="progress">途中まで</SelectItem>
                  <SelectItem value="read">読了者向け</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>部屋の期限</Label>
            <Select value={durationHours} onValueChange={setDurationHours}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1時間</SelectItem>
                <SelectItem value="2">2時間</SelectItem>
                <SelectItem value="6">6時間</SelectItem>
                <SelectItem value="24">24時間</SelectItem>
                <SelectItem value="72">3日</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>最初のひとこと</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 先生にお嬢さんを奪われたから、だけでは足りない気もします。"
              className="min-h-[120px] rounded-2xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-2xl" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
          <Button className="rounded-2xl" onClick={submit} disabled={submitting}>
            作成する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}