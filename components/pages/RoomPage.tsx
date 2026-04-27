"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Users,
  MessageSquare,
  Lock,
  DoorOpen,
  Clock3,
  Eye,
  ChevronDown,
} from "lucide-react";
import type { Book, Room, UserProfile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

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
  open: { label: "ふらっと歓迎", icon: DoorOpen },         // legacy (= R1 後の新規部屋では使わない)
  approval: { label: "少人数向け", icon: Lock },           // legacy
  discussion: { label: "ふらっと歓迎", icon: DoorOpen },   // R1: 'open' の正式名
  reservation: { label: "少人数向け", icon: Lock },        // R1: 'approval' の正式名
} as const;

const colorOptions = [
  { value: "slate", bubble: "bg-slate-100 text-slate-800", chip: "bg-slate-500", name: "text-slate-700" },
  { value: "red", bubble: "bg-red-100 text-red-900", chip: "bg-red-500", name: "text-red-700" },
  { value: "blue", bubble: "bg-blue-100 text-blue-900", chip: "bg-blue-500", name: "text-blue-700" },
  { value: "green", bubble: "bg-green-100 text-green-900", chip: "bg-green-500", name: "text-green-700" },
  { value: "purple", bubble: "bg-purple-100 text-purple-900", chip: "bg-purple-500", name: "text-purple-700" },
  { value: "amber", bubble: "bg-amber-100 text-amber-900", chip: "bg-amber-500", name: "text-amber-700" },
] as const;

