"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  books: { id: string; title: string; author: string | null }[];
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
  books,
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
const normalizeText = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /[\s\u3000・･\.．,，、。:：;；!！?？'’"“”\-ー―—_＿/／\\\[\]［］()（）【】「」『』]/g,
      "",
    )
    .trim();

const duplicateCandidates = useMemo(() => {
  const normalizedTitle = normalizeText(title);
  const normalizedAuthor = normalizeText(author);

if (normalizedTitle.length < 2) return [];

  return books
    .map((book) => {
      const bookTitle = normalizeText(book.title);
      const bookAuthor = normalizeText(book.author ?? "");

      const titleExact = bookTitle === normalizedTitle;
      const titleClose =
        titleExact ||
        bookTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(bookTitle);

      const authorExact =
        Boolean(normalizedAuthor) && bookAuthor === normalizedAuthor;
      const authorClose =
        Boolean(normalizedAuthor) &&
        Boolean(bookAuthor) &&
        (authorExact ||
          bookAuthor.includes(normalizedAuthor) ||
          normalizedAuthor.includes(bookAuthor));

if (!titleClose) return null;

const score = titleExact && authorClose ? 3 : titleExact ? 2 : 1;

return { ...book, score };
    })
    .filter(
      (
        book,
      ): book is {
        id: string;
        title: string;
        author: string | null;
        score: number;
      } => book !== null,
    )
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja"))
    .slice(0, 3);
}, [author, books, title]);
  const sameAuthorCandidates = useMemo(() => {
  const normalizedTitle = normalizeText(title);
  const normalizedAuthor = normalizeText(author);

  if (!normalizedTitle || normalizedAuthor.length < 2) return [];
  if (duplicateCandidates.length > 0) return [];

  return books
    .filter((book) => {
      const bookAuthor = normalizeText(book.author ?? "");
      if (!bookAuthor) return false;

      return (
        bookAuthor === normalizedAuthor ||
        bookAuthor.includes(normalizedAuthor) ||
        normalizedAuthor.includes(bookAuthor)
      );
    })
    .sort((a, b) => a.title.localeCompare(b.title, "ja"))
    .slice(0, 3);
}, [author, books, duplicateCandidates.length, title]);
  
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
                        {duplicateCandidates.length > 0 && (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
    <p className="font-medium">すでに近い本があるかもしれません</p>
    <div className="mt-2 space-y-1">
      {duplicateCandidates.map((book) => (
        <div key={book.id} className="text-xs">
          <span className="font-medium">{book.title}</span>
          {book.author && (
            <span className="text-amber-800"> / {book.author}</span>
          )}
        </div>
      ))}
    </div>
    <p className="mt-2 text-xs text-amber-800">
      同じ本なら、既存の本ページを使ってください。別の本ならこのまま追加できます。
    </p>
  </div>
)}
            {sameAuthorCandidates.length > 0 && (
  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
    <p className="font-medium">この著者の本がすでにあります</p>
    <div className="mt-2 space-y-1">
      {sameAuthorCandidates.map((book) => (
        <div key={book.id} className="text-xs">
          <span className="font-medium">{book.title}</span>
          {book.author && (
            <span className="text-neutral-600"> / {book.author}</span>
          )}
        </div>
      ))}
    </div>
    <p className="mt-2 text-xs text-neutral-600">
      同じ本を追加しようとしていないか、念のため確認してください。別の本ならこのまま追加できます。
    </p>
  </div>
)}

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
