"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search, BookOpen, MessageSquare, Users, Plus, ArrowLeft, Lock, DoorOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  Message,
  Reservation,
  Room,
  BookTrace,
  Book,
  UserProfile,
  ProfileRecord,
} from "@/lib/types";
 import BookPage from "@/components/pages/BookPage";
 import TopPage from "@/components/pages/TopPage";

const spoilerMap = {
  none: { label: "未読歓迎", variant: "secondary" as const },
  progress: { label: "途中まで", variant: "outline" as const },
  read: { label: "読了者向け", variant: "default" as const },
};

const entryMap = {
  welcome: { label: "ふらっと歓迎", icon: DoorOpen },
  deep: { label: "じっくり対話", icon: MessageSquare },
  small: { label: "少人数向け", icon: Lock },
  open: { label: "ふらっと歓迎", icon: DoorOpen },
  approval: { label: "少人数向け", icon: Lock },
} as const;

const colorOptions = [
  { value: "slate", label: "グレー", bubble: "bg-slate-100 text-slate-800", chip: "bg-slate-500", name: "text-slate-700" },
  { value: "red", label: "赤", bubble: "bg-red-100 text-red-900", chip: "bg-red-500", name: "text-red-700" },
  { value: "blue", label: "青", bubble: "bg-blue-100 text-blue-900", chip: "bg-blue-500", name: "text-blue-700" },
  { value: "green", label: "緑", bubble: "bg-green-100 text-green-900", chip: "bg-green-500", name: "text-green-700" },
  { value: "purple", label: "紫", bubble: "bg-purple-100 text-purple-900", chip: "bg-purple-500", name: "text-purple-700" },
  { value: "amber", label: "黄", bubble: "bg-amber-100 text-amber-900", chip: "bg-amber-500", name: "text-amber-700" },
] as const;

function getColorStyle(color?: string | null) {
  return colorOptions.find((c) => c.value === color) ?? colorOptions[0];
}

function isRoomExpired(room: Room) {
  if (!room.expires_at) return false;
  return new Date(room.expires_at).getTime() <= Date.now();
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

function slugifyTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function RoomBadge({ room }: { room: Room }) {
  const EntryIcon = entryMap[room.entry_type].icon;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" className="gap-1 rounded-full">
        <EntryIcon className="h-3 w-3" />
        {entryMap[room.entry_type].label}
      </Badge>
      <Badge variant={spoilerMap[room.spoiler].variant} className="rounded-full">
        {spoilerMap[room.spoiler].label}
      </Badge>
    </div>
  );
}

