"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Book, ProfileRecord, UserProfile, Room } from "@/lib/types";
import { Search, BookOpen, MessageSquare, Lock, DoorOpen, Mail } from "lucide-react";
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
  open: { label: "ふらっと歓迎", icon: DoorOpen },
  approval: { label: "少人数向け", icon: Lock },
  discussion: { label: "ふらっと歓迎", icon: DoorOpen },   // R1: 'open' の正式名
  reservation: { label: "少人数向け", icon: Lock },        // R1: 'approval' の正式名
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

function getColorStyle(color?: string | null) {
  return colorOptions.find((c) => c.value === color) ?? colorOptions[0];
}

function isRoomExpired(room: Room) {
  if (!room.expires_at) return false;
  return new Date(room.expires_at).getTime() <= Date.now();
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

function useNow(intervalMs: number = 60_000) {
  const [, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

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

type RecentHeat = {
  bookId: string;
  bookTitle: string;
  body: string;
  roomTitle: string | null;
  createdAt: string;
};

type TopPageProps = {
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
  recentHeats: RecentHeat[];
  unreadCount: number;
  hasReminder: boolean;
};

export default function TopPage({
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
}: TopPageProps) {
  useNow();

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

  const filteredBooks = useMemo(
    () =>
      [...books]
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
        }),
    [books, query],
  );

  const activeRooms = useMemo(
    () =>
      books
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
        ),
    [books],
  );

  const visibleHeats = showAllHeats ? recentHeats : recentHeats.slice(0, 2);

  const favoriteProfiles = useMemo(
    () =>
      profiles
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
      }[],
    [profiles, books],
  );

  const visibleFavorites = showAllFavorites
    ? favoriteProfiles
    : favoriteProfiles.slice(0, 2);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-neutral-50 text-neutral-900">
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
                同じ本を読んだ人と、少し話せる「book-room」。
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
                    <div className="text-sm text-neutral-500">{room.bookTitle}</div>
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

        <div className="mt-6 grid gap-6 lg:grid-cols-1 sm:grid-cols-2">
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
                    <div className="text-sm text-neutral-500">{heat.bookTitle}</div>
                    <div className="mt-1 text-base font-medium">{heat.body}</div>
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
                      <div className="mt-3 text-xl font-semibold">{item.bookTitle}</div>
                      <div className="text-sm text-neutral-500">{item.bookAuthor}</div>
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
           <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book) => {
                const activeCount = book.rooms.filter((r) => !isRoomExpired(r)).length;
                return (
                  <Card key={book.id} className="rounded-3xl shadow-sm">
                    <CardHeader className="space-y-2 pl-5">
                      <CardTitle className="flex min-w-0 items-center gap-2 text-xl leading-7">
                      <span className="break-words">{book.title}</span>
                       {isBookNew(book) && <NewMark />}
                      </CardTitle>
                      <div className="text-sm text-neutral-500">{book.author}</div>
                    </CardHeader>

                   <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
  <div className="mb-3 font-medium text-neutral-900">この場所について</div>
<div className="max-w-3xl space-y-2 text-sm leading-7 text-neutral-600">
  <p>
    　book-room は、本を読み終えたあとに残った感想やモヤモヤを、少しだけ置いていける場所です。　　　　　　　
    　ひとりで閉じるには惜しい、あなたの読後の言葉を、本ごとの部屋や置き手紙として残しませんか。
  </p>
  <p>
    運営者自身も、読後に誰かと少しだけ話したくなることがあり、この場所を作りました。
    投稿内容や不具合の連絡には、必要に応じて確認・対応します。
  </p>
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
