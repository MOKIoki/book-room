"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Book, UserProfile } from "@/lib/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  initialFavoriteBookId?: string | null;
  initialFavoriteNote?: string | null;
  initialPassphrase?: string | null;
  books: Book[];
  onSave: (profile: UserProfile) => void;
  onClose?: () => void;
  onRequestAddBook?: () => void;
};

export default function NameSetupDialog({
  open,
  initialName,
  initialColor,
  initialFavoriteBookId,
  initialFavoriteNote,
  initialPassphrase,
  books,
  onSave,
  onClose,
  onRequestAddBook,
}: NameSetupDialogProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [favoriteBookId, setFavoriteBookId] = useState<string>(
    initialFavoriteBookId ?? "",
  );
  const [favoriteNote, setFavoriteNote] = useState<string>(
    initialFavoriteNote ?? "",
  );
  const [passphrase, setPassphrase] = useState<string>(initialPassphrase ?? "");

  useEffect(() => {
    setName(initialName);
    setColor(initialColor);
    setFavoriteBookId(initialFavoriteBookId ?? "");
    setFavoriteNote(initialFavoriteNote ?? "");
    setPassphrase(initialPassphrase ?? "");
  }, [
    initialName,
    initialColor,
    initialFavoriteBookId,
    initialFavoriteNote,
    initialPassphrase,
    open,
  ]);

  const sortedBooks = useMemo(
    () => [...books].sort((a, b) => a.title.localeCompare(b.title, "ja")),
    [books],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose?.();
      }}
    >
      <DialogContent className="w-[calc(100vw-24px)] max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl p-0">
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
            <div className="flex w-full flex-wrap gap-2 overflow-hidden sm:gap-3">
              {colorOptions.map((option) => {
                const selected = color === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setColor(option.value)}
                    style={{
                      flex: "0 0 calc(50% - 0.25rem)",
                      minWidth: 0,
                      maxWidth: "calc(50% - 0.25rem)",
                    }}
                    className={`block overflow-hidden rounded-2xl border p-2 text-left sm:p-3 ${selected ? "border-neutral-900 ring-2 ring-neutral-300" : "border-neutral-200"}`}
                  >
                    <div className="mb-1.5 flex min-w-0 items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${option.chip}`} />
                      <span className="min-w-0 truncate text-sm font-medium">{option.label}</span>
                    </div>
                    <div className={`block min-w-0 truncate rounded-xl px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm ${option.bubble}`}>サンプル投稿</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>お気に入りの本(任意)</Label>
            <div className="flex gap-2">
              <select
                value={favoriteBookId}
                onChange={(e) => setFavoriteBookId(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-3 text-sm"
              >
                <option value="">選択しない</option>
                {sortedBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                    {book.author ? ` / ${book.author}` : ""}
                  </option>
                ))}
              </select>
              {onRequestAddBook && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-2xl"
                  onClick={onRequestAddBook}
                  aria-label="本を追加"
                  title="本を追加"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              プロフィール欄に「お気に入りの1冊」として表示されます。
            </p>
          </div>

          {favoriteBookId && (
            <div className="space-y-2">
              <Label>一言(任意)</Label>
              <Textarea
                value={favoriteNote}
                onChange={(e) => setFavoriteNote(e.target.value)}
                placeholder="例: 何度読んでも新しい発見がある。"
                className="min-h-[100px] rounded-2xl"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>合言葉(任意)</Label>
            <Input
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="例: ことりのさえずり"
              className="rounded-2xl"
            />
            <p className="text-xs text-neutral-500">
              別の端末から同じ名前で入る時に本人確認に使います。他の人には見えません。
            </p>
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
                favoriteBookId: favoriteBookId || null,
                favoriteNote: favoriteBookId ? favoriteNote.trim() || null : null,
                passphrase: passphrase.trim() || null,
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
