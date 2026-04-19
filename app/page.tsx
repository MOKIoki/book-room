"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
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
import MyLogDialog from "@/components/dialogs/MyLogDialog";
import ProfileMenuDialog from "@/components/dialogs/ProfileMenuDialog";
import ContactDialog from "@/components/dialogs/ContactDialog";

type PageState =
  | { type: "top" }
  | { type: "book"; bookId: string }
  | { type: "room"; bookId: string; roomId: number };

function slugifyTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isRoomExpired(room: Room) {
  if (!room.expires_at) return false;
  return new Date(room.expires_at).getTime() <= Date.now();
}

function pageToPath(p: PageState) {
  if (p.type === "top") return "/";
  if (p.type === "book") return `/b/${p.bookId}`;
  return `/b/${p.bookId}/r/${p.roomId}`;
}

function parsePath(pathname: string): PageState {
  const m = pathname.match(/^\/b\/([^/]+)(?:\/r\/(\d+))?\/?$/);
  if (!m) return { type: "top" };
  const [, bookId, roomIdStr] = m;
  if (roomIdStr) return { type: "room", bookId, roomId: Number(roomIdStr) };
  return { type: "book", bookId };
}

export default function Page() {
  const [books, setBooks] = useState<Book[]>([]);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [page, setPageState] = useState<PageState>({ type: "top" });
  const [createOpen, setCreateOpen] = useState(false);
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myProfileId, setMyProfileId] = useState<number | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<
    { bookId: string; roomId: number } | null
  >(null);

  const [myLogOpen, setMyLogOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [lastSeenMap, setLastSeenMap] = useState<Record<number, string>>({});

  const isPopStateRef = useRef(false);
  const firstLoadRef = useRef(true);

  // Wrap page state setter with pushState
  const setPage = (next: PageState) => {
    setPageState(next);
    if (typeof window !== "undefined" && !isPopStateRef.current) {
      const path = pageToPath(next);
      if (window.location.pathname !== path) {
        window.history.pushState(null, "", path);
      }
    }
    isPopStateRef.current = false;
  };

  // Initial: load profile, restore page from URL, attach popstate
  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem("book-room-profile");
    if (saved) {
      try {
        setProfile(JSON.parse(saved));
      } catch {
        setProfile(null);
      }
    }

    const savedSeen = window.localStorage.getItem("book-room-last-seen");
    if (savedSeen) {
      try {
        setLastSeenMap(JSON.parse(savedSeen));
      } catch {
        // ignore
      }
    }

    const parsed = parsePath(window.location.pathname);
    if (parsed.type !== "top") {
      setPageState(parsed);
    }

    const onPop = () => {
      isPopStateRef.current = true;
      setPageState(parsePath(window.location.pathname));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Upsert ProfileRecord whenever local profile changes
  useEffect(() => {
    if (!profile) {
      setMyProfileId(null);
      return;
    }
    (async () => {
      const { data: existing } = await supabase
        .from("profiles")
        .select("*")
        .eq("name", profile.name)
        .eq("color", profile.color)
        .maybeSingle();
      if (existing) {
        setMyProfileId(existing.id);
        return;
      }
      const { data: inserted, error } = await supabase
        .from("profiles")
        .insert({
          name: profile.name,
          color: profile.color,
          favorite_book_id: profile.favoriteBookId ?? null,
          favorite_note: profile.favoriteNote ?? null,
          passphrase: profile.passphrase ?? null,
        })
        .select()
        .single();
      if (!error && inserted) setMyProfileId(inserted.id);
    })();
  }, [profile?.name, profile?.color]);

  const saveProfile = (nextProfile: UserProfile) => {
    setProfile(nextProfile);
    localStorage.setItem("book-room-profile", JSON.stringify(nextProfile));
    if (pendingEntry) {
      setPage({
        type: "room",
        bookId: pendingEntry.bookId,
        roomId: pendingEntry.roomId,
      });
      setPendingEntry(null);
    }
    setProfileDialogOpen(false);
  };

  const clearLocalProfile = () => {
    localStorage.removeItem("book-room-profile");
    setProfile(null);
    setMyProfileId(null);
  };

  const loadAll = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);

    const [booksRes, roomsRes, tracesRes, profilesRes] = await Promise.all([
      supabase.from("books").select("*").order("title", { ascending: true }),
      supabase.from("rooms").select("*").order("updated_at", { ascending: false }),
      supabase
        .from("book_traces")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
    ]);

    // Books and rooms are core — abort only if either fails.
    if (booksRes.error || roomsRes.error) {
      console.error(booksRes.error ?? roomsRes.error);
      if (!options.silent) setLoading(false);
      return;
    }

    // Traces and profiles are optional — fall back to [] so one
    // missing table (or RLS blocking) doesn't hide the whole app.
    if (tracesRes.error) console.warn("book_traces:", tracesRes.error);
    if (profilesRes.error) console.warn("profiles:", profilesRes.error);
    const tracesData: BookTrace[] = tracesRes.error
      ? []
      : ((tracesRes.data ?? []) as BookTrace[]);
    const profilesData: ProfileRecord[] = profilesRes.error
      ? []
      : ((profilesRes.data ?? []) as ProfileRecord[]);

    const roomIds = (roomsRes.data ?? []).map((r) => r.id);
    let messagesData: Message[] = [];
    let reservationsData: Reservation[] = [];
    if (roomIds.length > 0) {
      const [msgRes, resRes] = await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .in("room_id", roomIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("reservations")
          .select("*")
          .in("room_id", roomIds)
          .order("created_at", { ascending: true }),
      ]);
      // messages is core for existing rooms.
      if (msgRes.error) {
        console.error(msgRes.error);
        if (!options.silent) setLoading(false);
        return;
      }
      messagesData = msgRes.data ?? [];
      // reservations is optional — don't block the page if it errors.
      if (resRes.error) console.warn("reservations:", resRes.error);
      reservationsData = resRes.error ? [] : (resRes.data ?? []);
    }

    const merged: Book[] = (booksRes.data ?? []).map((book) => {
      const rooms: Room[] = (roomsRes.data ?? [])
        .filter((room) => room.book_id === book.id)
        .map((room) => ({
          ...room,
          messages: messagesData.filter((m) => m.room_id === room.id),
          reservations: reservationsData.filter((r) => r.room_id === room.id),
        }));
      const traces: BookTrace[] = tracesData.filter((t) => t.book_id === book.id);
      return { ...book, rooms, traces };
    });

    setBooks(merged);
    setProfiles(profilesData);
    if (!options.silent) setLoading(false);
  };

  // Initial full load + silent re-load on navigation
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      loadAll();
    } else {
      loadAll({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Realtime subscription: reload on any change
  useEffect(() => {
    const channel = supabase
      .channel("global-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => loadAll({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms" },
        () => loadAll({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rooms" },
        () => loadAll({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "rooms" },
        () => loadAll({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reservations" },
        () => loadAll({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reservations" },
        () => loadAll({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "book_traces" },
        () => loadAll({ silent: true }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visibility resync
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        loadAll({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentBook =
    page.type !== "top" ? books.find((b) => b.id === page.bookId) ?? null : null;
  const currentRoom =
    page.type === "room" && currentBook
      ? currentBook.rooms.find((r) => r.id === page.roomId) ?? null
      : null;
  const currentRoomExpired = currentRoom ? isRoomExpired(currentRoom) : false;

  const recentHeats = useMemo(() => {
    const heats = books.flatMap((book) =>
      book.traces.map((trace) => ({
        bookId: book.id,
        bookTitle: book.title,
        body: trace.body,
        roomTitle: trace.room_title ?? null,
        createdAt: trace.created_at,
      })),
    );
    heats.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return heats;
  }, [books]);

  // Rooms the user has posted in, not expired, with activity newer than lastSeen.
  const myUnreadRooms = useMemo(() => {
    const myName = profile?.name;
    if (!myName) return [] as { bookId: string; roomId: number }[];
    const result: { bookId: string; roomId: number }[] = [];
    books.forEach((book) => {
      book.rooms.forEach((room) => {
        if (isRoomExpired(room)) return;
        if (!room.messages.some((m) => m.user_name === myName)) return;
        const seen = lastSeenMap[room.id];
        if (!seen || new Date(room.updated_at).getTime() > new Date(seen).getTime()) {
          result.push({ bookId: book.id, roomId: room.id });
        }
      });
    });
    return result;
  }, [books, profile?.name, lastSeenMap]);

  // Any of my reservations starting within the next 24 hours.
  const hasReservationReminder = useMemo(() => {
    if (!myProfileId) return false;
    const now = Date.now();
    const within = 24 * 60 * 60 * 1000;
    return books.some((book) =>
      book.rooms.some((room) => {
        if (!room.scheduled_start_at) return false;
        const mine = room.reservations.some((r) => r.profile_id === myProfileId);
        if (!mine) return false;
        const startMs = new Date(room.scheduled_start_at).getTime();
        return startMs > now && startMs - now <= within;
      }),
    );
  }, [books, myProfileId]);

  // When we enter a room, stamp last-seen for it.
  useEffect(() => {
    if (page.type !== "room") return;
    const roomId = page.roomId;
    const nextMap = { ...lastSeenMap, [roomId]: new Date().toISOString() };
    setLastSeenMap(nextMap);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "book-room-last-seen",
        JSON.stringify(nextMap),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Persist a "contact" message. Returns true on success so the dialog
  // can show the thank-you panel.
  const submitContact = async (body: string) => {
    const { error } = await supabase.from("contacts").insert({
      body,
      from_name: profile?.name ?? null,
    });
    if (error) {
      console.error("contacts:", error);
      alert(
        "送信に失敗しました。テーブル未作成かもしれません。お手数ですが別の方法で教えてください。",
      );
      return false;
    }
    return true;
  };

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

    if (books.some((b) => b.id === nextId)) {
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
    });

    if (error) {
      console.error(error);
      alert("本の追加に失敗しました");
      return;
    }

    setAddBookOpen(false);
    await loadAll({ silent: true });
  };

  const createRoom = async (payload: {
    title: string;
    entryType: "open" | "approval";
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
    scheduledStartAt: string | null;
  }) => {
    if (!currentBook) return;

    const baseMs = payload.scheduledStartAt
      ? new Date(payload.scheduledStartAt).getTime()
      : Date.now();
    const expiresAt = new Date(
      baseMs + payload.durationHours * 60 * 60 * 1000,
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
        scheduled_start_at: payload.scheduledStartAt,
        created_by_profile_id: myProfileId,
      })
      .select()
      .single();

    if (roomError) {
      console.error(roomError);
      alert("部屋の作成に失敗しました");
      return;
    }

    // Auto-reserve the creator as the first attendee
    if (payload.scheduledStartAt && myProfileId) {
      await supabase.from("reservations").insert({
        room_id: insertedRoom.id,
        profile_id: myProfileId,
        profile_name: profile?.name ?? null,
      });
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
      if (messageError) console.error(messageError);
    }

    setCreateOpen(false);
    await loadAll({ silent: true });
    setPage({ type: "room", bookId: currentBook.id, roomId: insertedRoom.id });
  };

  const sendMessage = async (text: string) => {
    if (!currentRoom) return;

    if (currentRoom.scheduled_start_at) {
      const startMs = new Date(currentRoom.scheduled_start_at).getTime();
      if (startMs > Date.now()) {
        alert("予約読書会は開始日時まで投稿できません");
        return;
      }
    }

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
  };

  const deleteRoom = async (roomId: number) => {
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      console.error(error);
      alert(`部屋の削除に失敗しました: ${error.message}`);
      return;
    }
    await loadAll({ silent: true });
    if (currentBook) {
      setPage({ type: "book", bookId: currentBook.id });
    } else {
      setPage({ type: "top" });
    }
  };

  const reserve = async () => {
    if (!currentRoom || !myProfileId) {
      alert("予約には名前の設定が必要です");
      return;
    }
    const { error } = await supabase.from("reservations").insert({
      room_id: currentRoom.id,
      profile_id: myProfileId,
      profile_name: profile?.name ?? null,
    });
    if (error) {
      console.error(error);
      alert(`予約できませんでした: ${error.message}`);
    }
  };

  const cancelReservation = async () => {
    if (!currentRoom || !myProfileId) return;
    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("room_id", currentRoom.id)
      .eq("profile_id", myProfileId);
    if (error) {
      console.error(error);
      alert(`キャンセルできませんでした: ${error.message}`);
    }
  };

  const extendRoom = async (hours: number) => {
    if (!currentRoom) return;
    const base = currentRoom.expires_at
      ? new Date(currentRoom.expires_at).getTime()
      : Date.now();
    const next = new Date(base + hours * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("rooms")
      .update({ expires_at: next })
      .eq("id", currentRoom.id);
    if (error) {
      console.error(error);
      alert("延長に失敗しました");
    }
  };

  const leaveTrace = async (body: string) => {
    if (!currentRoom || !currentBook) return;
    const { error } = await supabase.from("book_traces").insert({
      book_id: currentBook.id,
      room_id: currentRoom.id,
      room_title: currentRoom.title,
      body,
      created_by_name: profile?.name ?? null,
    });
    if (error) {
      console.error(error);
      alert("置き手紙の保存に失敗しました");
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
          unreadCount={myUnreadRooms.length}
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
            currentProfile={profile}
            myProfileId={myProfileId}
            onBack={() => setPage({ type: "book", bookId: currentBook.id })}
            onSendMessage={sendMessage}
            onDeleteRoom={() => deleteRoom(currentRoom.id)}
            onReserve={reserve}
            onCancelReservation={cancelReservation}
            onExtend={extendRoom}
            onLeaveTrace={leaveTrace}
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

      <MyLogDialog
        open={myLogOpen}
        onOpenChange={setMyLogOpen}
        books={books}
        currentProfile={profile}
        myProfileId={myProfileId}
        lastSeenMap={lastSeenMap}
        onEnterRoom={handleEnterRoom}
      />

      <ContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        onSubmit={submitContact}
      />

      <ProfileMenuDialog
        open={profileMenuOpen}
        onOpenChange={setProfileMenuOpen}
        currentProfile={profile}
        unreadCount={myUnreadRooms.length}
        hasReminder={hasReservationReminder}
        onOpenMyLog={() => setMyLogOpen(true)}
        onOpenProfileSetting={() => setProfileDialogOpen(true)}
        onClearLocalProfile={clearLocalProfile}
        onOpenContact={() => setContactOpen(true)}
      />

      <NameSetupDialog
        open={profileDialogOpen}
        initialName={profile?.name ?? ""}
        initialColor={profile?.color ?? "slate"}
        onSave={saveProfile}
        onClose={() => {
          setProfileDialogOpen(false);
          setPendingEntry(null);
        }}
      />
    </>
  );
}
