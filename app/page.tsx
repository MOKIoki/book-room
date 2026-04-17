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

type Message = {
  id: number;
  room_id: number;
  user_name: string;
  text: string;
  created_at: string;
};

type Room = {
  id: number;
  book_id: string;
  title: string;
  entry_type: "open" | "approval";
  spoiler: "none" | "progress" | "read";
  active_users: number;
  updated_at: string;
  expires_at: string | null;
  messages: Message[];
};

type Book = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  rooms: Room[];
};

const spoilerMap = {
  none: { label: "未読歓迎", variant: "secondary" as const },
  progress: { label: "途中まで", variant: "outline" as const },
  read: { label: "読了者向け", variant: "default" as const },
};

const entryMap = {
  open: { label: "飛び込みOK", icon: DoorOpen },
  approval: { label: "承認制", icon: Lock },
};

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
  if (diffMin <= 0) return "期限切れ";
  if (diffMin < 60) return `残り${diffMin}分`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `残り${diffHour}時間`;
  const diffDay = Math.floor(diffHour / 24);
  return `残り${diffDay}日`;
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

function TopPage({
  books,
  onOpenBook,
}: {
  books: Book[];
  onOpenBook: (bookId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author ?? "").toLowerCase().includes(q)
    );
  }, [books, query]);

  const activeRooms = books
    .flatMap((b) => b.rooms.map((r) => ({ ...r, bookTitle: b.title })))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader className="space-y-4 p-8">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600">
                <BookOpen className="h-4 w-4" />
                本に属する談話室
              </div>
              <div className="space-y-3">
                <CardTitle className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  読んで終わりにしない。
                </CardTitle>
                <CardDescription className="max-w-2xl text-base leading-7 text-neutral-600">
                  本を読んだ後に少し話したくなった時のための場所です。
                  本ごとのページに入り、その本について短く話せる部屋に参加できます。
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">今、人がいる部屋</CardTitle>
              <CardDescription>短命の部屋を基本にします。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeRooms.map((room) => (
                <div key={room.id} className="rounded-2xl border border-neutral-200 p-4">
                  <div className="mb-2 text-sm text-neutral-500">{room.bookTitle}</div>
                  <div className="mb-2 font-medium leading-6">{room.title}</div>
                  <RoomBadge room={room} />
                  <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {room.active_users}人
                    </span>
                    <span>{formatRelativeTime(room.updated_at)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">本を探す</h2>
              <p className="text-sm text-neutral-500">本に入る。人を探しに行かない。</p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="本のタイトル・著者名で検索"
                className="rounded-2xl pl-9"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((book) => (
              <Card key={book.id} className="rounded-3xl border border-neutral-200 shadow-none">
                <CardHeader className="space-y-2">
                  <div className="text-sm text-neutral-500">{book.author}</div>
                  <CardTitle className="text-xl leading-7">{book.title}</CardTitle>
                  <CardDescription className="leading-6">{book.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="text-sm text-neutral-500">稼働中の部屋 {book.rooms.length}件</div>
                  <Button className="rounded-2xl" onClick={() => onOpenBook(book.id)}>
                    この本のページへ
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BookPage({
  book,
  onBack,
  onOpenRoom,
  onCreateRoom,
}: {
  book: Book;
  onBack: () => void;
  onOpenRoom: (roomId: number) => void;
  onCreateRoom: () => void;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Button variant="ghost" className="mb-4 rounded-2xl" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          戻る
        </Button>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="p-8">
            <div className="mb-2 text-sm text-neutral-500">{book.author}</div>
            <CardTitle className="text-3xl">{book.title}</CardTitle>
            <CardDescription className="max-w-3xl pt-2 text-base leading-7">
              {book.description}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="mt-6">
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xl">この本の部屋</CardTitle>
                <CardDescription>部屋は短命で構いません。</CardDescription>
              </div>
              <Button className="gap-2 rounded-2xl" onClick={onCreateRoom}>
                <Plus className="h-4 w-4" />
                部屋を作る
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {book.rooms.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                    <MessageSquare className="h-5 w-5 text-neutral-500" />
                  </div>
                  <div className="mb-2 font-medium">まだ部屋がありません</div>
                  <Button className="rounded-2xl" onClick={onCreateRoom}>
                    最初の部屋を作る
                  </Button>
                </div>
              ) : (
                book.rooms.map((room) => (
                  <div key={room.id} className="rounded-3xl border border-neutral-200 p-5">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-medium leading-7">{room.title}</div>
                        <div className="mt-2">
                          <RoomBadge room={room} />
                        </div>
                      </div>
                      <Button variant="outline" className="rounded-2xl" onClick={() => onOpenRoom(room.id)}>
                        入る
                      </Button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-4 text-sm text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {room.active_users}人
                      </span>
                      <span>{formatRelativeTime(room.updated_at)}</span>
                      <span>{formatExpiresAt(room.expires_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RoomPage({
  book,
  room,
  onBack,
  onSendMessage,
}: {
  book: Book;
  room: Room;
  onBack: () => void;
  onSendMessage: (text: string) => Promise<void>;
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
        <Button variant="ghost" className="mb-4 rounded-2xl" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {book.title} に戻る
        </Button>

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
              {room.messages.map((m) => (
                <div key={m.id} className="flex gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium uppercase text-neutral-700">
                    {m.user_name.slice(0, 1)}
                  </div>
                  <div className="max-w-[85%]">
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="font-medium">{m.user_name}</span>
                      <span className="text-neutral-400">
                        {new Date(m.created_at).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-neutral-100 px-4 py-3 leading-7 text-neutral-800">
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
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
    firstMessage: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [entryType, setEntryType] = useState<"open" | "approval">("open");
  const [spoiler, setSpoiler] = useState<"none" | "progress" | "read">("none");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    await onCreate({
      title: title.trim(),
      entryType,
      spoiler,
      firstMessage: note.trim(),
    });
    setTitle("");
    setEntryType("open");
    setSpoiler("none");
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
  const [loading, setLoading] = useState(true);

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

  const createRoom = async (payload: {
    title: string;
    entryType: "open" | "approval";
    spoiler: "none" | "progress" | "read";
    firstMessage: string;
  }) => {
    if (!currentBook) return;

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

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
      return;
    }

    if (payload.firstMessage) {
      const { error: messageError } = await supabase.from("messages").insert({
        room_id: insertedRoom.id,
        user_name: "you",
        text: payload.firstMessage,
      });

      if (messageError) {
        console.error(messageError);
        return;
      }
    }

    setCreateOpen(false);
    await loadAll();
    setPage({ type: "room", bookId: currentBook.id, roomId: insertedRoom.id });
  };

  const sendMessage = async (text: string) => {
    if (!currentRoom) return;

    const { error } = await supabase.from("messages").insert({
      room_id: currentRoom.id,
      user_name: "you",
      text,
    });

    if (error) {
      console.error(error);
      return;
    }

    await supabase
      .from("rooms")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentRoom.id);

    await loadAll();
  };

  if (loading) {
    return <div className="p-8">読み込み中...</div>;
  }

  return (
    <>
      {page.type === "top" && (
        <TopPage books={books} onOpenBook={(bookId) => setPage({ type: "book", bookId })} />
      )}

      {page.type === "book" && currentBook && (
        <BookPage
          book={currentBook}
          onBack={() => setPage({ type: "top" })}
          onOpenRoom={(roomId) => setPage({ type: "room", bookId: currentBook.id, roomId })}
          onCreateRoom={() => setCreateOpen(true)}
        />
      )}

      {page.type === "room" && currentBook && currentRoom && (
        <RoomPage
          book={currentBook}
          room={currentRoom}
          onBack={() => setPage({ type: "book", bookId: currentBook.id })}
          onSendMessage={sendMessage}
        />
      )}

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createRoom}
      />
    </>
  );
}