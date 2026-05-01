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
  onRequestTransfer?: () => void;
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
  onRequestTransfer,
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
  const [mode, setMode] = useState<"create" | "claim">("create");  // X1: モード切替
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
      <DialogContent className="w-[calc(100vw-16px)] sm:w-[calc(100vw-32px)] max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl p-0">
          <DialogHeader className="px-4 pt-6 pb-2 sm:px-6">
           <DialogTitle>名前を設定</DialogTitle>
          </DialogHeader>

            <div className="space-y-5 py-3 max-h-[65vh] overflow-y-auto px-4">
              >
                新しく作る
              </button>
              <button
                type="button"
                onClick={() => setMode("claim")}
                className={`flex-1 rounded-xl px-3 py-2 text-sm ${
                  mode === "claim"
                    ? "bg-white shadow font-medium"
                    : "text-neutral-500"
                }`}
              >
                既存を引き継ぐ
              </button>
            </div>
          )}

          <div className="space-y-2">
             <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: hiro / 読書猫 / N"
              className="rounded-2xl"
            />
          </div>
           {/* X1: create モードのみ表示 (claim 時は既存値を保持して非表示) */}
        {mode === "create" && (
            <>
              {/* X1 補助: 新規作成事故防止のヒント */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                以前にこの名前でアクセスしたことがある場合は、上の「既存を引き継ぐ」を選んでください。新しく作ると別プロフィール扱いになります。
              </div>
              <div className="space-y-2">
                <Label>発言の色</Label>
                <div className="grid w-full grid-cols-2 gap-4">
                  {colorOptions.map((option) => {
                    const selected = color === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setColor(option.value)}
                        className={`w-full overflow-hidden rounded-2xl border p-2 sm:p-3 text-left ${selected ? "border-neutral-900 ring-2 ring-neutral-300" : "border-neutral-200"}`}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className={`h-3 w-3 shrink-0 rounded-full ${option.chip}`} />
                          <span className="min-w-0 truncate text-[15px] font-medium">{option.label}</span>
                        </div>
                        <div className={`mt-2.5 block min-w-0 truncate rounded-xl px-3 py-1.5 text-sm ${option.bubble}`}>サンプル投稿</div>
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
            </>
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

          {onRequestTransfer && (
            <div className="border-t pt-4 text-center">
              <button
                type="button"
                onClick={onRequestTransfer}
                className="text-xs text-neutral-500 underline hover:text-neutral-700"
              >
                別の端末で作ったプロフィールを使いたい場合はこちら
              </button>
            </div>
          )}
        </div>
        <DialogFooter className="border-t px-4 py-3 sm:py-4">
          {onClose && (
            <Button variant="outline" className="rounded-2xl" onClick={onClose}>
              閉じる
            </Button>
          )}
          <Button
            className="rounded-2xl w-full sm:w-auto"
            onClick={async () => {
              if (!name.trim()) {
                alert("表示名を入力してください");
                return;
              }
              if (mode === "claim" && onClaim) {
                // X1: 既存 profile を claim
                await onClaim(name.trim(), passphrase.trim());
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
            {mode === "claim" ? "引き継ぐ" : "保存する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