function NameSetupDialog({
  open,
  initialName,
  initialColor,
  onSave,
}: {
  open: boolean;
  initialName: string;
  initialColor: string;
  onSave: (profile: UserProfile) => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    setName(initialName);
    setColor(initialColor);
  }, [initialName, initialColor, open]);

  return (
    <Dialog open={open}>
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
      <DialogContent className="rounded-3xl sm:max-w-xl">
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
              placeholder="例: 戦後文学の代表作のひとつ。人間関係や没落の感覚を語りやすい。"
              className="min-h-[120px] rounded-2xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-2xl" onClick={() => onOpenChange(false)}>
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


function ExpiredRoomPage({
  onBack,
}: {
  onBack: () => void;
}) {
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

function RoomPage({
  book,
  room,
  onBack,
  onSendMessage,
  onDeleteRoom,
}: {
  book: Book;
  room: Room;
  onBack: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onDeleteRoom: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

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
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="ghost" className="rounded-2xl" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {book.title} に戻る
          </Button>

          <Button
            variant="destructive"
            className="rounded-2xl"
            onClick={async () => {
              const ok = window.confirm("この部屋を削除しますか？");
              if (!ok) return;
              await onDeleteRoom();
            }}
          >
            部屋を削除
          </Button>
        </div>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="border-b border-neutral-100 pb-5">
            <div className="text-sm text-neutral-500">{book.title}</div>
            <CardTitle className="text-2xl leading-8">{room.title}</CardTitle>
            <div className="pt-2">
              <RoomBadge room={room} />
            </div>
            <div className="flex flex-wrap gap-4 pt-2 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                {room.active_users}人
              </span>
              <span>{formatRelativeTime(room.updated_at)}</span>
              <span>{formatExpiresAt(room.expires_at)}</span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="h-[460px] space-y-4 overflow-y-auto p-6">
              {room.messages.map((m) => {
                const colorStyle = getColorStyle(m.user_color);
                return (
                  <div key={m.id} className="flex gap-3">
                    <div className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium uppercase text-white ${colorStyle.chip}`}>
                      {m.user_name.slice(0, 1)}
                    </div>
                    <div className="max-w-[85%]">
                      <div className="mb-1 flex items-center gap-2 text-sm">
                        <span className={`font-medium ${colorStyle.name}`}>{m.user_name}</span>
                        <span className="text-neutral-400">
                          {new Date(m.created_at).toLocaleTimeString("ja-JP", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className={`rounded-2xl px-4 py-3 leading-7 ${colorStyle.bubble}`}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-neutral-100 p-4">
              <div className="mb-2 text-xs text-neutral-500">
                会話補助の例: 「まず一言感想」「好きだった箇所」「引っかかった点」
              </div>
              <div className="flex gap-3">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="本の話題に沿って投稿してください。"
                  className="min-h-[88px] rounded-2xl"
                />
                <Button onClick={submit} className="h-auto rounded-2xl px-6" disabled={sending}>
                  送信
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreateRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: {
    title: string;
    entryType: "open" | "approval";
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
  }) => Promise<void>;
}) {
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

export default function Page() {
  const [books, setBooks] = useState<Book[]>([]);
  const [page, setPage] = useState<
    { type: "top" } |
    { type: "book"; bookId: string } |
    { type: "room"; bookId: string; roomId: number }
  >({ type: "top" });
  const [createOpen, setCreateOpen] = useState(false);
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<{ bookId: string; roomId: number } | null>(null);

  const [profiles] = useState<ProfileRecord[]>([]);
  const [myLogOpen, setMyLogOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

useEffect(() => {
  if (typeof window === "undefined") return;

  const saved = window.localStorage.getItem("book-room-profile");
  if (!saved) return;

  try {
    setProfile(JSON.parse(saved));
  } catch {
    setProfile(null);
  }
}, []);

  const saveProfile = (nextProfile: UserProfile) => {
    setProfile(nextProfile);
    localStorage.setItem("book-room-profile", JSON.stringify(nextProfile));

    if (pendingEntry) {
      setPage({ type: "room", bookId: pendingEntry.bookId, roomId: pendingEntry.roomId });
      setPendingEntry(null);
    }

    setProfileDialogOpen(false);
  };

  const clearLocalProfile = () => {
    localStorage.removeItem("book-room-profile");
    setProfile(null);
  };

  const recentHeats: {
    bookId: string;
    bookTitle: string;
    body: string;
    roomTitle: string | null;
    createdAt: string;
  }[] = [];

  const myLogUnreadCount = 0;
  const hasReservationReminder = false;

  const loadAll = async () => {
    setLoading(true);

    const { data: booksData, error: booksError } = await supabase
      .from("books")
      .select("*")
      .order("title", { ascending: true });

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
      messagesData = data ?? [];
    }

    const merged: Book[] = (booksData ?? []).map((book) => {
      const rooms = (roomsData ?? [])
        .filter((room) => room.book_id === book.id)
        .map((room) => ({
          ...room,
          messages: messagesData.filter((m) => m.room_id === room.id),
        }));

      return {
        ...book,
        rooms,
      };
    });

    setBooks(merged);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const currentBook =
    page.type !== "top" ? books.find((b) => b.id === page.bookId) ?? null : null;

  const currentRoom =
    page.type === "room" && currentBook
      ? currentBook.rooms.find((r) => r.id === page.roomId) ?? null
      : null;

  const currentRoomExpired = currentRoom ? isRoomExpired(currentRoom) : false;

  const handleEnterRoom = (bookId: string, roomId: number) => {
    if (!profile) {
      setPendingEntry({ bookId, roomId });
      setProfileDialogOpen(true);
      return;
    }
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
      alert("同じIDになりそうな本がすでにあります。タイトルを少し変えて追加してください。");
      return;
    }

    const { error } = await supabase.from("books").insert({
      id: nextId,
      title: payload.title,
      author: payload.author || null,
      description: payload.description || null,
    });

    if (error) {
      console.error(error);
      alert("本の追加に失敗しました");
      return;
    }

    setAddBookOpen(false);
    await loadAll();
  };

  const createRoom = async (payload: {
    title: string;
    entryType: "open" | "approval";
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
  }) => {
    if (!currentBook) return;

    const expiresAt = new Date(Date.now() + payload.durationHours * 60 * 60 * 1000).toISOString();

    const { data: insertedRoom, error: roomError } = await supabase
      .from("rooms")
      .insert({
        book_id: currentBook.id,
        title: payload.title,
        entry_type: payload.entryType,
        spoiler: payload.spoiler,
        active_users: 1,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (roomError) {
      console.error(roomError);
      alert("部屋の作成に失敗しました");
      return;
    }

    if (payload.firstMessage) {
      const sender = profile?.name ?? "you";
      const senderColor = profile?.color ?? "slate";

      const { error: messageError } = await supabase.from("messages").insert({
        room_id: insertedRoom.id,
        user_name: sender,
        user_color: senderColor,
        text: payload.firstMessage,
      });

      if (messageError) {
        console.error(messageError);
        alert("最初の投稿の保存に失敗しました");
        return;
      }
    }

    setCreateOpen(false);
    await loadAll();
    setPage({ type: "room", bookId: currentBook.id, roomId: insertedRoom.id });
  };

  const sendMessage = async (text: string) => {
    if (!currentRoom) return;

    const sender = profile?.name ?? "you";
    const senderColor = profile?.color ?? "slate";

    const { error } = await supabase.from("messages").insert({
      room_id: currentRoom.id,
      user_name: sender,
      user_color: senderColor,
      text,
    });

    if (error) {
      console.error(error);
      alert("投稿に失敗しました");
      return;
    }

    await supabase
      .from("rooms")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentRoom.id);

    await loadAll();
  };

  const deleteRoom = async (roomId: number) => {
    const { error } = await supabase
      .from("rooms")
      .delete()
      .eq("id", roomId);

    if (error) {
      console.error(error);
      alert(`部屋の削除に失敗しました: ${error.message}`);
      return;
    }

    await loadAll();

    if (currentBook) {
      setPage({ type: "book", bookId: currentBook.id });
    } else {
      setPage({ type: "top" });
    }
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
          onOpenAddBook={() => setAddBookOpen(true)}
          onOpenContact={() => setContactOpen(true)}
          onOpenMobileMenu={() => setProfileMenuOpen(true)}
          recentHeats={recentHeats}
          unreadCount={myLogUnreadCount}
          hasReminder={hasReservationReminder}
        />
      )}

      {page.type === "book" && currentBook && (
        <BookPage
          book={currentBook}
          onBack={() => setPage({ type: "top" })}
          onEnterRoom={(roomId) => handleEnterRoom(currentBook.id, roomId)}
          onCreateRoom={() => setCreateOpen(true)}
          onEditBook={() => {}}
          currentProfile={profile}
          onOpenProfileSetting={() => setProfileDialogOpen(true)}
          onOpenMobileMenu={() => setProfileMenuOpen(true)}
        />
      )}

      {page.type === "room" && currentBook && currentRoom && currentRoomExpired && (
        <ExpiredRoomPage
          onBack={() => setPage({ type: "book", bookId: currentBook.id })}
        />
      )}

      {page.type === "room" && currentBook && currentRoom && !currentRoomExpired && (
        <RoomPage
          book={currentBook}
          room={currentRoom}
          onBack={() => setPage({ type: "book", bookId: currentBook.id })}
          onSendMessage={sendMessage}
          onDeleteRoom={() => deleteRoom(currentRoom.id)}
        />
      )}

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createRoom}
      />

      <AddBookDialog
        open={addBookOpen}
        onOpenChange={setAddBookOpen}
        onCreate={createBook}
      />

      <Dialog open={myLogOpen} onOpenChange={setMyLogOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>自分の記録</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-neutral-600">
            この画面は分割の都合で一時的に簡略表示しています。
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>管理人に伝える</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-neutral-600">
            この画面は分割の都合で一時的に簡略表示しています。
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>メニュー</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-neutral-600">
            分割後にこのメニューを順次戻します。
          </div>
        </DialogContent>
      </Dialog>

      <NameSetupDialog
        open={profileDialogOpen}
        initialName={profile?.name ?? ""}
        initialColor={profile?.color ?? "slate"}
        onSave={saveProfile}
      />
    </>
  );
}
