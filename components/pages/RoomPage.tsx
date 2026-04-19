"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  Users,
  MessageSquare,
  Lock,
  DoorOpen,
} from "lucide-react";
import type { Book, Room } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

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
  onBack: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onDeleteRoom: () => Promise<void>;
};

export default function RoomPage({
  book,
  room,
  onBack,
  onSendMessage,
  onDeleteRoom,
}: RoomPageProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    await onSendMessage(draft.trim());
    setDraft("");
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="ghost" className="rounded-2xl" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {book.title} に戻る
          </Button>

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
        </div>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="border-b border-neutral-100 pb-5">
            <div className="text-sm text-neutral-500">{book.title}</div>
            <CardTitle className="text-2xl leading-8">{room.title}</CardTitle>
            <div className="pt-2">
              <RoomBadge room={room} />
            </div>
            <div className="flex flex-wrap gap-4 pt-2 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                {room.active_users}人
              </span>
              <span>{formatRelativeTime(room.updated_at)}</span>
              <span>{formatExpiresAt(room.expires_at)}</span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="h-[460px] space-y-4 overflow-y-auto p-6">
              {room.messages.map((m) => {
                const colorStyle = getColorStyle(m.user_color);
                return (
                  <div key={m.id} className="flex gap-3">
                    <div className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium uppercase text-white ${colorStyle.chip}`}>
                      {m.user_name.slice(0, 1)}
                    </div>
                    <div className="max-w-[85%]">
                      <div className="mb-1 flex items-center gap-2 text-sm">
                        <span className={`font-medium ${colorStyle.name}`}>{m.user_name}</span>
                        <span className="text-neutral-400">
                          {new Date(m.created_at).toLocaleTimeString("ja-JP", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className={`rounded-2xl px-4 py-3 leading-7 ${colorStyle.bubble}`}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-neutral-100 p-4">
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
                <Button onClick={submit} className="h-auto rounded-2xl px-6" disabled={sending}>
                  送信
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}