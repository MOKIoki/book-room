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
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
    scheduledStartAt: string | null;
  }) => Promise<void>;
};

function toLocalDatetimeString(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduledAt() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return toLocalDatetimeString(d);
}

export default function CreateRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateRoomDialogProps) {
  const [title, setTitle] = useState("");
  const [spoiler, setSpoiler] = useState<"none" | "progress" | "read">("none");
  const [durationHours, setDurationHours] = useState("336");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState<string>(defaultScheduledAt);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || submitting) return;

    let scheduledISO: string | null = null;
    if (mode === "scheduled") {
      const ms = new Date(scheduledAt).getTime();
      if (!ms || Number.isNaN(ms)) {
        alert("開始日時を入力してください");
        return;
      }
      if (ms <= Date.now()) {
        alert("開始日時は現在より未来にしてください");
        return;
      }
      scheduledISO = new Date(scheduledAt).toISOString();
    }

    setSubmitting(true);
    await onCreate({
      title: title.trim(),
      spoiler,
      durationHours: Number(durationHours),
      firstMessage: note.trim(),
      scheduledStartAt: scheduledISO,
    });
    setTitle("");
    setSpoiler("none");
    setDurationHours("2");
    setNote("");
    setMode("now");
    setScheduledAt(defaultScheduledAt());
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-xl">
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

          <div className="space-y-2">
            <Label>開き方</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={`rounded-2xl border p-3 text-left text-sm ${mode === "now" ? "border-neutral-900 ring-2 ring-neutral-300" : "border-neutral-200"}`}
              >
                <div className="font-medium">すぐ開ける</div>
                <div className="text-xs text-neutral-500">作成と同時に参加できます</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("scheduled")}
                className={`rounded-2xl border p-3 text-left text-sm ${mode === "scheduled" ? "border-neutral-900 ring-2 ring-neutral-300" : "border-neutral-200"}`}
              >
                <div className="font-medium">予約読書会</div>
                <div className="text-xs text-neutral-500">開始日時を決めて先着5人</div>
              </button>
            </div>
          </div>

          {mode === "scheduled" && (
            <div className="space-y-2">
              <Label>開始日時</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="rounded-2xl"
              />
              <div className="text-xs text-neutral-500">
                開始時刻になるまでは投稿できません。作成者は自動で1人目として予約されます。
              </div>
            </div>
          )}

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

          <div className="space-y-2">
            <Label>{mode === "scheduled" ? "開始からの期限" : "部屋の期限"}</Label>
            <Select value={durationHours} onValueChange={setDurationHours}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="72">3日</SelectItem>
                <SelectItem value="168">7日</SelectItem>
                <SelectItem value="336">14日</SelectItem>
                <SelectItem value="720">30日</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{mode === "scheduled" ? "予告のひとこと(任意)" : "最初のひとこと"}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === "scheduled"
                  ? "例: 第1章を中心に話しましょう。開始時刻までお待ちください。"
                  : "例: 先生にお嬢さんを奪われたから、だけでは足りない気もします。"
              }
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
