"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  BookOpen,
  MessageSquare,
  Users,
  Plus,
  ArrowLeft,
  Lock,
  DoorOpen,
  Clock3,
  Mail,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// =====================================================
// 型定義
// =====================================================

type Message = {
  id: number;
  room_id: number;
  user_name: string;
  user_color: string | null;
  text: string;
  created_at: string;
};

type Reservation = {
  id: number;
  room_id: number;
  profile_id: number;
  profile_name: string | null;
  created_at: string;
};

type Room = {
  id: number;
  book_id: string;
  title: string;
  entry_type: "welcome" | "deep" | "small" | "open" | "approval";
  spoiler: "none" | "progress" | "read";
  active_users: number;
  updated_at: string;
  expires_at: string | null;
  created_by_profile_id: number | null;
  scheduled_start_at: string | null;
  messages: Message[];
  reservations: Reservation[];
};

const RESERVATION_CAPACITY = 5;

type BookTrace = {
  id: number;
  book_id: string;
  room_id: number | null;
  room_title: string | null;
  body: string;
  created_at: string;
  created_by_name: string | null;
};

type Book = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  updated_at?: string | null;
  updated_by_name?: string | null;
  rooms: Room[];
  traces: BookTrace[];
};

type UserProfile = {
  name: string;
  color: string;
  favoriteBookId?: string | null;
  favoriteNote?: string;
  passphrase?: string;
};

type ProfileRecord = {
  id: number;
  name: string;
  color: string;
  favorite_book_id: string | null;
  favorite_note: string | null;
  passphrase: string | null;
  created_at: string;
  updated_at: string;
};

// =====================================================
// 定数
// =====================================================

const MAX_ACTIVE_ROOMS_PER_BOOK = 6;
const NEW_WINDOW_HOURS = 12;

const spoilerMap = {
  none: { label: "未読歓迎", variant: "secondary" as const },
  progress: { label: "途中まで", variant: "outline" as const },
  read: { label: "読了者向け", variant: "default" as const },
};

const entryMap = {
  welcome: { label: "ふらっと歓迎", icon: DoorOpen },
  deep: { label: "じっくり対話", icon: MessageSquare },
  small: { label: "少人数向け", icon: Lock },
  // 既存データ互換
  open: { label: "ふらっと歓迎", icon: DoorOpen },
  approval: { label: "少人数向け", icon: Lock },
};

const colorOptions = [
  {
    value: "slate",
    label: "グレー",
    bubble: "bg-slate-100 text-slate-800",
    chip: "bg-slate-500",
    name: "text-slate-700",
  },
  {
    value: "red",
    label: "赤",
    bubble: "bg-red-100 text-red-900",
    chip: "bg-red-500",
    name: "text-red-700",
  },
  {
    value: "blue",
    label: "青",
    bubble: "bg-blue-100 text-blue-900",
    chip: "bg-blue-500",
    name: "text-blue-700",
  },
  {
    value: "green",
    label: "緑",
    bubble: "bg-green-100 text-green-900",
    chip: "bg-green-500",
    name: "text-green-700",
  },
  {
    value: "purple",
    label: "紫",
    bubble: "bg-purple-100 text-purple-900",
    chip: "bg-purple-500",
    name: "text-purple-700",
  },
  {
    value: "amber",
    label: "黄",
    bubble: "bg-amber-100 text-amber-900",
    chip: "bg-amber-500",
    name: "text-amber-700",
  },
] as const;

// =====================================================
// ユーティリティ
// =====================================================

function getColorStyle(color?: string | null) {
  return colorOptions.find((c) => c.value === color) ?? colorOptions[0];
}

function isRoomExpired(room: Room) {
  if (!room.expires_at) return false;
  return new Date(room.expires_at).getTime() <= Date.now();
}

function getActiveRooms(rooms: Room[]) {
  return rooms.filter((room) => !isRoomExpired(room));
}

function getMsUntilLetterAvailable(room: Room) {
  if (!room.expires_at) return 0;
  const expiresAt = new Date(room.expires_at).getTime();
  const availableAt = expiresAt - 60 * 60 * 1000;
  return availableAt - Date.now();
}

function canCreateLetterNow(room: Room) {
  if (isRoomExpired(room)) return false;
  return getMsUntilLetterAvailable(room) <= 0;
}

function isRecentTrace(trace: BookTrace) {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(trace.created_at).getTime() <= THIRTY_DAYS_MS;
}

function isNewItem(value?: string | null) {
  if (!value) return false;
  const ms = Date.now() - new Date(value).getTime();
  return ms <= NEW_WINDOW_HOURS * 60 * 60 * 1000;
}

function isBookNew(book: Book) {
  if (isNewItem(book.updated_at)) return true;
  return book.rooms.some((room) => isNewItem(room.updated_at));
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 1000 / 60);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}日前`;
}

function formatDurationFromMs(ms: number) {
  if (ms <= 0) return "いま残せます";
  const totalMin = Math.ceil(ms / 1000 / 60);
  if (totalMin < 60) return `あと${totalMin}分`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return `あと${hours}時間`;
  return `あと${hours}時間${mins}分`;
}

function formatExpiresAt(value: string | null) {
  if (!value) return "期限なし";
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.floor(diffMs / 1000 / 60);
  if (diffMin <= 0) return "終了";
  if (diffMin < 60) return `残り${diffMin}分`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `残り${diffHour}時間`;
  const diffDay = Math.floor(diffHour / 24);
  return `残り${diffDay}日`;
}

// 投稿文字列を URL 自動リンク + 改行 <br/> 挿入でレンダリング
function renderMessageContent(text: string): React.ReactNode {
  const urlRegex = /https?:\/\/[^\s]+/g;

  // まず URL を抽出して (文字列 | <a>) の配列にする
  const pieces: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let urlKey = 0;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pieces.push(text.slice(lastIndex, match.index));
    }
    pieces.push(
      <a
        key={`u${urlKey++}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
      >
        {match[0]}
      </a>,
    );
    lastIndex = urlRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    pieces.push(text.slice(lastIndex));
  }
  if (pieces.length === 0) pieces.push(text);

  // テキスト断片の \n を <br/> に置換（URL 内の改行は存在しないので安全）
  const out: React.ReactNode[] = [];
  pieces.forEach((piece, i) => {
    if (typeof piece === "string") {
      const lines = piece.split("\n");
      lines.forEach((line, j) => {
        if (j > 0) out.push(<br key={`br-${i}-${j}`} />);
        if (line.length > 0) out.push(line);
      });
    } else {
      out.push(piece);
    }
  });
  return out;
}

function slugifyTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// 1分ごとに再描画して「◯分前」等の表示を自動更新するフック
function useNow(intervalMs: number = 60_000) {
  const [, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

// ユーザーには生のエラーメッセージを見せず、コンソールだけに残す
function showError(prefix: string, error: unknown) {
  console.error(error);
  alert(`${prefix}に失敗しました。少し時間をおいてもう一度お試しください。`);
}

// 「最後に部屋を見た時刻」を localStorage に保存するためのヘルパー
const LAST_SEEN_KEY = "book-room-last-seen";
function readLastSeenMap(): Record<number, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<number, string>) : {};
  } catch {
    return {};
  }
}
function writeLastSeenMap(map: Record<number, string>) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// =====================================================
// 小さな表示コンポーネント
// =====================================================

function NewMark() {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-red-500">
      new!
    </span>
  );
}

function RoomBadge({ room }: { room: Room }) {
  const EntryIcon = entryMap[room.entry_type].icon;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" className="gap-1 rounded-full">
        <EntryIcon className="h-3 w-3" />
        {entryMap[room.entry_type].label}
      </Badge>
      <Badge
        variant={spoilerMap[room.spoiler].variant}
        className="rounded-full"
      >
        {spoilerMap[room.spoiler].label}
      </Badge>
    </div>
  );
}

// どの画面からでも名前設定を開けるようにするための共通ボタン
function ProfileButton({
  currentProfile,
  onClick,
}: {
  currentProfile: UserProfile | null;
  onClick: () => void;
}) {
  const profileColor = getColorStyle(currentProfile?.color);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm hover:bg-neutral-50"
    >
      <span className={`h-3 w-3 rounded-full ${profileColor.chip}`} />
      <span className="whitespace-nowrap">
        {currentProfile ? currentProfile.name : "名前を設定"}
      </span>
    </button>
  );
}

// =====================================================
// ダイアログ: 名前設定
// =====================================================

