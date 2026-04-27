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
  const [localBrowserToken, setLocalBrowserToken] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<
    { bookId: string; roomId: number } | null
  >(null);
  // プロフィール未設定のまま「本を追加」を押された時に、
  // プロフィール保存後に続けて AddBookDialog を開くためのフラグ。
  const [pendingAddBook, setPendingAddBook] = useState(false);

  const [myLogOpen, setMyLogOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [lastSeenMap, setLastSeenMap] = useState<Record<number, string>>({});

  const isPopStateRef = useRef(false);
  const firstLoadRef = useRef(true);

  // ページ遷移を pushState 込みでセットする
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

  // 初回: localStorage 復元 / URL からページ復元 / popstate 監視
  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem("book-room-profile");
    if (saved) {
      try {
        setProfile(JSON.parse(saved));
      } catch {
        setProfile(null);
      }
      // browser_token: localStorage になければ生成、あればそのまま使う。
    // 11_policies 適用後の RPC 認証で使う想定。
    // 現時点では state に保持するだけで、既存のプロフィール作成・更新には
    // 接続しない (= 副作用なし)。
    const savedToken = window.localStorage.getItem("book-room-browser-token");
    if (savedToken) {
      setLocalBrowserToken(savedToken);
    } else {
      const newToken = crypto.randomUUID();
      window.localStorage.setItem("book-room-browser-token", newToken);
      setLocalBrowserToken(newToken);
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

  // プロフィールが変わったら DB に upsert し、myProfileId を確定する。
  // マッチは name のみで行う(同名はいないという前提)。color や
  // passphrase は同じレコードに対して上書きする運用。
  useEffect(() => {
    if (!profile) {
      setMyProfileId(null);
      return;
    }
    (async () => {
      // Step 2: 高速パス — browser_token から自分の profile を引く。
      // 成功すれば後段に流す。null / 未登録なら従来の name lookup に fallback。
      // ProfileRecord (= public 列のみ) には passphrase が無いため、
      // ここでは profiles 全列の inline 型で受ける。下の if 内で
      // color / favorite_book_id / favorite_note / passphrase / id を参照する。
      let existing:
        | {
            id: number;
            color: string;
            favorite_book_id: string | null;
            favorite_note: string | null;
            passphrase: string | null;
          }
        | undefined;

      if (localBrowserToken) {
        const { data: idByToken } = await supabase
          .rpc("get_my_profile_id", { p_browser_token: localBrowserToken });
        if (idByToken !== null && idByToken !== undefined) {
          const { data: row } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", idByToken as number)
            .maybeSingle();
          if (row) existing = row;
        }
      }

      if (!existing) {
        const { data: matches, error: selectError } = await supabase
          .from("profiles")
          .select("*")
          .eq("name", profile.name)
          .order("id", { ascending: true });

        if (selectError) {
          console.error("profile lookup failed:", selectError);
          return;
        }
        existing = matches?.[0];
      }
      if (existing) {
        setMyProfileId(existing.id);
        const nextColor = profile.color;
        const nextFavBook = profile.favoriteBookId ?? null;
        const nextFavNote = profile.favoriteNote ?? null;
        const nextPassphrase = profile.passphrase ?? null;
if (
          existing.color !== nextColor ||
          existing.favorite_book_id !== nextFavBook ||
          existing.favorite_note !== nextFavNote ||
          existing.passphrase !== nextPassphrase
        ) {
          // Step 4: browser_token が DB と一致する (= 自分の profile が確定) 場合は
          // update_profile_as_owner RPC 経由。一致しない (= legacy 名前 match) は
          // 旧 direct UPDATE を残す。後者は claim_legacy_profile 配線で解消予定。
          const isTokenMatched =
            !!localBrowserToken &&
            (existing as { browser_token?: string | null }).browser_token === localBrowserToken;

          if (isTokenMatched) {
            const { error: updateError } = await supabase.rpc(
              "update_profile_as_owner",
              {
                p_profile_id: existing.id,
                p_browser_token: localBrowserToken,
                p_passphrase: null,                       // auth は browser_token で
                p_new_name: profile.name,
                p_new_color: nextColor,
                p_new_favorite_book_id: nextFavBook,
                p_new_favorite_note: nextFavNote,
                // null = 変更しない / '' = クリア / 文字列 = 設定。
                // dialog は「未入力なら null」で送ってくるので、ここは
                // 「null なら '' (= クリア意図)」、文字列ならそのまま。
                p_new_passphrase: nextPassphrase ?? "",
              },
            );
            if (updateError) {
              console.error("update_profile_as_owner failed:", updateError);
            }
          } else {
            await supabase
              .from("profiles")
              .update({
                color: nextColor,
                favorite_book_id: nextFavBook,
                favorite_note: nextFavNote,
                passphrase: nextPassphrase,
              })
              .eq("id", existing.id);
          }
        }
        return;
      }

// Step 3: 直接 INSERT を create_profile RPC に置換。
      // create_profile は (name, color, browser_token, passphrase) を受け取り、
      // 新しい profile.id (bigint) を返す。
      // favorite_book_id / favorite_note は RPC 引数に無いため、
      // 必要なら直後に補助 UPDATE で書く (Step 4 で update_profile_as_owner に置換予定)。
      if (!localBrowserToken) {
        // browser_token がまだ準備できていない → useEffect 再実行を待つ
        return;
      }
      const { data: createdId, error: createError } = await supabase
        .rpc("create_profile", {
          p_name: profile.name,
          p_color: profile.color,
          p_browser_token: localBrowserToken,
          p_passphrase: profile.passphrase ?? null,
        });

      if (createError) {
        console.error("create_profile failed:", createError);
        return;
      }
      if (typeof createdId !== "number") return;

      setMyProfileId(createdId);

      // favorite_* を後付けで反映 (Step 4 で RPC 化予定)。
const hasFavorites =
        (profile.favoriteBookId ?? null) !== null ||
        (profile.favoriteNote ?? null) !== null;
      if (hasFavorites) {
        // Step 4: 補助 UPDATE も RPC に統一。
        // create_profile 直後なので browser_token は確実に DB と一致 → auth OK。
        // passphrase は create_profile で既に保存済み → p_new_passphrase = null
        // (= "変更しない")。
        const { error: updateError } = await supabase.rpc(
          "update_profile_as_owner",
          {
            p_profile_id: createdId,
            p_browser_token: localBrowserToken,
            p_passphrase: null,
            p_new_name: profile.name,
            p_new_color: profile.color,
            p_new_favorite_book_id: profile.favoriteBookId ?? null,
            p_new_favorite_note: profile.favoriteNote ?? null,
            p_new_passphrase: null,
          },
        );
        if (updateError) {
          console.error("update_profile_as_owner (post-create) failed:", updateError);
        }
      }
    })();
  }, [
    profile?.name,
    profile?.color,
    profile?.favoriteBookId,
    profile?.favoriteNote,
    profile?.passphrase,
    localBrowserToken,
  ]);

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
    if (pendingAddBook) {
      setAddBookOpen(true);
      setPendingAddBook(false);
    }
    setProfileDialogOpen(false);
  };

  // 「本を追加」ボタンからのエントリポイント。
  // プロフィール未設定のときは、先にプロフィール設定へ回して、
  // 保存が終わったら自動で AddBookDialog を開き直す。
  const handleOpenAddBook = () => {
    if (!profile) {
      setPendingAddBook(true);
      setProfileDialogOpen(true);
      return;
    }
    setAddBookOpen(true);
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
      supabase.from("profiles_public").select("*"),
    ]);

    // books と rooms はコア。どちらか落ちたら中断。
    if (booksRes.error || roomsRes.error) {
      console.error(booksRes.error ?? roomsRes.error);
      if (!options.silent) setLoading(false);
      return;
    }

    // traces と profiles は落ちていても [] で続行する。
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
      if (msgRes.error) {
        console.error(msgRes.error);
        if (!options.silent) setLoading(false);
        return;
      }
      messagesData = msgRes.data ?? [];
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

  // 初回フルロード + ページ遷移時のサイレント再取得
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      loadAll();
    } else {
      loadAll({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Realtime: 変更があったらサイレント再取得
  useEffect(() => {
    const channel = supabase
      .channel(`global-changes-${Math.random().toString(36).slice(2, 8)}`)
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

  // タブが可視になった瞬間に再同期
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

  // Polling fallback: Realtime が届かなかった場合の保険。
  // タブがアクティブな間だけ動くので負荷は最小限。
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAll({ silent: true });
      }
    }, 5_000);
    return () => clearInterval(id);
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

  // 自分が書き込んでいて、最終閲覧以降に更新のある未期限切れの部屋
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

  // 24時間以内に開始する自分の予約があるか
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

  // 部屋に入った瞬間に last-seen を更新
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

  // お問い合わせ送信。成功したらダイアログがサンキュー表示に切り替わる。
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

  // 本を追加するときは、必ず「最初の部屋」と「最初の投稿」まで一緒に作る。
  // 本だけが増えて会話の入口が無い状態を作らないための方針。
  const createBook = async (payload: {
    title: string;
    author: string;
    firstMessage: string;
  }) => {
    if (!profile) {
      alert("本を追加するには、先に名前を設定してください。");
      setPendingAddBook(true);
      setAddBookOpen(false);
      setProfileDialogOpen(true);
      return;
    }

    const baseId = slugifyTitle(payload.title);
    const nextId = baseId || `book-${Date.now()}`;

    if (books.some((b) => b.id === nextId)) {
      alert(
        "同じIDになりそうな本がすでにあります。タイトルを少し変えて追加してください。",
      );
      return;
    }

    // 1. 本を追加 (追加者の名前もここで保存する)
    const { error: bookError } = await supabase.from("books").insert({
      id: nextId,
      title: payload.title,
      author: payload.author || null,
      description: null,
      created_by_name: profile.name,
    });
    if (bookError) {
      console.error(bookError);
      alert("本の追加に失敗しました");
      return;
    }

    // 2. 最初の部屋を自動作成 (ふらっと歓迎 / 読了者向け / 7 日)
    const DEFAULT_DURATION_HOURS = 168;
    const expiresAt = new Date(
      Date.now() + DEFAULT_DURATION_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: insertedRoom, error: roomError } = await supabase
      .from("rooms")
      .insert({
        book_id: nextId,
        title: "最初のことば",
        entry_type: "welcome",
        spoiler: "read",
        active_users: 1,
        expires_at: expiresAt,
        scheduled_start_at: null,
        created_by_profile_id: myProfileId,
      })
      .select()
      .single();

    if (roomError || !insertedRoom) {
      console.error(roomError);
      alert(
        "本は追加できましたが、部屋の自動作成に失敗しました。本のページから部屋を作ってください。",
      );
      setAddBookOpen(false);
      await loadAll({ silent: true });
      setPage({ type: "book", bookId: nextId });
      return;
    }

    // 3. 最初の投稿を入れる
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
      // 投稿に失敗しても本と部屋はできているので、部屋に連れていって続行。
    }

    setAddBookOpen(false);
    await loadAll({ silent: true });
    setPage({ type: "room", bookId: nextId, roomId: insertedRoom.id });
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

    // 作成者を最初の予約者として自動登録
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

// A1: messages 直接 INSERT を send_message_as_owner RPC に置換。
    // user_name / user_color はクライアントから渡さず、サーバ側 (07 RPC) で
    // profiles から snapshot 取得する (= なりすまし防止)。
    if (myProfileId === null || !localBrowserToken) {
      alert("プロフィールが未設定です");
      return;
    }

    const { error } = await supabase.rpc("send_message_as_owner", {
      p_profile_id: myProfileId,
      p_browser_token: localBrowserToken,
      p_passphrase: profile?.passphrase ?? null,
      p_room_id: currentRoom.id,
      p_body: text,
    });

    if (error) {
      console.error(error);
      alert("投稿に失敗しました");
      return;
    }
  };

  // 作成者本人のみ削除可能。RPC 経由で DB 側が二重チェックする。
  // β方針: 合言葉はローカルプロフィールから自動で渡す(UI 入力なし)。
  const deleteRoom = async (roomId: number) => {
   if (myProfileId === null || !localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }

    const { error } = await supabase.rpc("delete_room_as_creator", {
      p_room_id: roomId,
      p_profile_id: myProfileId,
      p_browser_token: localBrowserToken,
      p_passphrase: profile?.passphrase ?? null,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("not_room_creator")) {
        alert("この部屋はあなたが作成したものではありません。");
      } else if (msg.includes("invalid_passphrase")) {
        alert(
          "合言葉が一致しません。プロフィールの合言葉を見直して保存し直してください。",
        );
      } else if (msg.includes("room_not_found")) {
        alert("部屋が見つかりません。一覧を更新します。");
      } else {
        alert(`削除に失敗しました: ${msg}`);
      }
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

// R4: extendRoom を extend_room_as_creator RPC に置換 (= 30 日固定)。
  // 06 RPC は expires_at = now() + interval '30 days' にリセットする。
  // クライアントでの時間計算は不要。引数なし。
  const extendRoom = async () => {
    if (!currentRoom) return;
    if (myProfileId === null || !localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }
    const { error } = await supabase.rpc("extend_room_as_creator", {
      p_room_id: currentRoom.id,
      p_profile_id: myProfileId,
      p_browser_token: localBrowserToken,
      p_passphrase: profile?.passphrase ?? null,
    });
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
          onOpenAddBook={handleOpenAddBook}
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
            profiles={profiles}
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
        initialFavoriteBookId={profile?.favoriteBookId ?? null}
        initialFavoriteNote={profile?.favoriteNote ?? null}
        initialPassphrase={profile?.passphrase ?? null}
        books={books}
        onSave={saveProfile}
        onClose={() => {
          setProfileDialogOpen(false);
          setPendingEntry(null);
        }}
        onRequestAddBook={() => setAddBookOpen(true)}
      />
    </>
  );
}
