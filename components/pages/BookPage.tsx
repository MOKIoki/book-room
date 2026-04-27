"use client";

import React from "react";
import {
  ArrowLeft,
  MessageSquare,
  Plus,
  Clock3,
  Lock,
  DoorOpen,
} from "lucide-react";
import type { Book, Room, BookTrace, UserProfile } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  discussion: { label: "ふらっと歓迎", icon: DoorOpen },   // R1: 'open' の正式名
  reservation: { label: "少人数向け", icon: Lock },        // R1: 'approval' の正式名
} as const;

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

function getActiveRooms(rooms: Room[]) {
  return rooms.filter((room) => !isRoomExpired(room));
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
  onEditBook: () => void;
  currentProfile: UserProfile | null;
  onOpenProfileSetting: () => void;
  onOpenMobileMenu: () => void;
};

export default function BookPage({
  book,
  onBack,
  onEnterRoom,
  onCreateRoom,
  onEditBook,
  currentProfile,
  onOpenProfileSetting,
  onOpenMobileMenu,
}: BookPageProps) {
  useNow();

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
                {isNewItem(book.updated_at) && <NewMark />}
              </CardTitle>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={onEditBook}
              >
                本を編集
              </Button>
            </div>

            {book.description && (
              <CardDescription className="max-w-3xl pt-2 text-base leading-7">
                {book.description}
              </CardDescription>
            )}

            {(book.created_by_name || book.updated_by_name) && (
              <div className="space-y-1 pt-2 text-xs text-neutral-500">
                {book.created_by_name && (
                  <div>追加した人: {book.created_by_name}</div>
                )}
                {book.updated_by_name && (
                  <div>最終更新者: {book.updated_by_name}</div>
                )}
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
                      className={`rounded-3xl border p-5 ${
                        isScheduled
                          ? "border-sky-200 bg-sky-50/40"
                          : "border-neutral-200"
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
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