function NameSetupDialog({
  open,
  onOpenChange,
  initialName,
  initialColor,
  initialFavoriteBookId,
  initialFavoriteNote,
  initialPassphrase,
  books,
  onSave,
  onOpenAddBook,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialColor: string;
  initialFavoriteBookId: string | null | undefined;
  initialFavoriteNote: string | undefined;
  initialPassphrase: string | undefined;
  books: Book[];
  onSave: (profile: UserProfile) => Promise<void>;
  onOpenAddBook: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [favoriteBookId, setFavoriteBookId] = useState<string>(
    initialFavoriteBookId ?? "__none__",
  );
  const [favoriteNote, setFavoriteNote] = useState(initialFavoriteNote ?? "");
  const [passphrase, setPassphrase] = useState(initialPassphrase ?? "");

  useEffect(() => {
    setName(initialName);
    setColor(initialColor);
    setFavoriteBookId(initialFavoriteBookId ?? "__none__");
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

  const sortedBooks = useMemo(() => {
    const copied = [...books];
    copied.sort((a, b) => a.title.localeCompare(b.title, "ja"));
    return copied;
  }, [books]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>名前を設定</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>表示名</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: hiro / 読書猫 / N"
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
                    className={`rounded-2xl border p-3 text-left ${
                      selected
                        ? "border-neutral-900 ring-2 ring-neutral-300"
                        : "border-neutral-200"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${option.chip}`} />
                      <span className="text-sm font-medium">
                        {option.label}
                      </span>
                    </div>
                    <div
                      className={`rounded-xl px-3 py-2 text-sm ${option.bubble}`}
                    >
                      サンプル投稿
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 p-4">
            <div className="mb-3">
              <div className="text-sm font-medium text-neutral-900">
                ずっと好きな1冊
              </div>
              <div className="text-xs text-neutral-500">
                あなたが大切にしている1冊を教えてください。
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>本を選ぶ（任意）</Label>
                <Select value={favoriteBookId} onValueChange={setFavoriteBookId}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="選択しない" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">選択しない</SelectItem>
                    {sortedBooks.map((book) => (
                      <SelectItem key={book.id} value={book.id}>
                        {book.title}
                        {book.author ? ` / ${book.author}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-neutral-500">
                    一覧にない本は、先に追加できます。
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenAddBook();
                    }}
                  >
                    本を追加する
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>ひとこと（任意）</Label>
                <Textarea
                  value={favoriteNote}
                  onChange={(e) => setFavoriteNote(e.target.value)}
                  placeholder="例: 読むたびに見え方が変わる1冊です。"
                  className="min-h-[100px] rounded-2xl"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>合言葉（任意）</Label>
            <Input
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="別端末でも同じ名前を使いたいときの合言葉"
              className="rounded-2xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            className="rounded-2xl"
            onClick={async () => {
              if (!name.trim()) {
                alert("表示名を入力してください");
                return;
              }
              await onSave({
                name: name.trim(),
                color,
                favoriteBookId:
                  favoriteBookId === "__none__" ? null : favoriteBookId,
                favoriteNote: favoriteNote.trim(),
                passphrase: passphrase.trim(),
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

// =====================================================
// ダイアログ: 管理人に伝える
// =====================================================

function ContactDialog({
  open,
  onOpenChange,
  defaultName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSubmit: (payload: {
    category: "bug" | "request" | "book_request" | "report";
    body: string;
    senderName: string;
  }) => Promise<void>;
}) {
  const [category, setCategory] = useState<
    "bug" | "request" | "book_request" | "report"
  >("request");
  const [body, setBody] = useState("");
  const [senderName, setSenderName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSenderName(defaultName);
  }, [defaultName, open]);

  const submit = async () => {
    if (!body.trim()) {
      alert("内容を入力してください");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    await onSubmit({
      category,
      body: body.trim(),
      senderName: senderName.trim(),
    });
    setBody("");
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>管理人に伝える</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>種別</Label>
            <Select
              value={category}
              onValueChange={(
                v: "bug" | "request" | "book_request" | "report",
              ) => setCategory(v)}
            >
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">不具合</SelectItem>
                <SelectItem value="request">要望</SelectItem>
                <SelectItem value="book_request">本の追加依頼</SelectItem>
                <SelectItem value="report">
                  問題のある投稿・部屋の報告
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>内容</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="気になったことや改善してほしいことを書いてください。"
              className="min-h-[140px] rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label>名前（任意）</Label>
            <Input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="空欄でも送れます"
              className="rounded-2xl"
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
            送る
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// ダイアログ: 自分の記録
// =====================================================

function MyLogDialog({
  open,
  onOpenChange,
  profile,
  books,
  unreadRooms,
  reservations,
  onOpenRoom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile | null;
  books: Book[];
  unreadRooms: {
    bookId: string;
    bookTitle: string;
    roomId: number;
    roomTitle: string;
    newCount: number;
    latestAt: string;
  }[];
  reservations: {
    bookId: string;
    bookTitle: string;
    roomId: number;
    roomTitle: string;
    scheduledStartAt: string;
    reservedCount: number;
    reminder: "24h" | "1h" | null;
  }[];
  onOpenRoom: (bookId: string, roomId: number) => void;
}) {
  const myName = profile?.name?.trim();

  const myRooms = useMemo(() => {
    if (!myName) return [];
    return books
      .flatMap((book) =>
        book.rooms
          .filter((room) =>
            room.messages.some((message) => message.user_name === myName),
          )
          .map((room) => ({
            bookId: book.id,
            bookTitle: book.title,
            roomId: room.id,
            roomTitle: room.title,
            updatedAt: room.updated_at,
          })),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [books, myName]);

  const myTraces = useMemo(() => {
    if (!myName) return [];
    return books
      .flatMap((book) =>
        book.traces
          .filter((trace) => trace.created_by_name === myName)
          .map((trace) => ({
            id: trace.id,
            bookId: book.id,
            bookTitle: book.title,
            body: trace.body,
            createdAt: trace.created_at,
          })),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [books, myName]);

  const myBooks = useMemo(() => {
    if (!myName) return [];
    return books
      .filter(
        (book) =>
          book.updated_by_name === myName ||
          book.traces.some((trace) => trace.created_by_name === myName),
      )
      .map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        updatedAt: book.updated_at ?? "",
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [books, myName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <div className="rounded-2xl bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-500">
          記録は現在の表示名に基づいて表示されます。表示名を変更すると、以前の記録が表示されなくなることがあります。
        </div>

        {!myName ? (
          <div className="py-4 text-sm text-neutral-500">
            名前を設定すると、自分の記録を見られます。
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {reservations.length > 0 && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-sky-700">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  予約中の読書会
                </div>
                <div className="space-y-3">
                  {reservations.map((r) => (
                    <button
                      key={r.roomId}
                      type="button"
                      onClick={() => onOpenRoom(r.bookId, r.roomId)}
                      className="block w-full rounded-2xl bg-white px-4 py-3 text-left shadow-sm hover:bg-neutral-50"
                    >
                      <div className="flex items-center gap-2 text-sm text-neutral-500">
                        {r.reminder && (
                          <span
                            className={`h-2 w-2 rounded-full ${r.reminder === "1h" ? "bg-sky-600" : "bg-sky-400"}`}
                            aria-label={
                              r.reminder === "1h" ? "開始1時間前" : "開始24時間前"
                            }
                          />
                        )}
                        {r.bookTitle}
                      </div>
                      <div className="font-medium">{r.roomTitle}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        開始:{" "}
                        {new Date(r.scheduledStartAt).toLocaleString("ja-JP", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        <span className="ml-2">
                          予約 {r.reservedCount}/{RESERVATION_CAPACITY}
                        </span>
                        {r.reminder === "1h" && (
                          <span className="ml-2 text-sky-700">
                            まもなく開始（1時間以内）
                          </span>
                        )}
                        {r.reminder === "24h" && (
                          <span className="ml-2 text-sky-700">
                            24時間以内
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {unreadRooms.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-red-700">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  新着（自分が作った部屋）
                </div>
                <div className="space-y-3">
                  {unreadRooms.map((room) => (
                    <button
                      key={room.roomId}
                      type="button"
                      onClick={() => onOpenRoom(room.bookId, room.roomId)}
                      className="block w-full rounded-2xl bg-white px-4 py-3 text-left shadow-sm hover:bg-neutral-50"
                    >
                      <div className="text-sm text-neutral-500">
                        {room.bookTitle}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{room.roomTitle}</div>
                        <div className="whitespace-nowrap text-xs font-medium text-red-600">
                          新しい発言 {room.newCount}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {formatRelativeTime(room.latestAt)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="mb-3 text-sm font-medium text-neutral-900">
                作った・参加した部屋
              </div>
              <div className="space-y-3">
                {myRooms.length === 0 ? (
                  <div className="text-sm text-neutral-500">
                    まだ記録はありません。
                  </div>
                ) : (
                  myRooms.map((room, index) => (
                    <div
                      key={`${room.roomId}-${index}`}
                      className="rounded-2xl bg-neutral-50 px-4 py-3"
                    >
                      <div className="text-sm text-neutral-500">
                        {room.bookTitle}
                      </div>
                      <div className="font-medium">{room.roomTitle}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {formatRelativeTime(room.updatedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="mb-3 text-sm font-medium text-neutral-900">
                残した置き手紙
              </div>
              <div className="space-y-3">
                {myTraces.length === 0 ? (
                  <div className="text-sm text-neutral-500">
                    まだ置き手紙はありません。
                  </div>
                ) : (
                  myTraces.map((trace) => (
                    <div
                      key={trace.id}
                      className="rounded-2xl bg-neutral-50 px-4 py-3"
                    >
                      <div className="text-sm text-neutral-500">
                        {trace.bookTitle}
                      </div>
                      <div className="text-sm leading-6">{trace.body}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {formatRelativeTime(trace.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="mb-3 text-sm font-medium text-neutral-900">
                追加・更新した本
              </div>
              <div className="space-y-3">
                {myBooks.length === 0 ? (
                  <div className="text-sm text-neutral-500">
                    まだ本の記録はありません。
                  </div>
                ) : (
                  myBooks.map((book) => (
                    <div
                      key={book.id}
                      className="rounded-2xl bg-neutral-50 px-4 py-3"
                    >
                      <div className="font-medium">{book.title}</div>
                      <div className="text-sm text-neutral-500">
                        {book.author}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {formatRelativeTime(book.updatedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// ダイアログ: プロフィールメニュー（モバイル）
// =====================================================

function ProfileMenuDialog({
  open,
  onOpenChange,
  currentProfile,
  profileColor,
  onOpenProfileSetting,
  onOpenMyLog,
  onClearLocalProfile,
  onOpenContact,
  unreadCount,
  hasReminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProfile: UserProfile | null;
  profileColor: ReturnType<typeof getColorStyle>;
  onOpenProfileSetting: () => void;
  onOpenMyLog: () => void;
  onClearLocalProfile: () => void;
  onOpenContact: () => void;
  unreadCount: number;
  hasReminder: boolean;
}) {
  const closeAndRun = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>メニュー</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <button
            type="button"
            onClick={() => closeAndRun(onOpenProfileSetting)}
            className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
          >
            <span className={`h-3 w-3 rounded-full ${profileColor.chip}`} />
            <span>{currentProfile ? "名前や設定を編集" : "名前を設定"}</span>
          </button>

          <button
            type="button"
            onClick={() => closeAndRun(onOpenMyLog)}
            className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
          >
            <span className="flex items-center gap-2">
              自分の記録
              {hasReminder && unreadCount === 0 && (
                <span
                  className="h-2 w-2 rounded-full bg-sky-500"
                  aria-label="予約リマインダーあり"
                />
              )}
            </span>
            {unreadCount > 0 ? (
              <span className="inline-flex items-center gap-2 text-xs text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                新着 {unreadCount}
              </span>
            ) : hasReminder ? (
              <span className="text-xs text-sky-700">予約あり</span>
            ) : null}
          </button>

          {currentProfile && (
            <button
              type="button"
              onClick={() => closeAndRun(onClearLocalProfile)}
              className="flex w-full items-center rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
            >
              この端末の設定を解除
            </button>
          )}

          <button
            type="button"
            onClick={() => closeAndRun(onOpenContact)}
            className="flex w-full items-center rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
          >
            管理人に伝える
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// ダイアログ: 本を追加
// =====================================================

function AddBookDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: {
    title: string;
    author: string;
    description: string;
  }) => Promise<void>;
}) {
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

// =====================================================
// ダイアログ: 本を編集
// =====================================================

function EditBookDialog({
  open,
  onOpenChange,
  book,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onSave: (payload: {
    id: string;
    title: string;
    author: string;
    description: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!book) return;
    setTitle(book.title ?? "");
    setAuthor(book.author ?? "");
    setDescription(book.description ?? "");
  }, [book, open]);

  const submit = async () => {
    if (!book) return;
    if (!title.trim()) {
      alert("本のタイトルを入力してください");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    await onSave({
      id: book.id,
      title: title.trim(),
      author: author.trim(),
      description: description.trim(),
    });
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>本を編集</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>タイトル</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label>著者</Label>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label>説明</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px] rounded-2xl"
            />
          </div>

          {book?.updated_by_name && (
            <div className="text-xs text-neutral-500">
              最終更新者: {book.updated_by_name}
            </div>
          )}
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
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// ダイアログ: 部屋を延長
// =====================================================

function ExtendRoomDialog({
  open,
  onOpenChange,
  onExtend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtend: (hours: number) => Promise<void>;
}) {
  const [hours, setHours] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onExtend(Number(hours));
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>部屋を延長</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>延長時間</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">30分</SelectItem>
                <SelectItem value="1">1時間</SelectItem>
                <SelectItem value="3">3時間</SelectItem>
                <SelectItem value="12">12時間</SelectItem>
              </SelectContent>
            </Select>
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
            延長する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// ダイアログ: 置き手紙を書く
// =====================================================

function AddTraceDialog({
  open,
  onOpenChange,
  roomTitle,
  roomExpiresAt,
  existingTrace,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomTitle: string;
  roomExpiresAt: string | null;
  existingTrace: BookTrace | null;
  onCreate: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setBody(existingTrace?.body ?? "");
  }, [existingTrace, open]);

  const submit = async () => {
    if (!body.trim()) {
      alert("置き手紙の内容を入力してください");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    await onCreate(body.trim());
    setBody("");
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>置き手紙を書く</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-600">
            <div className="font-medium text-neutral-800">置き手紙とは</div>

            <div className="mt-3 leading-7">
              この部屋で生まれた論点や空気を、あとから来る人へ短く残すためのものです。
              <br />
              要約や議事録ではなく、部屋が消えたあとにも残る熱量です。
            </div>

            <div className="mt-3 text-xs leading-5 text-neutral-500">
              ※1部屋につき1件まで / 部屋終了の1時間前から記入できます / 表示されるのは部屋終了後です
            </div>

            {existingTrace && (
              <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                この部屋の置き手紙はすでに残されています。
              </div>
            )}
          </div>

          <div className="text-sm text-neutral-500">
            元の部屋: {roomTitle} ・ 終了予定: {formatExpiresAt(roomExpiresAt)}
          </div>

          {existingTrace ? (
            <div className="rounded-2xl border border-neutral-200 p-4 text-sm text-neutral-600">
              この部屋の置き手紙はすでに残されています。
            </div>
          ) : (
            <div className="space-y-2">
              <Label>置き手紙</Label>
              <div className="text-xs leading-5 text-neutral-500">
                例: この部屋で一番立ち上がった問い / 印象に残った対立やズレ /
                読後感が変わった点
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="例: 先生の告白は贖罪なのか自己正当化なのか、という論点が中心だった。"
                className="min-h-[120px] rounded-2xl"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
          {!existingTrace && (
            <Button className="rounded-2xl" onClick={submit} disabled={submitting}>
              残す
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// ダイアログ: 部屋を作る
// =====================================================

function CreateRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: {
    title: string;
    entryType: "welcome" | "deep" | "small";
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
    scheduledStartAt: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [entryType, setEntryType] = useState<"welcome" | "deep" | "small">(
    "welcome",
  );
  const [spoiler, setSpoiler] = useState<"none" | "progress" | "read">("none");
  const [durationHours, setDurationHours] = useState("24");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const submit = async () => {
    if (!title.trim() || submitting) return;
    let scheduledStartAt: string | null = null;
    if (mode === "scheduled") {
      if (!scheduledAt) {
        alert("開始日時を選んでください");
        return;
      }
      const dt = new Date(scheduledAt);
      if (Number.isNaN(dt.getTime())) {
        alert("開始日時の形式が正しくありません");
        return;
      }
      if (dt.getTime() <= Date.now()) {
        alert("開始日時は未来の時刻を選んでください");
        return;
      }
      scheduledStartAt = dt.toISOString();
    }
    setSubmitting(true);
    await onCreate({
      title: title.trim(),
      entryType,
      spoiler,
      durationHours: Number(durationHours),
      firstMessage: note.trim(),
      scheduledStartAt,
    });
    setTitle("");
    setEntryType("welcome");
    setSpoiler("none");
    setDurationHours("24");
    setNote("");
    setMode("now");
    setScheduledAt("");
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
            <div className="text-xs leading-5 text-neutral-500">
              問いの形だと入りやすいです。例: なぜ〜なのか / 本当に〜か / どこが分岐点か
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: Kはなぜ自殺したのか / 先生の告白は贖罪か自己正当化か"
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label>開始タイミング</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "now" ? "default" : "outline"}
                className="flex-1 rounded-2xl"
                onClick={() => setMode("now")}
              >
                いますぐ始める
              </Button>
              <Button
                type="button"
                variant={mode === "scheduled" ? "default" : "outline"}
                className="flex-1 rounded-2xl"
                onClick={() => setMode("scheduled")}
              >
                予約読書会
              </Button>
            </div>
            {mode === "scheduled" && (
              <div className="space-y-2 pt-1">
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="rounded-2xl"
                />
                <div className="text-xs leading-5 text-neutral-500">
                  先着{RESERVATION_CAPACITY}人まで予約できます（作成者を含む）。開始日時まで投稿はできません。
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>部屋の雰囲気</Label>
              <Select
                value={entryType}
                onValueChange={(v: "welcome" | "deep" | "small") =>
                  setEntryType(v)
                }
              >
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="welcome">ふらっと歓迎</SelectItem>
                  <SelectItem value="deep">じっくり対話</SelectItem>
                  <SelectItem value="small">少人数向け</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>ネタバレ範囲</Label>
              <Select
                value={spoiler}
                onValueChange={(v: "none" | "progress" | "read") =>
                  setSpoiler(v)
                }
              >
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
                <SelectItem value="6">6時間</SelectItem>
                <SelectItem value="24">24時間</SelectItem>
                <SelectItem value="72">3日</SelectItem>
                <SelectItem value="168">7日</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>ひとこと</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: それだけでは足りない気もします。"
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
            作成する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// トップページ
// =====================================================

function TopPage({
  books,
  profiles,
  onOpenBook,
  onEnterActiveRoom,
  currentProfile,
  onOpenProfileSetting,
  onOpenMyLog,
  onClearLocalProfile,
  onOpenAddBook,
  onOpenContact,
  onOpenMobileMenu,
  recentHeats,
  unreadCount,
  hasReminder,
}: {
  books: Book[];
  profiles: ProfileRecord[];
  onOpenBook: (bookId: string) => void;
  onEnterActiveRoom: (bookId: string, roomId: number) => void;
  currentProfile: UserProfile | null;
  onOpenProfileSetting: () => void;
  onOpenMyLog: () => void;
  onClearLocalProfile: () => void;
  onOpenAddBook: () => void;
  onOpenContact: () => void;
  onOpenMobileMenu: () => void;
  recentHeats: {
    bookId: string;
    bookTitle: string;
    body: string;
    roomTitle: string | null;
    createdAt: string;
  }[];
  unreadCount: number;
  hasReminder: boolean;
}) {
  useNow(); // 時刻表示を1分ごとに更新

  const [query, setQuery] = useState("");
  const [showAllHeats, setShowAllHeats] = useState(false);
  const [showAllFavorites, setShowAllFavorites] = useState(false);

  const profileColor = getColorStyle(currentProfile?.color);

  const updates = [
    {
      at: "2026.04.18 20:48",
      text: "別端末でも同じ名前を使いやすいよう、合言葉を追加しました。",
    },
    {
      at: "2026.04.18 19:30",
      text: "置き手紙は終了1時間前から記入でき、表示は部屋終了後になりました。",
    },
    {
      at: "2026.04.18 18:50",
      text: "自分の記録を見られるようにしました。",
    },
  ];

  const filteredBooks = [...books]
    .sort((a, b) => {
      const aTime = new Date(a.updated_at ?? 0).getTime();
      const bTime = new Date(b.updated_at ?? 0).getTime();
      return bTime - aTime;
    })
    .filter((book) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        book.title.toLowerCase().includes(q) ||
        (book.author ?? "").toLowerCase().includes(q)
      );
    });

  const activeRooms = books
    .flatMap((book) =>
      book.rooms
        .filter((room) => !isRoomExpired(room))
        .map((room) => ({
          ...room,
          bookId: book.id,
          bookTitle: book.title,
        })),
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  const visibleHeats = showAllHeats ? recentHeats : recentHeats.slice(0, 2);

  const favoriteProfiles = profiles
    .filter((p) => p.favorite_book_id)
    .map((p) => {
      const book = books.find((b) => b.id === p.favorite_book_id);
      if (!book) return null;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        favoriteNote: p.favorite_note ?? "",
        bookTitle: book.title,
        bookAuthor: book.author ?? "",
      };
    })
    .filter(Boolean) as {
    id: number;
    name: string;
    color: string;
    favoriteNote: string;
    bookTitle: string;
    bookAuthor: string;
  }[];

  const visibleFavorites = showAllFavorites
    ? favoriteProfiles
    : favoriteProfiles.slice(0, 2);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="sm:hidden">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="relative inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm"
            >
              <span className={`h-3 w-3 rounded-full ${profileColor.chip}`} />
              <span className="whitespace-nowrap">
                {currentProfile ? currentProfile.name : "名前を設定"}
              </span>
              {unreadCount > 0 ? (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                  aria-label={`${unreadCount}件の新着`}
                />
              ) : hasReminder ? (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white"
                  aria-label="予約リマインダーあり"
                />
              ) : null}
            </button>
          </div>

          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
            <Button
              variant="outline"
              className="relative rounded-full"
              onClick={onOpenMyLog}
            >
              自分の記録
              {unreadCount > 0 ? (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                  aria-label={`${unreadCount}件の新着`}
                />
              ) : hasReminder ? (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white"
                  aria-label="予約リマインダーあり"
                />
              ) : null}
            </Button>

            {currentProfile && (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={onClearLocalProfile}
              >
                この端末の設定を解除
              </Button>
            )}

            <button
              type="button"
              onClick={onOpenProfileSetting}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm"
            >
              <span className={`h-3 w-3 rounded-full ${profileColor.chip}`} />
              <span className="whitespace-nowrap">
                {currentProfile ? currentProfile.name : "名前を設定"}
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card className="relative overflow-hidden rounded-3xl border-0 shadow-sm">
            <img
              src="/hero-book-bg.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-white/70" />
            <CardHeader className="relative z-10 p-8">
              <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm text-neutral-600">
                <BookOpen className="h-4 w-4" />
                同じ本を読んだ人と、少し話せる場所。
              </div>

              <CardTitle className="text-4xl font-semibold tracking-tight sm:text-5xl">
                読んで、終われない β
              </CardTitle>

              <CardDescription className="mt-6 max-w-2xl text-base leading-8 text-neutral-700">
                本を読んだあと、少し話したくなったときの場所です。
                <br />
                本を開くと、その本について短く話せる部屋に入れます。
              </CardDescription>

              <div className="mt-10 text-xs text-neutral-500">
                ※試験公開中・内容や機能は今後変わることがあります。
              </div>
            </CardHeader>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle>ホットな部屋</CardTitle>
              <CardDescription>いま入って話せる部屋です。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeRooms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-500">
                  まだ動いている部屋はありません。
                </div>
              ) : (
                activeRooms.slice(0, 2).map((room) => (
                  <button
                    key={`${room.bookId}-${room.id}`}
                    type="button"
                    onClick={() => onEnterActiveRoom(room.bookId, room.id)}
                    className="block w-full rounded-2xl border border-neutral-200 px-4 py-4 text-left hover:bg-neutral-50"
                  >
                    <div className="text-sm text-neutral-500">
                      {room.bookTitle}
                    </div>
                    <div className="mt-1 text-lg font-medium">{room.title}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <RoomBadge room={room} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
                      <span>投稿 {room.messages?.length ?? 0}件</span>
                      <span>{formatRelativeTime(room.updated_at)}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle>語らいの置き手紙</CardTitle>
              <CardDescription>
                語り合いを終えた部屋から残された短いメッセージです。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {visibleHeats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-500">
                  まだ置き手紙はありません。
                </div>
              ) : (
                visibleHeats.map((heat, index) => (
                  <div
                    key={`${heat.bookId}-${heat.createdAt}-${index}`}
                    className="rounded-2xl border border-neutral-200 px-4 py-4"
                  >
                    <div className="text-sm text-neutral-500">
                      {heat.bookTitle}
                    </div>
                    <div className="mt-1 text-base font-medium">
                      {heat.body}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      元の部屋: {heat.roomTitle ?? "不明"}
                    </div>
                  </div>
                ))
              )}

              {recentHeats.length > 2 && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setShowAllHeats((v) => !v)}
                >
                  {showAllHeats ? "閉じる" : "ほかを見る"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle>ずっと好きな1冊</CardTitle>
              <CardDescription>
                ここにいる人が、それぞれ大切にしている1冊です。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {visibleFavorites.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-500">
                  まだ登録されていません。
                </div>
              ) : (
                visibleFavorites.map((item) => {
                  const color = getColorStyle(item.color);
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-neutral-200 px-4 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-3 w-3 rounded-full ${color.chip}`} />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <div className="mt-3 text-xl font-semibold">
                        {item.bookTitle}
                      </div>
                      <div className="text-sm text-neutral-500">
                        {item.bookAuthor}
                      </div>
                      {item.favoriteNote && (
                        <div className="mt-3 text-sm leading-6 text-neutral-700">
                          {item.favoriteNote}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {favoriteProfiles.length > 2 && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setShowAllFavorites((v) => !v)}
                >
                  {showAllFavorites ? "閉じる" : "ほかを見る"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold">本をひらく</h2>
              <p className="mt-1 text-neutral-500">本を開く。部屋がひらく。</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-[360px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="本のタイトル・著者名で検索"
                  className="rounded-full pl-9"
                />
              </div>

              <Button
                variant="outline"
                className="rounded-full"
                onClick={onOpenAddBook}
              >
                本を追加
              </Button>
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
              該当する本がありません。
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book) => {
                const activeCount = book.rooms.filter(
                  (r) => !isRoomExpired(r),
                ).length;
                return (
                  <Card key={book.id} className="rounded-3xl shadow-sm">
                    <CardHeader className="space-y-2 pl-5">
                      <CardTitle className="flex items-center gap-2 text-xl leading-7">
                        <span className="whitespace-nowrap">{book.title}</span>
                        {isBookNew(book) && <NewMark />}
                      </CardTitle>
                      <div className="text-sm text-neutral-500">
                        {book.author}
                      </div>
                    </CardHeader>

                    <CardContent className="flex items-end justify-between gap-4">
                      <div className="text-sm text-neutral-500">
                        稼働中の部屋 {activeCount} / 6
                      </div>
                      <Button
                        className="rounded-full"
                        onClick={() => onOpenBook(book.id)}
                      >
                        この本のページへ
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm">
          <div className="mb-2 font-medium text-neutral-900">最近の更新</div>
          <div className="space-y-2 leading-6">
            {updates.map((item, index) => (
              <div key={`${item.at}-${index}`} className="flex flex-wrap gap-2">
                <span className="text-xs text-neutral-500">{item.at}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm">
          <div className="mb-2 font-medium text-neutral-900">この場の約束</div>
          <div className="space-y-1 leading-6">
            <div>ここは、本について少し話したい人のための場所です。</div>
            <div>・本と関係のない宣伝や勧誘はご遠慮ください</div>
            <div>
              ・相手を傷つける言葉や、強い言い争いになりそうなやり取りは避けてください
            </div>
            <div>・ネタバレ範囲は部屋の表示に合わせてください</div>
            <div className="flex flex-wrap items-center gap-2">
              <span>
                ・気になることや不具合があれば、知らせてください。必要に応じて対応します
              </span>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={onOpenContact}
              >
                <Mail className="mr-2 h-4 w-4" />
                管理人に伝える
              </Button>
            </div>
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            このサイトは試験公開中です。内容や機能は今後変わることがあります。
          </div>
        </div>
      </div>

    </div>
  );
}

// =====================================================
// 本のページ
// =====================================================

function BookPage({
  book,
  onBack,
  onEnterRoom,
  onCreateRoom,
  onEditBook,
  currentProfile,
  onOpenProfileSetting,
  onOpenMobileMenu,
}: {
  book: Book;
  onBack: () => void;
  onEnterRoom: (roomId: number) => void;
  onCreateRoom: () => void;
  onEditBook: () => void;
  currentProfile: UserProfile | null;
  onOpenProfileSetting: () => void;
  onOpenMobileMenu: () => void;
}) {
  useNow(); // 時刻表示を1分ごとに更新

  const visibleRooms = [...getActiveRooms(book.rooms)].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  const roomLimitReached = visibleRooms.length >= MAX_ACTIVE_ROOMS_PER_BOOK;

  const recentTraces = [...book.traces]
    .filter(isRecentTrace)
    .filter((trace) => {
      if (!trace.room_id) return true;
      const sourceRoom = book.rooms.find((room) => room.id === trace.room_id);
      if (!sourceRoom) return true;
      return isRoomExpired(sourceRoom);
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="ghost" className="rounded-2xl" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>
          {/* スマホ: メニューを開く / デスクトップ: 名前設定を直接開く */}
          <div className="sm:hidden">
            <ProfileButton
              currentProfile={currentProfile}
              onClick={onOpenMobileMenu}
            />
          </div>
          <div className="hidden sm:block">
            <ProfileButton
              currentProfile={currentProfile}
              onClick={onOpenProfileSetting}
            />
          </div>
        </div>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="p-8">
            <div className="mb-2 text-sm text-neutral-500">{book.author}</div>

            <div className="flex items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-3xl">
                <span>{book.title}</span>
                {isBookNew(book) && <NewMark />}
              </CardTitle>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={onEditBook}
              >
                本を編集
              </Button>
            </div>

            <CardDescription className="max-w-3xl pt-2 text-base leading-7">
              {book.description}
            </CardDescription>

            {book.updated_by_name && (
              <div className="pt-2 text-xs text-neutral-500">
                最終更新者: {book.updated_by_name}
              </div>
            )}
          </CardHeader>
        </Card>

        <div className="mt-6">
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">語らいの置き手紙</CardTitle>
              <CardDescription>
                その本について語り合った読者たちが、あとから来る人へ残した短いメッセージです。30日以内のものを最大4件まで表示します。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTraces.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                  まだ置き手紙はありません。
                </div>
              ) : (
                recentTraces.map((trace) => (
                  <div
                    key={trace.id}
                    className="rounded-2xl border border-neutral-200 p-4"
                  >
                    <div className="mb-2 text-sm font-medium leading-6">
                      {trace.body}
                    </div>
                    <div className="text-xs text-neutral-500">
                      元の部屋: {trace.room_title ?? "不明"} ・{" "}
                      {formatRelativeTime(trace.created_at)}
                      {trace.created_by_name
                        ? ` ・ ${trace.created_by_name}`
                        : ""}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xl">この本の部屋</CardTitle>
                <CardDescription>
                  稼働中 {visibleRooms.length} / {MAX_ACTIVE_ROOMS_PER_BOOK} 部屋
                </CardDescription>
                {roomLimitReached && (
                  <div className="mt-2 text-xs text-neutral-500">
                    この本の部屋は現在上限です。既存の部屋に参加するか、終了を待ってください。
                  </div>
                )}
              </div>

              <Button
                className="gap-2 rounded-2xl"
                onClick={onCreateRoom}
                disabled={roomLimitReached}
              >
                <Plus className="h-4 w-4" />
                部屋を作る
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              {visibleRooms.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                    <MessageSquare className="h-5 w-5 text-neutral-500" />
                  </div>
                  <div className="mb-2 font-medium">
                    いま表示できる部屋はありません
                  </div>
                  <Button className="rounded-2xl" onClick={onCreateRoom}>
                    最初の部屋を作る
                  </Button>
                </div>
              ) : (
                visibleRooms.map((room) => {
                  const scheduledMs = room.scheduled_start_at
                    ? new Date(room.scheduled_start_at).getTime()
                    : null;
                  const isScheduled =
                    scheduledMs !== null && scheduledMs > Date.now();
                  return (
                    <div
                      key={room.id}
                      className={`rounded-3xl border p-5 ${isScheduled ? "border-sky-200 bg-sky-50/40" : "border-neutral-200"}`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-lg font-medium leading-7">
                            <span>{room.title}</span>
                            {isNewItem(room.updated_at) && <NewMark />}
                            {isScheduled && (
                              <Badge
                                variant="outline"
                                className="border-sky-300 bg-white text-sky-700"
                              >
                                予約読書会
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2">
                            <RoomBadge room={room} />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => onEnterRoom(room.id)}
                        >
                          入る
                        </Button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-4 text-sm text-neutral-500">
                        {isScheduled ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-sky-700">
                              <Clock3 className="h-4 w-4" />
                              開始:{" "}
                              {new Date(
                                room.scheduled_start_at as string,
                              ).toLocaleString("ja-JP", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="text-sky-700">
                              予約 {room.reservations.length}/
                              {RESERVATION_CAPACITY}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="h-4 w-4" />
                              投稿 {room.messages?.length ?? 0}件
                            </span>
                            <span>{formatRelativeTime(room.updated_at)}</span>
                            <span>{formatExpiresAt(room.expires_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// 期限切れページ
// =====================================================

function ExpiredRoomPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Button variant="ghost" className="mb-4 rounded-2xl" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          戻る
        </Button>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader>
            <CardTitle>この部屋は終了しました</CardTitle>
            <CardDescription>
              期限切れのため、この部屋は現在表示対象外です。必要なら新しい部屋を作成してください。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

// =====================================================
// ルームページ（チャット）
// =====================================================

function RoomPage({
  book,
  room,
  existingTrace,
  onBack,
  onSendMessage,
  onOpenExtend,
  onOpenTrace,
  currentProfile,
  onOpenProfileSetting,
  onOpenMobileMenu,
  myProfileId,
  onReserve,
  onCancelReservation,
}: {
  book: Book;
  room: Room;
  existingTrace: BookTrace | null;
  onBack: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onOpenExtend: () => void;
  onOpenTrace: () => void;
  currentProfile: UserProfile | null;
  onOpenProfileSetting: () => void;
  onOpenMobileMenu: () => void;
  myProfileId: number | null;
  onReserve: (roomId: number) => Promise<void>;
  onCancelReservation: (roomId: number) => Promise<void>;
}) {
  useNow(); // 時刻表示を1分ごとに更新

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const canCreateLetter = canCreateLetterNow(room);
  const letterWaitMs = getMsUntilLetterAvailable(room);

  // 予約読書会の開始前かどうか
  const scheduledStartMs = room.scheduled_start_at
    ? new Date(room.scheduled_start_at).getTime()
    : null;
  const isBeforeStart =
    scheduledStartMs !== null && scheduledStartMs > Date.now();
  const reservedCount = room.reservations.length;
  const isReserved =
    myProfileId !== null &&
    room.reservations.some((r) => r.profile_id === myProfileId);
  const isFull = reservedCount >= RESERVATION_CAPACITY;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 新しい発言が来たら一番下にスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.messages.length]);

  // Supabase Realtime Presence で「今この部屋にいる人数」を取得
  const [presenceCount, setPresenceCount] = useState(1);
  useEffect(() => {
    const channel = supabase.channel(`presence-room-${room.id}`);
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPresenceCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            name: currentProfile?.name ?? "ゲスト",
            at: new Date().toISOString(),
          });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, currentProfile?.name]);

  const submit = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    await onSendMessage(draft.trim());
    setDraft("");
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" className="rounded-2xl" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="sm:hidden">戻る</span>
            <span className="hidden max-w-[240px] truncate sm:inline">
              {book.title} に戻る
            </span>
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={onOpenTrace}
              disabled={!canCreateLetter || !!existingTrace}
            >
              置き手紙を書く
            </Button>

            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={onOpenExtend}
            >
              <Clock3 className="mr-2 h-4 w-4" />
              延長
            </Button>

            {/* スマホ: メニューを開く / デスクトップ: 名前設定を直接開く */}
            <div className="sm:hidden">
              <ProfileButton
                currentProfile={currentProfile}
                onClick={onOpenMobileMenu}
              />
            </div>
            <div className="hidden sm:block">
              <ProfileButton
                currentProfile={currentProfile}
                onClick={onOpenProfileSetting}
              />
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-4 text-sm text-neutral-600 shadow-sm">
          <div className="font-medium text-neutral-800">置き手紙とは</div>
          <div className="mt-2 leading-6">
            この部屋で生まれた論点や空気を、あとから来る人へ短く残すためのものです。
            <br />
            要約や議事録ではなく、部屋が消えたあとにも本ページに残る熱量です。
          </div>
          <div className="mt-3 text-xs leading-5 text-neutral-500">
            ※1部屋につき1件まで / 部屋終了の1時間前から記入できます / 表示されるのは部屋終了後です
          </div>
          {!canCreateLetter && !existingTrace && (
            <div className="mt-2 text-xs text-neutral-500">
              まだ記入できません。{formatDurationFromMs(letterWaitMs)}で記入できるようになります。
            </div>
          )}
          {existingTrace && (
            <div className="mt-2 text-xs text-neutral-500">
              この部屋の置き手紙はすでに残されています。
            </div>
          )}
        </div>

        {room.scheduled_start_at && (
          <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-sm text-sky-900">
            <div className="flex items-center gap-2 font-medium">
              <Clock3 className="h-4 w-4" />
              予約読書会
              {isBeforeStart ? (
                <span className="text-xs font-normal text-sky-700">
                  （開始前）
                </span>
              ) : (
                <span className="text-xs font-normal text-sky-700">
                  （開催中）
                </span>
              )}
            </div>
            <div className="mt-2 text-xs leading-5 text-sky-800">
              開始予定:{" "}
              {new Date(room.scheduled_start_at).toLocaleString("ja-JP", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="mt-1 text-xs leading-5 text-sky-800">
              予約 {reservedCount}/{RESERVATION_CAPACITY} 人
              {room.reservations.length > 0 && (
                <span className="ml-2 text-sky-700">
                  （{room.reservations.map((r) => r.profile_name ?? "匿名").join(", ")}）
                </span>
              )}
            </div>
            {isBeforeStart && (
              <div className="mt-3 flex flex-wrap gap-2">
                {isReserved ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => onCancelReservation(room.id)}
                  >
                    予約をキャンセル
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-2xl"
                    disabled={isFull || !myProfileId}
                    onClick={() => onReserve(room.id)}
                  >
                    {isFull ? "満員" : "予約する"}
                  </Button>
                )}
                {!myProfileId && (
                  <span className="text-xs text-sky-700">
                    予約するには名前を設定してください。
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="border-b border-neutral-100 pb-5">
            <div className="text-sm text-neutral-500">{book.title}</div>
            <CardTitle className="flex items-center gap-2 text-2xl leading-8">
              <span>{room.title}</span>
              {isNewItem(room.updated_at) && <NewMark />}
            </CardTitle>
            <div className="pt-2">
              <RoomBadge room={room} />
            </div>
            <div className="flex flex-wrap gap-4 pt-2 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                投稿 {room.messages?.length ?? 0}件
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                参加中 {presenceCount}人
              </span>
              <span>{formatRelativeTime(room.updated_at)}</span>
              <span>{formatExpiresAt(room.expires_at)}</span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="h-[60vh] overflow-y-auto sm:h-[460px]">
              <div className="flex min-h-full flex-col justify-end space-y-4 p-6">
              {room.messages.map((m) => {
                const colorStyle = getColorStyle(m.user_color);
                const isMine =
                  !!currentProfile?.name && m.user_name === currentProfile.name;
                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${isMine ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium uppercase text-white ${colorStyle.chip}`}
                    >
                      {m.user_name.slice(0, 1)}
                    </div>
                    <div className="max-w-[85%]">
                      <div
                        className={`mb-1 flex items-center gap-2 text-sm ${isMine ? "flex-row-reverse" : ""}`}
                      >
                        <span className={`font-medium ${colorStyle.name}`}>
                          {m.user_name}
                        </span>
                        <span className="text-neutral-400">
                          {new Date(m.created_at).toLocaleTimeString("ja-JP", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div
                        className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 leading-7 ${colorStyle.bubble}`}
                      >
                        {renderMessageContent(m.text)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-neutral-100 p-4">
              {isBeforeStart ? (
                <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  開始日時になると投稿できるようになります。
                </div>
              ) : (
                <>
                  <div className="mb-2 text-xs text-neutral-500">
                    会話補助の例: 「まず一言感想」「好きだった箇所」「引っかかった点」（Enterで改行 / 送信ボタンで投稿）
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="本の話題に沿って投稿してください。"
                      className="min-h-[88px] rounded-2xl"
                    />
                    <Button
                      onClick={submit}
                      className="h-auto w-full rounded-2xl px-6 sm:w-auto"
                      disabled={sending}
                    >
                      送信
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================
// ページ本体
// =====================================================

export default function Page() {
  const [books, setBooks] = useState<Book[]>([]);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [page, setPage] = useState<
    | { type: "top" }
    | { type: "book"; bookId: string }
    | { type: "room"; bookId: string; roomId: number }
  >({ type: "top" });

  const [createOpen, setCreateOpen] = useState(false);
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [editBookOpen, setEditBookOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [myLogOpen, setMyLogOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [returnToProfileAfterAddBook, setReturnToProfileAfterAddBook] =
    useState(false);
  const [pendingEntry, setPendingEntry] = useState<{
    bookId: string;
    roomId: number;
  } | null>(null);

  // popstate（ブラウザ戻る・進む）由来の遷移か区別するためのフラグ
  const isPopStateRef = useRef(false);

  // URL（クエリパラメータ）から page state を読み取る
  const readPageFromUrl = (): typeof page => {
    if (typeof window === "undefined") return { type: "top" };
    const params = new URLSearchParams(window.location.search);
    const bookId = params.get("book");
    const roomIdStr = params.get("room");
    const roomId = roomIdStr ? Number(roomIdStr) : null;
    if (bookId && roomId && Number.isFinite(roomId)) {
      return { type: "room", bookId, roomId };
    }
    if (bookId) return { type: "book", bookId };
    return { type: "top" };
  };

  // 初回マウント時に URL から page を復元
  useEffect(() => {
    const initial = readPageFromUrl();
    if (initial.type !== "top") {
      isPopStateRef.current = true; // 初回読込みで URL を上書きしないように
      setPage(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // page が変わったら URL を更新（popstate 由来の場合は更新しない）
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (page.type === "book" || page.type === "room") {
      params.set("book", page.bookId);
    }
    if (page.type === "room") {
      params.set("room", String(page.roomId));
    }
    const search = params.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.pushState(null, "", url);
  }, [page]);

  // ブラウザの戻る・進むボタンに反応
  useEffect(() => {
    const onPopState = () => {
      isPopStateRef.current = true;
      setPage(readPageFromUrl());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 通知用：「自分の部屋を最後に見た時刻」を記録
  const [lastSeenMap, setLastSeenMap] = useState<Record<number, string>>({});

  // localStorage の UserProfile には DB の id が無いので、
  // profiles テーブル（loadAll で取得済み）から name で引いて id を得る
  const myProfileId = useMemo(() => {
    if (!profile?.name) return null;
    return profiles.find((p) => p.name === profile.name)?.id ?? null;
  }, [profile, profiles]);

  useEffect(() => {
    setLastSeenMap(readLastSeenMap());
  }, []);

  const markRoomAsSeen = (roomId: number) => {
    setLastSeenMap((prev) => {
      const next = { ...prev, [roomId]: new Date().toISOString() };
      writeLastSeenMap(next);
      return next;
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem("book-room-profile");
    if (saved) {
      try {
        setProfile(JSON.parse(saved));
      } catch {
        setProfile(null);
      }
    }
  }, []);

  const clearLocalProfile = () => {
    const ok = window.confirm(
      "この端末に保存されている名前設定を解除します。",
    );
    if (!ok) return;

    localStorage.removeItem("book-room-profile");
    setProfile(null);
    setMyLogOpen(false);
    setProfileDialogOpen(false);
  };

  const saveProfile = async (nextProfile: UserProfile) => {
    const currentName = profile?.name?.trim() ?? "";
    const nextName = nextProfile.name.trim();
    const nextPassphrase = nextProfile.passphrase?.trim() ?? "";

    if (!nextName) {
      alert("表示名を入力してください");
      return;
    }

    const { data: existingProfile, error: existingError } = await supabase
      .from("profiles")
      .select("*")
      .eq("name", nextName)
      .maybeSingle();

    if (existingError) {
      showError("名前の確認", existingError);
      return;
    }

    if (existingProfile && currentName !== nextName) {
      const existingPassphrase = existingProfile.passphrase ?? "";

      if (!existingPassphrase) {
        alert("この名前はすでに使われています。");
        return;
      }

      if (!nextPassphrase) {
        alert("この名前を引き継ぐには合言葉が必要です。");
        return;
      }

      if (existingPassphrase !== nextPassphrase) {
        alert("合言葉が一致しません。");
        return;
      }
    }

    const isClaimingExistingProfile =
      !!existingProfile && currentName !== nextName;

    const resolvedColor = isClaimingExistingProfile
      ? existingProfile.color
      : nextProfile.color;

    const resolvedFavoriteBookId = isClaimingExistingProfile
      ? existingProfile.favorite_book_id
      : nextProfile.favoriteBookId ?? null;

    const resolvedFavoriteNote = isClaimingExistingProfile
      ? existingProfile.favorite_note
      : nextProfile.favoriteNote?.trim() || null;

    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        name: nextName,
        color: resolvedColor,
        favorite_book_id: resolvedFavoriteBookId,
        favorite_note: resolvedFavoriteNote,
        passphrase: nextPassphrase || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" },
    );

    if (upsertError) {
      showError("名前の保存", upsertError);
      return;
    }

    const nextLocalProfile: UserProfile = {
      name: nextName,
      color: resolvedColor,
      favoriteBookId: resolvedFavoriteBookId,
      favoriteNote: resolvedFavoriteNote ?? "",
      passphrase: nextPassphrase,
    };

    setProfile(nextLocalProfile);
    localStorage.setItem("book-room-profile", JSON.stringify(nextLocalProfile));

    if (pendingEntry) {
      setPage({
        type: "room",
        bookId: pendingEntry.bookId,
        roomId: pendingEntry.roomId,
      });
      setPendingEntry(null);
    }

    setProfileDialogOpen(false);
    await loadAll();
  };

  const submitContact = async (payload: {
    category: "bug" | "request" | "book_request" | "report";
    body: string;
    senderName: string;
  }) => {
    const { error } = await supabase.from("contact_messages").insert({
      category: payload.category,
      body: payload.body,
      sender_name: payload.senderName || null,
    });

    if (error) {
      showError("送信", error);
      return;
    }

    setContactOpen(false);
    alert("送信しました");
  };

  const loadAll = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);

    const { data: booksData, error: booksError } = await supabase
      .from("books")
      .select("*")
      .order("updated_at", { ascending: false });

    if (booksError) {
      console.error(booksError);
      setLoading(false);
      return;
    }

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("*")
      .order("updated_at", { ascending: false });

    if (roomsError) {
      console.error(roomsError);
      setLoading(false);
      return;
    }

    const roomIds = (roomsData ?? []).map((r) => r.id);

    let messagesData: Message[] = [];
    if (roomIds.length > 0) {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .in("room_id", roomIds)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      messagesData = (data ?? []) as Message[];
    }

    let reservationsData: Reservation[] = [];
    if (roomIds.length > 0) {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, room_id, profile_id, created_at, profiles(name)")
        .in("room_id", roomIds)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      reservationsData = (data ?? []).map((r: {
        id: number;
        room_id: number;
        profile_id: number;
        created_at: string;
        profiles: { name: string | null } | { name: string | null }[] | null;
      }) => {
        const pn = Array.isArray(r.profiles) ? r.profiles[0]?.name ?? null : r.profiles?.name ?? null;
        return {
          id: r.id,
          room_id: r.room_id,
          profile_id: r.profile_id,
          profile_name: pn,
          created_at: r.created_at,
        };
      });
    }

    const bookIds = (booksData ?? []).map((b) => b.id);

    let tracesData: BookTrace[] = [];
    if (bookIds.length > 0) {
      const { data, error } = await supabase
        .from("book_traces")
        .select("*")
        .in("book_id", bookIds)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      tracesData = (data ?? []) as BookTrace[];
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("updated_at", { ascending: false });

    if (profilesError) {
      console.error(profilesError);
      setLoading(false);
      return;
    }

    const merged: Book[] = (booksData ?? []).map((book) => {
      const rooms = (roomsData ?? [])
        .filter((room) => room.book_id === book.id)
        .map((room) => ({
          ...room,
          scheduled_start_at: room.scheduled_start_at ?? null,
          messages: messagesData.filter((m) => m.room_id === room.id),
          reservations: reservationsData.filter((r) => r.room_id === room.id),
        })) as Room[];

      return {
        ...book,
        rooms,
        traces: tracesData.filter((t) => t.book_id === book.id),
      };
    });

    setBooks(merged);
    setProfiles((profilesData ?? []) as ProfileRecord[]);
    setLoading(false);
  };

  // 初回マウント時のみ「読み込み中...」を出し、以降の page 遷移では裏で静かに再取得する
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      loadAll();
    } else {
      loadAll({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // 部屋にいる間だけ、新しい発言をリアルタイム購読する
  // （Supabase ダッシュボードで messages テーブルの Realtime を有効化しておく必要あり）
  useEffect(() => {
    if (page.type !== "room") return;
    const roomId = page.roomId;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setBooks((prev) =>
            prev.map((book) => ({
              ...book,
              rooms: book.rooms.map((room) =>
                room.id === roomId
                  ? {
                      ...room,
                      // 自分の送信などで既に入っている場合は重複させない
                      messages: room.messages.some(
                        (m) => m.id === newMessage.id,
                      )
                        ? room.messages
                        : [...room.messages, newMessage],
                      updated_at: newMessage.created_at,
                    }
                  : room,
              ),
            })),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [page]);

  // 予約の変更（INSERT / DELETE）をリアルタイムで反映する。
  // 予約人数や「満員」表示、自分の「予約中」がすぐ更新されるようにするため。
  useEffect(() => {
    const channel = supabase
      .channel("reservations-all")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reservations" },
        () => {
          loadAll();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reservations" },
        () => {
          loadAll();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // loadAll はステートセッター経由のみ参照しているため依存配列は空で OK
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自分が作った部屋のうち、未読の発言（自分以外）がある部屋を抽出
  const myUnreadRooms = useMemo(() => {
    const empty: {
      bookId: string;
      bookTitle: string;
      roomId: number;
      roomTitle: string;
      newCount: number;
      latestAt: string;
    }[] = [];
    if (!myProfileId || !profile?.name) return empty;
    return books
      .flatMap((book) =>
        book.rooms
          .filter((room) => room.created_by_profile_id === myProfileId)
          .filter((room) => !isRoomExpired(room))
          .map((room) => {
            const lastSeen = lastSeenMap[room.id] ?? "1970-01-01T00:00:00Z";
            const newMessages = room.messages.filter(
              (m) =>
                m.created_at > lastSeen && m.user_name !== profile.name,
            );
            return {
              bookId: book.id,
              bookTitle: book.title,
              roomId: room.id,
              roomTitle: room.title,
              newCount: newMessages.length,
              latestAt:
                newMessages[newMessages.length - 1]?.created_at ??
                room.updated_at,
            };
          })
          .filter((r) => r.newCount > 0),
      )
      .sort(
        (a, b) =>
          new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
      );
  }, [books, profile, myProfileId, lastSeenMap]);

  const totalUnread = myUnreadRooms.reduce((sum, r) => sum + r.newCount, 0);

  // 自分が予約している読書会（開始前のもの）
  const myReservations = useMemo(() => {
    const empty: {
      bookId: string;
      bookTitle: string;
      roomId: number;
      roomTitle: string;
      scheduledStartAt: string;
      reservedCount: number;
      reminder: "24h" | "1h" | null;
    }[] = [];
    if (!myProfileId) return empty;
    const now = Date.now();
    return books
      .flatMap((book) =>
        book.rooms
          .filter((room) => {
            if (!room.scheduled_start_at) return false;
            const ms = new Date(room.scheduled_start_at).getTime();
            if (ms <= now) return false;
            return room.reservations.some(
              (r) => r.profile_id === myProfileId,
            );
          })
          .map((room) => {
            const ms = new Date(room.scheduled_start_at as string).getTime();
            const diff = ms - now;
            let reminder: "24h" | "1h" | null = null;
            if (diff <= 60 * 60 * 1000) reminder = "1h";
            else if (diff <= 24 * 60 * 60 * 1000) reminder = "24h";
            return {
              bookId: book.id,
              bookTitle: book.title,
              roomId: room.id,
              roomTitle: room.title,
              scheduledStartAt: room.scheduled_start_at as string,
              reservedCount: room.reservations.length,
              reminder,
            };
          }),
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledStartAt).getTime() -
          new Date(b.scheduledStartAt).getTime(),
      );
  }, [books, myProfileId]);

  const hasReservationReminder = myReservations.some((r) => r.reminder !== null);

  const recentHeats = books
    .flatMap((book) =>
      book.traces
        .filter(isRecentTrace)
        .filter((trace) => {
          if (!trace.room_id) return true;
          const sourceRoom = book.rooms.find(
            (room) => room.id === trace.room_id,
          );
          if (!sourceRoom) return true;
          return isRoomExpired(sourceRoom);
        })
        .map((trace) => ({
          bookId: book.id,
          bookTitle: book.title,
          body: trace.body,
          roomTitle: trace.room_title,
          createdAt: trace.created_at,
        })),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const currentBook =
    page.type !== "top"
      ? books.find((b) => b.id === page.bookId) ?? null
      : null;

  const currentRoom =
    page.type === "room" && currentBook
      ? currentBook.rooms.find((r) => r.id === page.roomId) ?? null
      : null;

  const currentRoomExpired = currentRoom ? isRoomExpired(currentRoom) : false;
  const currentRoomTrace =
    currentBook && currentRoom
      ? currentBook.traces.find((t) => t.room_id === currentRoom.id) ?? null
      : null;

  const handleEnterRoom = (bookId: string, roomId: number) => {
    if (!profile) {
      setPendingEntry({ bookId, roomId });
      setProfileDialogOpen(true);
      return;
    }
    markRoomAsSeen(roomId);
    setPage({ type: "room", bookId, roomId });
  };

  const createBook = async (payload: {
    title: string;
    author: string;
    description: string;
  }) => {
    const baseId = slugifyTitle(payload.title);
    const nextId = baseId || `book-${Date.now()}`;

    const exists = books.some((b) => b.id === nextId);
    if (exists) {
      alert(
        "同じIDになりそうな本がすでにあります。タイトルを少し変えて追加してください。",
      );
      return;
    }

    const { error } = await supabase.from("books").insert({
      id: nextId,
      title: payload.title,
      author: payload.author || null,
      description: payload.description || null,
      updated_at: new Date().toISOString(),
      updated_by_name: profile?.name ?? "unknown",
    });

    if (error) {
      showError("本の追加", error);
      return;
    }

    await loadAll();

    const shouldReturnToProfile = returnToProfileAfterAddBook;

    setAddBookOpen(false);
    setReturnToProfileAfterAddBook(false);

    if (shouldReturnToProfile) {
      setTimeout(() => {
        setProfileDialogOpen(true);
      }, 300);
    }
  };

  const updateBook = async (payload: {
    id: string;
    title: string;
    author: string;
    description: string;
  }) => {
    const editorName = profile?.name ?? "unknown";

    const { error } = await supabase
      .from("books")
      .update({
        title: payload.title,
        author: payload.author || null,
        description: payload.description || null,
        updated_at: new Date().toISOString(),
        updated_by_name: editorName,
      })
      .eq("id", payload.id);

    if (error) {
      showError("本の更新", error);
      return;
    }

    setEditBookOpen(false);
    await loadAll();
  };

  const createRoom = async (payload: {
    title: string;
    entryType: "welcome" | "deep" | "small";
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
    scheduledStartAt: string | null;
  }) => {
    if (!currentBook) return;

    const activeRooms = getActiveRooms(currentBook.rooms);
    if (activeRooms.length >= MAX_ACTIVE_ROOMS_PER_BOOK) {
      alert(
        `この本の部屋は現在上限です（最大${MAX_ACTIVE_ROOMS_PER_BOOK}部屋）`,
      );
      return;
    }

    // 期限は「開始時刻＋指定時間」（予約時）または「今＋指定時間」（いますぐ）
    const baseTime = payload.scheduledStartAt
      ? new Date(payload.scheduledStartAt).getTime()
      : Date.now();
    const expiresAt = new Date(
      baseTime + payload.durationHours * 60 * 60 * 1000,
    ).toISOString();

    const { data: insertedRoom, error: roomError } = await supabase
      .from("rooms")
      .insert({
        book_id: currentBook.id,
        title: payload.title,
        entry_type: payload.entryType,
        spoiler: payload.spoiler,
        active_users: 1,
        expires_at: expiresAt,
        created_by_profile_id: myProfileId,
        scheduled_start_at: payload.scheduledStartAt,
      })
      .select()
      .single();

    if (roomError) {
      showError("部屋の作成", roomError);
      return;
    }

    // 予約読書会なら、作成者を自動で予約に入れる
    if (payload.scheduledStartAt && myProfileId) {
      const { error: resError } = await supabase.from("reservations").insert({
        room_id: insertedRoom.id,
        profile_id: myProfileId,
      });
      if (resError) {
        console.error("作成者の予約に失敗:", resError);
      }
    }

    // 予約読書会は開始前は投稿不可なので、firstMessage は
    // 「いますぐ」モードのときだけ投稿する
    if (payload.firstMessage && !payload.scheduledStartAt) {
      const sender = profile?.name ?? "you";
      const senderColor = profile?.color ?? "slate";

      const { error: messageError } = await supabase.from("messages").insert({
        room_id: insertedRoom.id,
        user_name: sender,
        user_color: senderColor,
        text: payload.firstMessage,
      });

      if (messageError) {
        showError("最初の投稿の保存", messageError);
        return;
      }
    }

    setCreateOpen(false);
    await loadAll();
    markRoomAsSeen(insertedRoom.id);
    setPage({ type: "room", bookId: currentBook.id, roomId: insertedRoom.id });
  };

  const reserveRoom = async (roomId: number) => {
    if (!myProfileId) {
      alert("予約するには名前を設定してください");
      return;
    }
    // capacity チェック（ローカル値を見る）
    let full = false;
    setBooks((prev) =>
      prev.map((book) => ({
        ...book,
        rooms: book.rooms.map((room) => {
          if (room.id !== roomId) return room;
          if (room.reservations.length >= RESERVATION_CAPACITY) {
            full = true;
            return room;
          }
          if (room.reservations.some((r) => r.profile_id === myProfileId)) {
            return room;
          }
          // 楽観的 UI: 仮の予約を入れる
          const tempReservation: Reservation = {
            id: -Date.now(),
            room_id: roomId,
            profile_id: myProfileId,
            profile_name: profile?.name ?? null,
            created_at: new Date().toISOString(),
          };
          return { ...room, reservations: [...room.reservations, tempReservation] };
        }),
      })),
    );
    if (full) {
      alert("この読書会はすでに満員です");
      return;
    }

    const { error } = await supabase.from("reservations").insert({
      room_id: roomId,
      profile_id: myProfileId,
    });
    if (error) {
      showError("予約", error);
      await loadAll();
      return;
    }
    await loadAll();
  };

  const cancelReservation = async (roomId: number) => {
    if (!myProfileId) return;
    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("room_id", roomId)
      .eq("profile_id", myProfileId);
    if (error) {
      showError("予約キャンセル", error);
      return;
    }
    await loadAll();
  };

  const sendMessage = async (text: string) => {
    if (!currentRoom) return;

    // 予約読書会の開始前は投稿を拒否（どの端末からでも阻止するため親側でもチェック）
    if (currentRoom.scheduled_start_at) {
      const startMs = new Date(currentRoom.scheduled_start_at).getTime();
      if (startMs > Date.now()) {
        alert("予約読書会は開始日時まで投稿できません");
        return;
      }
    }

    const sender = profile?.name ?? "you";
    const senderColor = profile?.color ?? "slate";

    // .select().single() で挿入した行（id 含む）を取り戻す
    const { data: insertedMessage, error } = await supabase
      .from("messages")
      .insert({
        room_id: currentRoom.id,
        user_name: sender,
        user_color: senderColor,
        text,
      })
      .select()
      .single();

    if (error || !insertedMessage) {
      showError("投稿", error);
      return;
    }

    // 自分の送信は Realtime の echo を待たずに直接 state に反映する。
    // （スマホで WebSocket が一時的に切れていても自分の画面に出る保険）
    // Realtime からも届いた場合は ID 重複チェックで弾く。
    const message = insertedMessage as Message;
    setBooks((prev) =>
      prev.map((book) => ({
        ...book,
        rooms: book.rooms.map((room) =>
          room.id === currentRoom.id
            ? {
                ...room,
                messages: room.messages.some((m) => m.id === message.id)
                  ? room.messages
                  : [...room.messages, message],
                updated_at: message.created_at,
              }
            : room,
        ),
      })),
    );

    await supabase
      .from("rooms")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentRoom.id);
  };

  const extendRoom = async (hours: number) => {
    if (!currentRoom) return;

    const base = currentRoom.expires_at
      ? new Date(currentRoom.expires_at).getTime()
      : Date.now();

    const start = Math.max(base, Date.now());
    const nextExpiresAt = new Date(
      start + hours * 60 * 60 * 1000,
    ).toISOString();

    // 延長時は updated_at を触らない（活動していないのに「最近の部屋」に出るのを防ぐ）
    const { error } = await supabase
      .from("rooms")
      .update({
        expires_at: nextExpiresAt,
      })
      .eq("id", currentRoom.id);

    if (error) {
      showError("部屋の延長", error);
      return;
    }

    setExtendOpen(false);
    await loadAll();
  };

  const createTrace = async (body: string) => {
    if (!currentBook || !currentRoom) return;

    if (currentRoomTrace) {
      alert("この部屋の置き手紙はすでに残されています。");
      return;
    }

    if (!canCreateLetterNow(currentRoom)) {
      alert("置き手紙は終了1時間前から記入できます。");
      return;
    }

    const { error } = await supabase.from("book_traces").insert({
      book_id: currentBook.id,
      room_id: currentRoom.id,
      room_title: currentRoom.title,
      body,
      created_by_name: profile?.name ?? "unknown",
    });

    if (error) {
      showError("置き手紙の保存", error);
      return;
    }

    setTraceOpen(false);
    await loadAll();
  };

  if (loading) {
    return <div className="p-8">読み込み中...</div>;
  }

  return (
    <>
      {page.type === "top" && (
        <TopPage
          books={books}
          profiles={profiles}
          onOpenBook={(bookId) => setPage({ type: "book", bookId })}
          onEnterActiveRoom={handleEnterRoom}
          currentProfile={profile}
          onOpenProfileSetting={() => setProfileDialogOpen(true)}
          onOpenMyLog={() => setMyLogOpen(true)}
          onClearLocalProfile={clearLocalProfile}
          onOpenAddBook={() => {
            setReturnToProfileAfterAddBook(true);
            setAddBookOpen(true);
          }}
          onOpenContact={() => setContactOpen(true)}
          onOpenMobileMenu={() => setProfileMenuOpen(true)}
          recentHeats={recentHeats}
          unreadCount={totalUnread}
          hasReminder={hasReservationReminder}
        />
      )}

      {page.type === "book" && currentBook && (
        <BookPage
          book={currentBook}
          onBack={() => setPage({ type: "top" })}
          onEnterRoom={(roomId) => handleEnterRoom(currentBook.id, roomId)}
          onCreateRoom={() => setCreateOpen(true)}
          onEditBook={() => setEditBookOpen(true)}
          currentProfile={profile}
          onOpenProfileSetting={() => setProfileDialogOpen(true)}
          onOpenMobileMenu={() => setProfileMenuOpen(true)}
        />
      )}

      {page.type === "room" &&
        currentBook &&
        currentRoom &&
        currentRoomExpired && (
          <ExpiredRoomPage
            onBack={() => setPage({ type: "book", bookId: currentBook.id })}
          />
        )}

      {page.type === "room" &&
        currentBook &&
        currentRoom &&
        !currentRoomExpired && (
          <RoomPage
            book={currentBook}
            room={currentRoom}
            existingTrace={currentRoomTrace}
            onBack={() => setPage({ type: "book", bookId: currentBook.id })}
            onSendMessage={sendMessage}
            onOpenExtend={() => setExtendOpen(true)}
            onOpenTrace={() => setTraceOpen(true)}
            currentProfile={profile}
            onOpenProfileSetting={() => setProfileDialogOpen(true)}
            onOpenMobileMenu={() => setProfileMenuOpen(true)}
            myProfileId={myProfileId}
            onReserve={reserveRoom}
            onCancelReservation={cancelReservation}
          />
        )}

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createRoom}
      />

      <AddBookDialog
        open={addBookOpen}
        onOpenChange={(open) => {
          setAddBookOpen(open);
        }}
        onCreate={createBook}
      />

      <EditBookDialog
        open={editBookOpen}
        onOpenChange={setEditBookOpen}
        book={currentBook}
        onSave={updateBook}
      />

      <ExtendRoomDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        onExtend={extendRoom}
      />

      <AddTraceDialog
        open={traceOpen}
        onOpenChange={setTraceOpen}
        roomTitle={currentRoom?.title ?? ""}
        roomExpiresAt={currentRoom?.expires_at ?? null}
        existingTrace={currentRoomTrace}
        onCreate={createTrace}
      />

      <NameSetupDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        initialName={profile?.name ?? ""}
        initialColor={profile?.color ?? "slate"}
        initialFavoriteBookId={profile?.favoriteBookId ?? null}
        initialFavoriteNote={profile?.favoriteNote ?? ""}
        initialPassphrase={profile?.passphrase ?? ""}
        books={books}
        onSave={saveProfile}
        onOpenAddBook={() => {
          setReturnToProfileAfterAddBook(true);
          setAddBookOpen(true);
        }}
      />

      <ContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        defaultName={profile?.name ?? ""}
        onSubmit={submitContact}
      />

      <MyLogDialog
        open={myLogOpen}
        onOpenChange={setMyLogOpen}
        profile={profile}
        books={books}
        unreadRooms={myUnreadRooms}
        reservations={myReservations}
        onOpenRoom={(bookId, roomId) => {
          setMyLogOpen(false);
          handleEnterRoom(bookId, roomId);
        }}
      />

      <ProfileMenuDialog
        open={profileMenuOpen}
        onOpenChange={setProfileMenuOpen}
        currentProfile={profile}
        profileColor={getColorStyle(profile?.color)}
        onOpenProfileSetting={() => setProfileDialogOpen(true)}
        onOpenMyLog={() => setMyLogOpen(true)}
        onClearLocalProfile={clearLocalProfile}
        onOpenContact={() => setContactOpen(true)}
        unreadCount={totalUnread}
        hasReminder={hasReservationReminder}
      />
    </>
  );
}
