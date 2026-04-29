"use client";

import React from "react";
import {
  ArrowLeft,
  MessageSquare,
  Plus,
  Clock3,
  Lock,
  DoorOpen,
  ChevronDown,
} from "lucide-react";
import type { Book, Room, BookTrace, UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MAX_ACTIVE_ROOMS_PER_BOOK = 6;
const NEW_WINDOW_HOURS = 12;
const RESERVATION_CAPACITY = 5;

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
  discussion: { label: "ふらっと歓迎", icon: DoorOpen },
  reservation: { label: "少人数向け", icon: Lock },
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

function isRecentTrace(trace: BookTrace) {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(trace.created_at).getTime() <= THIRTY_DAYS_MS;
}

function isNewItem(value?: string | null) {
  if (!value) return false;
  const ms = Date.now() - new Date(value).getTime();
  return ms <= NEW_WINDOW_HOURS * 60 * 60 * 1000;
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

function useNow(intervalMs: number = 60_000) {
  const [, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
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
  const config = entryMap[room.entry_type as keyof typeof entryMap] ?? entryMap.welcome;
  const EntryIcon = config.icon;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" className="gap-1 rounded-full">
        <EntryIcon className="h-3 w-3" />
        {config.label}
      </Badge>
      <Badge
        variant={spoilerMap[room.spoiler]?.variant ?? "outline"}
        className="rounded-full"
      >
        {spoilerMap[room.spoiler]?.label ?? room.spoiler}
      </Badge>
    </div>
  );
}

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

type BookPageProps = {
  book: Book;
  onBack: () => void;
  onEnterRoom: (roomId: number) => void;
  onCreateRoom: () => void;
  onEditBook: () => void; // 後方互換のため残す (= 現状未使用、本ページ構造整理で本を編集ボタン非表示)
  currentProfile: UserProfile | null;
  onOpenProfileSetting: () => void;
  onOpenMobileMenu: () => void;
};

export default function BookPage({
  book,
  onBack,
  onEnterRoom,
  onCreateRoom,
  currentProfile,
  onOpenProfileSetting,
  onOpenMobileMenu,
}: BookPageProps) {
  useNow();
  const [closedExpanded, setClosedExpanded] = React.useState(false);
  const [showAllTraces, setShowAllTraces] = React.useState(false);

  // welcome 部屋 (= 上部固定、本ごとに 1 件想定)
  const welcomeRoom = book.rooms.find((r) => r.entry_type === "welcome");

  // 話題の部屋 = welcome 以外で受付中
  const activeRooms = book.rooms
    .filter((r) => r.entry_type !== "welcome")
    .filter((r) => !isRoomExpired(r))
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  // 閉じた部屋 = welcome 以外で期限切れ
  const closedRooms = book.rooms
    .filter((r) => r.entry_type !== "welcome")
    .filter((r) => isRoomExpired(r))
    .sort((a, b) => {
      const av = a.expires_at ? new Date(a.expires_at).getTime() : 0;
      const bv = b.expires_at ? new Date(b.expires_at).getTime() : 0;
      return bv - av;
    });

  // 置き手紙: 30 日以内 + 元 room が閉じている (or 不明) もの、最新 4 件
  const recentTraces = [...book.traces]
    .filter(isRecentTrace)
    .filter((trace) => {
      if (!trace.room_id) return true;
      const sourceRoom = book.rooms.find((r) => r.id === trace.room_id);
      if (!sourceRoom) return true;
      return isRoomExpired(sourceRoom);
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 4);

  const roomLimitReached = activeRooms.length >= MAX_ACTIVE_ROOMS_PER_BOOK;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* 戻る + プロフィール */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="ghost" className="rounded-2xl" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>
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

        {/* 本ヘッダー (= 控えめ。タイトル小さめ、shadow 弱め、編集ボタン無し) */}
        <div className="mb-8">
          {book.author && (
            <div className="text-sm text-neutral-500">{book.author}</div>
          )}
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold leading-7 sm:text-2xl">
            <span>{book.title}</span>
            {isNewItem(book.updated_at) && <NewMark />}
          </h1>
          {book.description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
              {book.description}
            </p>
          )}
          {book.created_by_name && (
            <div className="mt-2 text-xs text-neutral-500">
              追加: {book.created_by_name}
            </div>
          )}
        </div>

        {/* この本の入口 (= welcome 部屋、上部固定) */}
        {welcomeRoom && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-neutral-500">
              この本の入口
            </h2>
            <button
              type="button"
              onClick={() => onEnterRoom(welcomeRoom.id)}
              className="block w-full rounded-3xl border border-sky-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-300"
            >
              <div className="flex items-center gap-2 text-lg font-medium">
                <DoorOpen className="h-5 w-5 text-sky-700" />
                <span>{welcomeRoom.title}</span>
                {isNewItem(welcomeRoom.updated_at) && <NewMark />}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="rounded-full">
                  この本の入口
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  期限なし
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {spoilerMap[welcomeRoom.spoiler]?.label ?? welcomeRoom.spoiler}
                </Badge>
              </div>
              <div className="mt-3 text-sm text-neutral-500">
                投稿 {welcomeRoom.messages?.length ?? 0} 件 ・{" "}
                {formatRelativeTime(welcomeRoom.updated_at)}
              </div>
            </button>
          </section>
        )}

        {/* 語らいの置き手紙 (= 0 件なら非表示。初期 2 件、3 件以上で「ほかを見る」) */}
        {recentTraces.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-neutral-500">
              語らいの置き手紙
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(showAllTraces ? recentTraces : recentTraces.slice(0, 2)).map(
                (trace) => (
                  <button
                    key={trace.id}
                    type="button"
                    onClick={() => {
                      if (trace.room_id) onEnterRoom(trace.room_id);
                    }}
                    className="block rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left transition hover:border-amber-200"
                  >
                    <div className="text-sm leading-6 text-neutral-800">
                      「{trace.body}」
                    </div>
                    <div className="mt-2 text-xs text-neutral-500">
                      — {trace.created_by_name ?? "匿名"}
                      {trace.room_title ? ` ・「${trace.room_title}」より` : ""}
                    </div>
                  </button>
                ),
              )}
            </div>
            {recentTraces.length > 2 && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllTraces((v) => !v)}
                  className="text-xs text-neutral-500 underline transition hover:text-neutral-700"
                >
                  {showAllTraces
                    ? "閉じる"
                    : `ほかを見る (残り ${recentTraces.length - 2} 件)`}
                </button>
              </div>
            )}
          </section>
        )}

        {/* 話題の部屋 (= 受付中の通常部屋) */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-500">
              話題の部屋
              {activeRooms.length > 0 && (
                <span className="ml-2 text-xs text-neutral-400">
                  {activeRooms.length}/{MAX_ACTIVE_ROOMS_PER_BOOK}
                </span>
              )}
            </h2>
            <Button
              size="sm"
              className="gap-1 rounded-2xl"
              onClick={onCreateRoom}
              disabled={roomLimitReached}
            >
              <Plus className="h-3 w-3" />
              新しい部屋
            </Button>
          </div>

          {roomLimitReached && (
            <div className="mb-3 text-xs text-neutral-500">
              この本の部屋は現在上限です。既存の部屋に参加するか、終了を待ってください。
            </div>
          )}

          {activeRooms.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                <MessageSquare className="h-5 w-5 text-neutral-500" />
              </div>
              <div className="mb-3 text-sm font-medium">
                この本について、話題を広げる部屋を作ってみませんか
              </div>
              <Button size="sm" className="rounded-2xl" onClick={onCreateRoom}>
                この本で話題を作る
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeRooms.map((room) => {
                const scheduledMs = room.scheduled_start_at
                  ? new Date(room.scheduled_start_at).getTime()
                  : null;
                const isScheduled =
                  scheduledMs !== null && scheduledMs > Date.now();
                return (
                  <div
                    key={room.id}
                    className={`rounded-3xl border p-5 ${
                      isScheduled
                        ? "border-sky-200 bg-sky-50/40"
                        : "border-neutral-200 bg-white"
                    }`}
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
                          <span className="w-full text-xs text-sky-700/90">
                            予約した人が優先ですが、空きがあれば予約なしでも参加できます。
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
              })}
            </div>
          )}
        </section>

        {/* 閉じた部屋 (= 0 件なら非表示、デフォルト折りたたみ) */}
        {closedRooms.length > 0 && (
          <section className="mb-8">
            <button
              type="button"
              onClick={() => setClosedExpanded((v) => !v)}
              className="flex items-center gap-2 text-sm text-neutral-500 transition hover:text-neutral-700"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${
                  closedExpanded ? "rotate-180" : ""
                }`}
              />
              閉じた部屋を表示 ({closedRooms.length})
            </button>
            {closedExpanded && (
              <div className="mt-3 space-y-2">
                {closedRooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onEnterRoom(room.id)}
                    className="block w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left opacity-80 transition hover:opacity-100"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>{room.title}</span>
                      <Badge variant="outline" className="rounded-full text-xs">
                        終了済み
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      投稿 {room.messages?.length ?? 0}件
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
