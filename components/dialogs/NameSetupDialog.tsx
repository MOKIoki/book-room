"use client";

import React, { useEffect, useState } from "react";
import type { UserProfile } from "@/lib/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const colorOptions = [
  { value: "slate", label: "グレー", bubble: "bg-slate-100 text-slate-800", chip: "bg-slate-500", name: "text-slate-700" },
  { value: "red", label: "赤", bubble: "bg-red-100 text-red-900", chip: "bg-red-500", name: "text-red-700" },
  { value: "blue", label: "青", bubble: "bg-blue-100 text-blue-900", chip: "bg-blue-500", name: "text-blue-700" },
  { value: "green", label: "緑", bubble: "bg-green-100 text-green-900", chip: "bg-green-500", name: "text-green-700" },
  { value: "purple", label: "紫", bubble: "bg-purple-100 text-purple-900", chip: "bg-purple-500", name: "text-purple-700" },
  { value: "amber", label: "黄", bubble: "bg-amber-100 text-amber-900", chip: "bg-amber-500", name: "text-amber-700" },
] as const;

type NameSetupDialogProps = {
  open: boolean;
  initialName: string;
  initialColor: string;
  onSave: (profile: UserProfile) => void;
  onClose?: () => void;
};

export default function NameSetupDialog({
  open,
  initialName,
  initialColor,
  onSave,
  onClose,
}: NameSetupDialogProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    setName(initialName);
    setColor(initialColor);
  }, [initialName, initialColor, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose?.();
      }}
    >
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>名前を設定</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>表示名</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: tomoki / 読書猫 / N"
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label>発言の色</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {colorOptions.map((option) => {
                const selected = color === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setColor(option.value)}
                    className={`rounded-2xl border p-3 text-left ${selected ? "border-neutral-900 ring-2 ring-neutral-300" : "border-neutral-200"}`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${option.chip}`} />
                      <span className="text-sm font-medium">{option.label}</span>
                    </div>
                    <div className={`rounded-xl px-3 py-2 text-sm ${option.bubble}`}>サンプル投稿</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          {onClose && (
            <Button variant="outline" className="rounded-2xl" onClick={onClose}>
              閉じる
            </Button>
          )}
          <Button
            className="rounded-2xl"
            onClick={() => {
              if (!name.trim()) {
                alert("表示名を入力してください");
                return;
              }
              onSave({
                name: name.trim(),
                color,
              });
            }}
          >
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
