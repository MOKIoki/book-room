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
　const [isAdmin, setIsAdmin] = useState(false);
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

// P1: get_my_profile (id + 公開列 5 個) を 1 RPC 呼び出しに統一。
      //   従来: get_my_profile_id + profiles 直 SELECT (= 2 段、direct SELECT 残存)
      //   現在: get_my_profile 1 回 (= direct SELECT なし)
      // 注: passphrase は返ってこないため、change detection (Step 4) は
      // foundViaToken を使った別ロジックで吸収する (28b 参照)。
      if (localBrowserToken) {
        const { data: rows } = await supabase.rpc("get_my_profile", {
          p_browser_token: localBrowserToken,
        });
        const row = (
          rows as
            | Array<{
                id: number;
                color: string;
                favorite_book_id: string | null;
                favorite_note: string | null;
              }>
            | null
        )?.[0];
        if (row) {
          existing = {
            id: row.id,
            color: row.color,
            favorite_book_id: row.favorite_book_id,
            favorite_note: row.favorite_note,
            passphrase: null, // get_my_profile は passphrase を返さない
          };
        }
      }

      if (existing) {
        setMyProfileId(existing.id);
        const nextColor = profile.color;
        const nextFavBook = profile.favoriteBookId ?? null;
        const nextFavNote = profile.favoriteNote ?? null;
        const nextPassphrase = profile.passphrase ?? null;
// P2/P3 削除後: token 経路のみ。常に RPC で UPDATE (idempotent)。
        const { error: updateError } = await supabase.rpc(
          "update_profile_as_owner",
          {
            p_profile_id: existing.id,
            p_browser_token: localBrowserToken,
            p_passphrase: null,
            p_new_name: profile.name,
            p_new_color: nextColor,
            p_new_favorite_book_id: nextFavBook,
            p_new_favorite_note: nextFavNote,
            p_new_passphrase: nextPassphrase ?? "",
          },
        );
        if (updateError) {
          console.error("update_profile_as_owner failed:", updateError);
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
// admin 判定: am_i_admin RPC で確認、UI 表示制御用
  // 実行時の権限ゲートは hide/unhide_room_by_admin 内部で別途行われる
  useEffect(() => {
    if (!localBrowserToken) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("am_i_admin", {
        p_browser_token: localBrowserToken,
      });
      setIsAdmin(data === true);
    })();
  }, [localBrowserToken]);
  
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
  // X1: 既存 profile を name + passphrase で引き継ぐ
  const handleClaim = async (name: string, passphrase: string) => {
    if (!localBrowserToken) {
      alert("ブラウザの認証 token が未設定です。");
      return;
    }

    const { data: claimedId, error: claimError } = await supabase.rpc(
      "claim_legacy_profile_by_name",
      {
        p_name: name,
        p_passphrase: passphrase,
        p_new_token: localBrowserToken,
      },
    );

    if (claimError) {
      const msg = claimError.message ?? "";
      if (msg.includes("profile_not_found") || msg.includes("name_mismatch")) {
        alert("その名前のプロフィールは見つかりません");
      } else if (msg.includes("invalid_passphrase")) {
        alert("合言葉が一致しません");
      } else if (msg.includes("profile_already_claimed")) {
        alert("このプロフィールは既に他のブラウザで引き継ぎ済みです");
      } else if (msg.includes("browser_already_has_profile")) {
        alert(
          "このブラウザは既に別のプロフィールを持っています。一度プロフィールをクリアしてからお試しください",
        );
      } else if (msg.includes("multiple_legacy_profiles_found")) {
        alert("同名のプロフィールが複数あります。お問い合わせください");
      } else {
        alert(`引き継ぎに失敗しました: ${msg}`);
      }
      return;
    }

    if (typeof claimedId !== "number") return;

    // claim 成功 → get_my_profile で公開列を取得して localStorage / state に反映
    const { data: rows } = await supabase.rpc("get_my_profile", {
      p_browser_token: localBrowserToken,
    });
    const row = (
      rows as Array<{
        id: number;
        name: string;
        color: string;
        favorite_book_id: string | null;
        favorite_note: string | null;
      }> | null
    )?.[0];

    if (!row) {
      alert(
        "引き継ぎは成功しましたが、プロフィール取得に失敗しました。リロードしてください。",
      );
      return;
    }

    const claimedProfile: UserProfile = {
      name: row.name,
      color: row.color,
      favoriteBookId: row.favorite_book_id,
      favoriteNote: row.favorite_note,
      passphrase: passphrase || null,
    };

    setMyProfileId(row.id);
    setProfile(claimedProfile);
    localStorage.setItem("book-room-profile", JSON.stringify(claimedProfile));
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
// 一般ユーザーには hidden_at が立った部屋を見せない。admin は全部見える。
  const visibleBooks = useMemo(
    () =>
      isAdmin
        ? books
        : books.map((b) => ({
            ...b,
            rooms: b.rooms.filter((r) => !r.hidden_at),
          })),
    [books, isAdmin],
  );
const recentHeats = useMemo(() => {
    const heats = visibleBooks.flatMap((book) =>
      book.traces.map((trace) => ({
        bookId: book.id,
        bookTitle: book.title,
        body: trace.body,
        roomTitle: trace.room_title ?? null,
        roomId: trace.room_id ?? null,
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
// C1: contacts 直接 INSERT を send_contact_as_anon RPC に置換。
    // 認証不要 RPC (anon でも呼べる)。空文字 / 5000 字超 / 100 字超 を弾く。
    const { error } = await supabase.rpc("send_contact_as_anon", {
      p_body: body,
      p_from_name: profile?.name ?? null,
    });
    if (error) {
      console.error("contacts:", error);
      const msg = error.message ?? "";
      if (msg.includes("body_required")) {
        alert("本文を入力してください。");
      } else if (msg.includes("body_too_long")) {
        alert("本文が長すぎます (5000 字以内)。");
      } else if (msg.includes("from_name_too_long")) {
        alert("お名前が長すぎます (100 字以内)。");
      } else {
        alert(
          "送信に失敗しました。お手数ですが別の方法で教えてください。",
        );
      }
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

// B1: books + welcome 部屋 + 最初のメッセージを 1 RPC で atomic 作成。
    //   旧: client が slug から id 計算 + 3 INSERT (途中失敗のリスクあり)
    //   新: 05 RPC が books.id を gen_random_uuid()::text で生成 + 1 トランザクションで 3 件作成
    //       → URL の book id は uuid 形式に変わる (= UX 変更)。
    //       → slugifyTitle / nextId / 重複 check は不要 (uuid 衝突は事実上 0)。
    if (myProfileId === null || !localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }

    const { data: created, error: createError } = await supabase
      .rpc("create_book_with_initial_room", {
        p_profile_id: myProfileId,
        p_browser_token: localBrowserToken,
        p_passphrase: profile?.passphrase ?? null,
        p_title: payload.title,
        p_author: payload.author || null,
        p_first_message_body: payload.firstMessage || null,
      })
      .single();

if (createError || !created) {
      console.error(createError);
      alert("本の追加に失敗しました");
      return;
    }

    // .rpc() の返り値型は {} に推論されるため、05 RPC の TABLE shape にキャスト。
    const result = created as {
      book_id: string;
      room_id: number;
      message_id: number | null;
    };

    setAddBookOpen(false);
    await loadAll({ silent: true });
    setPage({
      type: "room",
      bookId: result.book_id,
      roomId: result.room_id,
    });
  };

const createRoom = async (payload: {
    title: string;
    spoiler: "none" | "progress" | "read";
    durationHours: number;
    firstMessage: string;
    scheduledStartAt: string | null;
  }) => {
    if (!currentBook) return;
    if (myProfileId === null || !localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }

   // R1 fix: 新 vocab 3 値 (welcome/discussion/reservation) では
    // 「予約読書会か否か」は scheduled_start_at の有無で判定する。
    //   scheduledStartAt あり → reservation (= 予約読書会)
    //   scheduledStartAt なし → discussion (= 議論部屋)
    // dialog 側の "飛び込みOK"/"承認制" (open/approval) の区別は
    // 新 vocab には存在しない (= 'approval' は実データ 0 件、UI 上の参加方式は
    // welcome 以外では区別なくなる)。
    // この区別を残したい場合は X2 (UI vocab 統一) で再設計する。
    const newEntryType: "discussion" | "reservation" = payload.scheduledStartAt
      ? "reservation"
      : "discussion";
    // 06 RPC は p_writable_days integer (1〜30) を要求する。
    // 旧 durationHours から日数に変換 (切り上げ + clamp)。
    // 注意: 予約読書会では「開始時刻基準」→「now() 基準」に意味が変わる。
    // 11_pre_checklist の「予約読書会 expires_at UX」課題を参照。
    const writableDays = Math.max(
      1,
      Math.min(30, Math.ceil(payload.durationHours / 24)),
    );

    // (1) 部屋作成
    const { data: createdRoomId, error: roomError } = await supabase.rpc(
      "create_room_for_book",
      {
        p_profile_id: myProfileId,
        p_browser_token: localBrowserToken,
        p_passphrase: profile?.passphrase ?? null,
        p_book_id: currentBook.id,
        p_title: payload.title,
        p_entry_type: newEntryType,
        p_spoiler: payload.spoiler,
        p_scheduled_start_at: payload.scheduledStartAt,
        p_writable_days: writableDays,
      },
    );

    if (roomError || typeof createdRoomId !== "number") {
      console.error(roomError);
      alert("部屋の作成に失敗しました");
      return;
    }

    // (2) 予約読書会なら作成者を最初の予約者として自動登録
    //   scheduledStartAt が set の場合 = entry_type='reservation' の前提。
    //   09 RPC 側で entry_type / 開始前 / 受付中 を再検証する。
    if (payload.scheduledStartAt) {
      const { error: resvError } = await supabase.rpc(
        "create_reservation_as_owner",
        {
          p_profile_id: myProfileId,
          p_browser_token: localBrowserToken,
          p_passphrase: profile?.passphrase ?? null,
          p_room_id: createdRoomId,
        },
      );
      if (resvError) console.error("auto reservation failed:", resvError);
    }

    // (3) 最初のメッセージ
    if (payload.firstMessage) {
      const { error: messageError } = await supabase.rpc(
        "send_message_as_owner",
        {
          p_profile_id: myProfileId,
          p_browser_token: localBrowserToken,
          p_passphrase: profile?.passphrase ?? null,
          p_room_id: createdRoomId,
          p_body: payload.firstMessage,
        },
      );
      if (messageError) console.error("first message failed:", messageError);
    }

    setCreateOpen(false);
    await loadAll({ silent: true });
    setPage({ type: "room", bookId: currentBook.id, roomId: createdRoomId });
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
    const hideRoom = async (roomId: number) => {
    if (myProfileId === null || !localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }
    const { error } = await supabase.rpc("hide_room_by_admin", {
      p_room_id: roomId,
      p_admin_profile_id: myProfileId,
      p_admin_browser_token: localBrowserToken,
      p_admin_passphrase: profile?.passphrase ?? null,
    });
    if (error) {
      alert(`非表示にできませんでした: ${error.message}`);
      return;
    }
    alert("この部屋を非表示にしました。");
    await loadAll({ silent: true });
  };

  const unhideRoom = async (roomId: number) => {
    if (myProfileId === null || !localBrowserToken) return;
    const { error } = await supabase.rpc("unhide_room_by_admin", {
      p_room_id: roomId,
      p_admin_profile_id: myProfileId,
      p_admin_browser_token: localBrowserToken,
      p_admin_passphrase: profile?.passphrase ?? null,
    });
    if (error) {
      alert(`表示に戻せませんでした: ${error.message}`);
      return;
    }
    alert("この部屋を表示に戻しました。");
    await loadAll({ silent: true });
  };
  x

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
    if (!localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }
    const { error } = await supabase.rpc("create_reservation_as_owner", {
      p_profile_id: myProfileId,
      p_browser_token: localBrowserToken,
      p_passphrase: profile?.passphrase ?? null,
      p_room_id: currentRoom.id,
    });
    if (error) {
      console.error(error);
      alert(`予約できませんでした: ${error.message}`);
    }
  };

const cancelReservation = async () => {
    if (!currentRoom || !myProfileId) return;
    if (!localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }
    const { error } = await supabase.rpc("cancel_reservation_as_owner", {
      p_room_id: currentRoom.id,
      p_profile_id: myProfileId,
      p_browser_token: localBrowserToken,
      p_passphrase: profile?.passphrase ?? null,
    });
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
    if (myProfileId === null || !localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }
    // T1: book_traces 直接 INSERT を create_trace_as_owner RPC に置換。
    // 注: room_title / created_by_name はクライアントから渡さず、サーバ側
    // (08 RPC) で room.title / profiles.name を snapshot 取得する。
    // 08 RPC は以下を強制する (= UI 側でも活性条件を絞るのが理想):
    //   - room.entry_type != 'welcome'
    //   - room.expires_at IS NOT NULL AND now() >= expires_at (= 受付終了済み)
    //   - room.created_by_profile_id == p_profile_id (= 部屋作成者本人)
    //   - 1 部屋 1 trace (UNIQUE)
    const { error } = await supabase.rpc("create_trace_as_owner", {
      p_profile_id: myProfileId,
      p_browser_token: localBrowserToken,
      p_passphrase: profile?.passphrase ?? null,
      p_book_id: currentBook.id,
      p_room_id: currentRoom.id,
      p_body: body,
    });
    if (error) {
      console.error(error);
      alert("置き手紙の保存に失敗しました");
    }
  };
  const reportRoom = async (body: string) => {
    if (!currentRoom) return;
    const { error } = await supabase.rpc("report_room_as_anon", {
      p_room_id: currentRoom.id,
      p_body: body || null,
      p_from_name: profile?.name ?? null,
    });
    if (error) {
      console.error(error);
      alert("送信に失敗しました。");
      return;
    }
    alert("ご報告ありがとうございます。確認します。");
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

{/* 閉室後: 作成者は RoomPage (= 置き手紙導線あり)、それ以外は ExpiredRoomPage */}
      {page.type === "room" &&
        currentBook &&
        currentRoom &&
        currentRoomExpired &&
        currentRoom.created_by_profile_id !== myProfileId && (
          <ExpiredRoomPage
            onBack={() => setPage({ type: "book", bookId: currentBook.id })}
          />
        )}

      {page.type === "room" &&
        currentBook &&
        currentRoom &&
        (!currentRoomExpired ||
          currentRoom.created_by_profile_id === myProfileId) && (
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
            onReport={reportRoom} 
            isAdmin={isAdmin}
　　　　　　　onHideRoom={hideRoom}
　　　　　　　onUnhideRoom={unhideRoom}
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
        onClaim={handleClaim}
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
