"use client";

import React, { useMemo } from "react";
import { Clock3, MessageSquare } from "lucide-react";
import type { Book, Room, UserProfile } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type MyLogDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: Book[];
  currentProfile: UserProfile | null;
  myProfileId: number | null;
  lastSeenMap: Record<number, string>;
  onEnterRoom: (bookId: string, roomId: number) => void;
};

type RoomWithBook = { book: Book; room: Room };

function isRoomExpired(room: Room) {
  if (!room.expires_at) return false;
  return new Date(room.expires_at).getTime() <= Date.now();
}

function formatScheduled(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntil(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "開始済み";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `あと${min}分`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `あと${hour}時間`;
  const day = Math.floor(hour / 24);
  return `あと${day}日`;
}

function formatRelative(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  return `${Math.floor(diffHour / 24)}日前`;
}

export default function MyLogDialog({
  open,
  onOpenChange,
  books,
  currentProfile,
  myProfileId,
  lastSeenMap,
  onEnterRoom,
}: MyLogDialogProps) {
  const myName = currentProfile?.name ?? null;
  const myId = myProfileId;

  const isMine = (m: { user_name: string; profile_id?: number | null }) =>
    (myId !== null && m.profile_id === myId) ||
    (m.profile_id == null && !!myName && m.user_name === myName);
  const allPairs: RoomWithBook[] = useMemo(
    () => books.flatMap((book) => book.rooms.map((room) => ({ book, room }))),
    [books],
  );

  const myReservations: RoomWithBook[] = useMemo(() => {
    if (!myProfileId) return [];
    return allPairs
      .filter(({ room }) =>
        room.reservations.some((r) => r.profile_id === myProfileId),
      )
      .filter(({ room }) => !isRoomExpired(room))
      .sort((a, b) => {
        const am = a.room.scheduled_start_at
          ? new Date(a.room.scheduled_start_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bm = b.room.scheduled_start_at
          ? new Date(b.room.scheduled_start_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        return am - bm;
      });
  }, [allPairs, myProfileId]);

  const participated: RoomWithBook[] = useMemo(() => {
    if (!myName && myId === null) return [];
    return allPairs.filter(({ room }) =>
      room.messages.some((m) => isMine(m)),
    );
  }, [allPairs, myName, myId]);

  const unread: RoomWithBook[] = useMemo(
  () =>
    participated
      .filter(({ room }) => !isRoomExpired(room))
      .filter(({ room }) => {
        if (!myName && myId === null) return false;
        const seen = lastSeenMap[room.id];
        return room.messages.some(
          (m) =>
            !isMine(m) &&
            (!seen ||
              new Date(m.created_at).getTime() > new Date(seen).getTime()),
        );
      })
      .sort(
        (a, b) =>
          new Date(b.room.updated_at).getTime() -
          new Date(a.room.updated_at).getTime(),
      ),
 [participated, lastSeenMap, myName, myId],
);
  const traceReady: RoomWithBook[] = useMemo(
  () =>
    allPairs
      .filter(({ room }) => room.entry_type !== "welcome")
      .filter(({ room }) => isRoomExpired(room))
      .filter(
        ({ room }) =>
          myProfileId !== null && room.created_by_profile_id === myProfileId,
      )
      .filter(
        ({ book, room }) =>
          !book.traces?.some((trace) => trace.room_id === room.id),
      )
      .filter(({ room }) => {
        if (!room.expires_at) return false;
        const seen = lastSeenMap[room.id];
        if (!seen) return true;
        return new Date(seen).getTime() < new Date(room.expires_at).getTime();
      })
      .sort(
        (a, b) =>
          new Date(b.room.expires_at ?? 0).getTime() -
          new Date(a.room.expires_at ?? 0).getTime(),
      ),
  [allPairs, myProfileId, lastSeenMap],
);
  const ongoing: RoomWithBook[] = useMemo(
    () =>
      participated
        .filter(({ room }) => !isRoomExpired(room))
        .sort(
          (a, b) =>
            new Date(b.room.updated_at).getTime() -
            new Date(a.room.updated_at).getTime(),
        ),
    [participated],
  );

  const finished: RoomWithBook[] = useMemo(
    () =>
      participated
        .filter(({ room }) => isRoomExpired(room))
        .sort(
          (a, b) =>
            new Date(b.room.updated_at).getTime() -
            new Date(a.room.updated_at).getTime(),
        )
        .slice(0, 5),
    [participated],
  );

  const enter = (bookId: string, roomId: number) => {
    onOpenChange(false);
    onEnterRoom(bookId, roomId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>自分の記録</DialogTitle>
        </DialogHeader>

        {!currentProfile ? (
          <div className="py-4 text-sm text-neutral-600">
            名前を設定すると、参加した部屋や予約が記録されます。
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <Section
              title="予約中の読書会"
              empty="まだ予約はありません。"
              items={myReservations}
              onEnter={enter}
              renderMeta={({ room }) =>
                room.scheduled_start_at ? (
                  <span className="inline-flex items-center gap-1 text-sky-700">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatScheduled(room.scheduled_start_at)}（
                    {timeUntil(room.scheduled_start_at)}）
                  </span>
                ) : null
              }
            />

            <Section
              title="未読あり"
              empty="新しい投稿はありません。"
              items={unread}
              onEnter={enter}
              highlight
              renderMeta={({ room }) => (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <MessageSquare className="h-3.5 w-3.5" />
                  最終更新 {formatRelative(room.updated_at)}
                </span>
              )}
            />
<section className="space-y-3">
  <h3 className="text-sm font-semibold text-stone-700">
    置き手紙を書ける部屋
  </h3>

  {traceReady.length === 0 ? (
    <p className="text-sm text-stone-500">
      置き手紙を書ける部屋はありません。
    </p>
  ) : (
    <div className="space-y-2">
      {traceReady.map(({ book, room }) => (
        <button
          key={room.id}
          type="button"
          onClick={() => {
            onClose();
            onOpenRoom(book.id, room.id);
          }}
          className="w-full rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
        >
          <p className="text-xs text-amber-700">
            部屋が閉じました。置き手紙を書けます。
          </p>
          <p className="mt-1 text-sm font-semibold text-stone-800">
            {room.title}
          </p>
          <p className="mt-1 text-xs text-stone-500">{book.title}</p>
        </button>
      ))}
    </div>
  )}
</section>
            <Section
              title="参加中の部屋"
              empty="現在参加中の部屋はありません。"
              items={ongoing}
              onEnter={enter}
              renderMeta={({ room }) => (
                <span className="text-neutral-500">
                  最終更新 {formatRelative(room.updated_at)}
                </span>
              )}
            />

            {finished.length > 0 && (
              <Section
                title="終わった部屋（直近5件）"
                empty=""
                items={finished}
                onEnter={enter}
                muted
                renderMeta={({ room }) => (
                  <span className="text-neutral-400">
                    終了 {formatRelative(room.updated_at)}
                  </span>
                )}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SectionProps = {
  title: string;
  empty: string;
  items: RoomWithBook[];
  onEnter: (bookId: string, roomId: number) => void;
  renderMeta?: (pair: RoomWithBook) => React.ReactNode;
  highlight?: boolean;
  muted?: boolean;
};

function Section({
  title,
  empty,
  items,
  onEnter,
  renderMeta,
  highlight,
  muted,
}: SectionProps) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-neutral-800">{title}</div>
      {items.length === 0 ? (
        empty ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 px-3 py-3 text-xs text-neutral-500">
            {empty}
          </div>
        ) : null
      ) : (
        <div className="space-y-2">
          {items.map(({ book, room }) => (
            <div
              key={`${book.id}-${room.id}`}
              className={`rounded-2xl border px-3 py-3 text-sm ${
                highlight
                  ? "border-red-200 bg-red-50/50"
                  : muted
                    ? "border-neutral-200 bg-neutral-50/60"
                    : "border-neutral-200"
              }`}
            >
             <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-neutral-500">
                    {book.title}
                  </div>
                  <div className="truncate font-medium">{room.title}</div>
                  <div className="mt-1 text-xs">
                    {renderMeta?.({ book, room })}
                  </div>
                </div>
                {!muted && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 self-end rounded-full sm:self-auto"
                    onClick={() => onEnter(book.id, room.id)}
                  >
                    入る
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
