"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Book, UserProfile } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AddBookDialog from "@/components/dialogs/AddBookDialog";
import NameSetupDialog from "@/components/dialogs/NameSetupDialog";

// /books 本棚をのぞく — 第1段階。
// 役割: 検索 + 全件一覧 + 本追加。
// app/page.tsx と state は共有しない (= 多少の重複は許容、共通化しすぎない方針)。
export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [localBrowserToken, setLocalBrowserToken] = useState<string | null>(
    null,
  );
  const [myProfileId, setMyProfileId] = useState<number | null>(null);

  const [addBookOpen, setAddBookOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [pendingAddBook, setPendingAddBook] = useState(false);

  // localStorage から profile / browser_token を読む。token は無ければ生成。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedProfile = window.localStorage.getItem("book-room-profile");
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch {
        /* ignore */
      }
    }
    const savedToken = window.localStorage.getItem("book-room-browser-token");
    if (savedToken) {
      setLocalBrowserToken(savedToken);
    } else if (typeof crypto !== "undefined") {
      const newToken = crypto.randomUUID();
      window.localStorage.setItem("book-room-browser-token", newToken);
      setLocalBrowserToken(newToken);
    }
  }, []);

  // books 一覧取得 (= rooms / traces は /books では不要なので空で埋める)
  const loadBooks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("title", { ascending: true });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const merged: Book[] = (
      (data ?? []) as Omit<Book, "rooms" | "traces">[]
    ).map((b) => ({
      ...b,
      rooms: [],
      traces: [],
    }));
    );
    setBooks(merged);
    setLoading(false);
  };
  useEffect(() => {
    loadBooks();
  }, []);

  // 検索フィルタ (= TopPage と同じロジック)
  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author ?? "").toLowerCase().includes(q),
    );
  }, [books, query]);

  // myProfileId を遅延解決 (= 本追加時のみ必要)
  // app/page.tsx の useEffect ベース解決を /books では呼び出し時のみに限定して縮約
  const ensureMyProfileId = async (): Promise<number | null> => {
    if (myProfileId !== null) return myProfileId;
    if (!profile || !localBrowserToken) return null;

    const { data: rows } = await supabase.rpc("get_my_profile", {
      p_browser_token: localBrowserToken,
    });
    const row = (rows as Array<{ id: number }> | null)?.[0];
    if (row) {
      setMyProfileId(row.id);
      return row.id;
    }

    const { data: createdId } = await supabase.rpc("create_profile", {
      p_name: profile.name,
      p_color: profile.color,
      p_browser_token: localBrowserToken,
      p_passphrase: profile.passphrase ?? null,
    });
    if (typeof createdId === "number") {
      setMyProfileId(createdId);
      return createdId;
    }
    return null;
  };

  // 本追加ボタン (= app/page.tsx の handleOpenAddBook と同じ流れ)
  const handleOpenAddBook = () => {
    if (!profile) {
      setPendingAddBook(true);
      setProfileDialogOpen(true);
      return;
    }
    setAddBookOpen(true);
  };

  // 本追加実行 (= app/page.tsx の createBook と同じ流れ + lazy myProfileId)
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
    if (!localBrowserToken) {
      alert("プロフィールが未設定です。");
      return;
    }
    const profileId = await ensureMyProfileId();
    if (profileId === null) {
      alert("プロフィールが未設定です。");
      return;
    }

    const { data: created, error: createError } = await supabase
      .rpc("create_book_with_initial_room", {
        p_profile_id: profileId,
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

    const result = created as {
      book_id: string;
      room_id: number;
      message_id: number | null;
    };

    setAddBookOpen(false);
    // 作成された部屋に直接遷移 (= /books は別ページなので full navigation)
    window.location.href = `/b/${result.book_id}/r/${result.room_id}`;
  };

  // プロフィール保存 (= NameSetupDialog onSave)
  const saveProfile = (next: UserProfile) => {
    setProfile(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("book-room-profile", JSON.stringify(next));
    }
    setProfileDialogOpen(false);
    if (pendingAddBook) {
      setAddBookOpen(true);
      setPendingAddBook(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm hover:bg-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            戻る
          </Link>
        </div>

        <h1 className="text-3xl font-semibold">本棚をのぞく</h1>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
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
            onClick={handleOpenAddBook}
          >
            <Plus className="mr-2 h-4 w-4" />
            本を追加
          </Button>
        </div>

        {loading ? (
          <div className="mt-8 text-sm text-neutral-500">読み込み中...</div>
        ) : filteredBooks.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
            該当する本がありません。
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBooks.map((book) => (
              <Link key={book.id} href={`/b/${book.id}`} className="block">
                <Card className="rounded-3xl shadow-sm hover:bg-neutral-50">
                  <CardHeader className="space-y-2 pl-5">
                    <CardTitle className="text-xl leading-7">
                      <span>{book.title}</span>
                    </CardTitle>
                    <div className="text-sm text-neutral-500">
                      {book.author}
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-neutral-500">
                    この本のページへ
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <AddBookDialog
        open={addBookOpen}
        onOpenChange={setAddBookOpen}
        onCreate={createBook}
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
          setPendingAddBook(false);
        }}
        onRequestAddBook={() => setAddBookOpen(true)}
      />
    </div>
  );
}
