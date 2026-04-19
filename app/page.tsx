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
 import RoomPage from "@/components/pages/RoomPage";
 import ExpiredRoomPage from "@/components/pages/ExpiredRoomPage";
 import AddBookDialog from "@/components/dialogs/AddBookDialog";
 import NameSetupDialog from "@/components/dialogs/NameSetupDialog";
 import CreateRoomDialog from "@/components/dialogs/CreateRoomDialog";

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