function getColorStyle(color?: string | null) {
  return colorOptions.find((c) => c.value === color) ?? colorOptions[0];
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

function formatUntilStart(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "開始しました";
  const min = Math.floor(ms / 1000 / 60);
  if (min < 60) return `あと${min}分で開始`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `あと${hour}時間${min % 60}分で開始`;
  const day = Math.floor(hour / 24);
  return `あと${day}日で開始`;
}

function renderMessageContent(text: string): React.ReactNode {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const pieces: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let urlKey = 0;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) pieces.push(text.slice(lastIndex, match.index));
    pieces.push(
      <a
        key={`u${urlKey++}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
      >
        {match[0]}
      </a>,
    );
    lastIndex = urlRegex.lastIndex;
  }
  if (lastIndex < text.length) pieces.push(text.slice(lastIndex));
  if (pieces.length === 0) pieces.push(text);
  const out: React.ReactNode[] = [];
  pieces.forEach((piece, i) => {
    if (typeof piece === "string") {
      const lines = piece.split("\n");
      lines.forEach((line, j) => {
        if (j > 0) out.push(<br key={`br-${i}-${j}`} />);
        if (line.length > 0) out.push(line);
      });
    } else {
      out.push(piece);
    }
  });
  return out;
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

type RoomPageProps = {
  book: Book;
  room: Room;
  currentProfile: UserProfile | null;
  myProfileId: number | null;
  /** 作成者表示用。id → name / color を引けるテーブル。 */
  profiles?: { id: number; name: string; color: string }[];
  onBack: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onDeleteRoom: () => Promise<void>;
  onReserve: () => Promise<void>;
  onCancelReservation: () => Promise<void>;
  onExtend: () => Promise<void>;
  onLeaveTrace: (body: string) => Promise<void>;
};

export default function RoomPage({
  book,
  room,
  currentProfile,
  myProfileId,
  profiles,
  onBack,
  onSendMessage,
  onDeleteRoom,
  onReserve,
  onCancelReservation,
  onExtend,
  onLeaveTrace,
}: RoomPageProps) {
  const creator =
    room.created_by_profile_id != null
      ? profiles?.find((p) => p.id === room.created_by_profile_id) ?? null
      : null;
  const creatorColorStyle = getColorStyle(creator?.color);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [presenceCount, setPresenceCount] = useState(1);
  const [traceDraft, setTraceDraft] = useState("");
  const [tracing, setTracing] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scheduledMs = room.scheduled_start_at
    ? new Date(room.scheduled_start_at).getTime()
    : null;
  const isBeforeStart = scheduledMs !== null && scheduledMs > Date.now();

  // 作成者本人のみ削除ボタンを表示する。myProfileId が未確定の間は出さない。
  const isCreator =
    myProfileId !== null &&
    room.created_by_profile_id !== null &&
    myProfileId === room.created_by_profile_id;

  const myReservation = useMemo(
    () =>
      myProfileId
        ? room.reservations.find((r) => r.profile_id === myProfileId) ?? null
        : null,
    [room.reservations, myProfileId],
  );
  const reservationCount = room.reservations.length;
  const reservationFull = reservationCount >= RESERVATION_CAPACITY;

  const expiresMs = room.expires_at ? new Date(room.expires_at).getTime() : null;
  const inFinalHour =
    expiresMs !== null &&
    expiresMs - Date.now() <= 60 * 60 * 1000 &&
    expiresMs > Date.now();

  // Presence
  useEffect(() => {
    const channel = supabase.channel(`presence-room-${room.id}`);
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPresenceCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            name: currentProfile?.name ?? "ゲスト",
            at: new Date().toISOString(),
          });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, currentProfile?.name]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.messages.length]);

  const submit = async () => {
    if (!draft.trim() || sending) return;
    if (isBeforeStart) {
      alert("予約読書会は開始日時まで投稿できません");
      return;
    }
    setSending(true);
    await onSendMessage(draft.trim());
    setDraft("");
    setSending(false);
  };

  const submitTrace = async () => {
    if (!traceDraft.trim() || tracing) return;
    setTracing(true);
    await onLeaveTrace(traceDraft.trim());
    setTraceDraft("");
    setTracing(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="ghost" className="rounded-2xl" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {book.title} に戻る
          </Button>

          <div className="flex items-center gap-2">
            {isCreator && (
              <Button
                variant="destructive"
                className="rounded-2xl"
                onClick={async () => {
                  const ok = window.confirm("この部屋を削除しますか？");
                  if (!ok) return;
                  await onDeleteRoom();
                }}
              >
                部屋を削除
              </Button>
            )}
          </div>
        </div>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="border-b border-neutral-100 pb-5">
            <div className="text-sm text-neutral-500">{book.title}</div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-2xl leading-8">
              {room.title}
              {isBeforeStart && (
                <Badge variant="outline" className="border-sky-300 bg-white text-sky-700">
                  予約読書会
                </Badge>
              )}
            </CardTitle>
            <div className="pt-2">
              <RoomBadge room={room} />
            </div>
            <div className="flex flex-wrap gap-4 pt-2 text-sm text-neutral-500">
              {creator ? (
                <span className="inline-flex items-center gap-1">
                  作成:
                  <span className={`font-medium ${creatorColorStyle.name}`}>
                    {creator.name}
                  </span>
                </span>
              ) : room.created_by_profile_id != null ? (
                <span className="inline-flex items-center gap-1">
                  作成: <span className="text-neutral-400">（不明）</span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                {presenceCount}人が参加中
              </span>
              <span>{formatRelativeTime(room.updated_at)}</span>
              <span>{formatExpiresAt(room.expires_at)}</span>
                {!isBeforeStart && room.expires_at && (
                <button
                  type="button"
                  className="text-xs text-neutral-500 underline"
                  onClick={() => onExtend()}
                  title="この部屋の投稿受付期限を、いまから30日後にリセットします"
                >
                  30日後まで開く
                </button>
              )}
            </div>
          </CardHeader>

          {isBeforeStart && (
            <div className="border-b border-sky-100 bg-sky-50/60 px-6 py-4 text-sm text-sky-900">
              <div className="mb-2 inline-flex items-center gap-2 font-medium">
                <Clock3 className="h-4 w-4" />
                {formatUntilStart(room.scheduled_start_at as string)}
              </div>
              <div className="text-xs leading-6">
                開始日時:{" "}
                {new Date(room.scheduled_start_at as string).toLocaleString("ja-JP", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" / "}予約 {reservationCount}/{RESERVATION_CAPACITY}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {myReservation ? (
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={onCancelReservation}
                  >
                    予約済み（キャンセル）
                  </Button>
                ) : reservationFull ? (
                  <Button variant="outline" className="rounded-2xl" disabled>
                    満員です
                  </Button>
                ) : (
                  <Button className="rounded-2xl" onClick={onReserve}>
                    予約する
                  </Button>
                )}
                {room.reservations.length > 0 && (
                  <div className="text-xs text-sky-800/80">
                    予約者:{" "}
                    {room.reservations
                      .map((r) => r.profile_name ?? "匿名")
                      .join(" / ")}
                  </div>
                )}
              </div>
            </div>
          )}

          <CardContent className="p-0">
            <div className="h-[60vh] overflow-y-auto sm:h-[460px]">
              <div className="flex min-h-full flex-col justify-end space-y-4 p-6">
                {room.messages.map((m) => {
                  const colorStyle = getColorStyle(m.user_color);
                  const isMine =
                    !!currentProfile?.name && m.user_name === currentProfile.name;
                  return (
                    <div
                      key={m.id}
                      className={`flex gap-3 ${isMine ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium uppercase text-white ${colorStyle.chip}`}
                      >
                        {m.user_name.slice(0, 1)}
                      </div>
                      <div className="max-w-[85%]">
                        <div
                          className={`mb-1 flex items-center gap-2 text-sm ${isMine ? "justify-end" : ""}`}
                        >
                          <span className={`font-medium ${colorStyle.name}`}>
                            {m.user_name}
                          </span>
                          <span className="text-neutral-400">
                            {new Date(m.created_at).toLocaleTimeString("ja-JP", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div
                          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 leading-7 ${colorStyle.bubble}`}
                        >
                          {renderMessageContent(m.text)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-neutral-100 p-4">
              {isBeforeStart ? (
                <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
                  予約読書会は開始日時まで投稿できません。
                </div>
              ) : (
                <>
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
                    <Button
                      onClick={submit}
                      className="h-auto rounded-2xl px-6"
                      disabled={sending}
                    >
                      送信
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {!isBeforeStart && (
          <Card className="mt-6 rounded-3xl border-0 shadow-sm">
            <button
              type="button"
              onClick={() => setTraceOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left"
              aria-expanded={traceOpen}
            >
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Eye className="h-4 w-4" />
                  置き手紙を残す
                </div>
                {!traceOpen && (
                  <div className="mt-1 text-sm text-neutral-500">
                    チャットを振り返りながら書けます。終了後に本のページへ。
                  </div>
                )}
              </div>
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform ${
                  traceOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {traceOpen && (
              <CardContent>
                <div className="mb-2 text-sm text-neutral-500">
                  部屋の終了後に公開され、本のページに短いメッセージとして残ります（30日間・最大4件）。
                </div>
                <Textarea
                  value={traceDraft}
                  onChange={(e) => setTraceDraft(e.target.value)}
                  placeholder="次に読む人へ、短い一言をどうぞ。"
                  className="min-h-[88px] rounded-2xl"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    className="rounded-2xl"
                    onClick={submitTrace}
                    disabled={tracing || !traceDraft.trim()}
                  >
                    残す
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
