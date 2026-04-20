"use client";

import React from "react";
import { BookOpen, Bell, Mail, UserCog, LogOut } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const colorOptions = [
  { value: "slate", chip: "bg-slate-500" },
  { value: "red", chip: "bg-red-500" },
  { value: "blue", chip: "bg-blue-500" },
  { value: "green", chip: "bg-green-500" },
  { value: "purple", chip: "bg-purple-500" },
  { value: "amber", chip: "bg-amber-500" },
] as const;

function getChip(color?: string | null) {
  return colorOptions.find((c) => c.value === color)?.chip ?? "bg-slate-500";
}

type ProfileMenuDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProfile: UserProfile | null;
  unreadCount: number;
  hasReminder: boolean;
  onOpenMyLog: () => void;
  onOpenProfileSetting: () => void;
  onClearLocalProfile: () => void;
  onOpenContact: () => void;
};

export default function ProfileMenuDialog({
  open,
  onOpenChange,
  currentProfile,
  unreadCount,
  hasReminder,
  onOpenMyLog,
  onOpenProfileSetting,
  onClearLocalProfile,
  onOpenContact,
}: ProfileMenuDialogProps) {
  const chip = getChip(currentProfile?.color);

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>メニュー</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-4 py-3">
            <span className={`h-3 w-3 rounded-full ${chip}`} />
            <span className="text-sm">
              {currentProfile ? currentProfile.name : "まだ名前が設定されていません"}
            </span>
          </div>

          <MenuItem
            icon={<UserCog className="h-4 w-4" />}
            label="名前の設定"
            onClick={() => {
              close();
              onOpenProfileSetting();
            }}
          />

          <MenuItem
            icon={<BookOpen className="h-4 w-4" />}
            label="自分の記録"
            badge={
              unreadCount > 0
                ? { label: `${unreadCount}件`, tone: "red" }
                : hasReminder
                  ? { label: "予約あり", tone: "sky" }
                  : null
            }
            onClick={() => {
              close();
              onOpenMyLog();
            }}
          />

          <MenuItem
            icon={<Mail className="h-4 w-4" />}
            label="管理人に伝える"
            onClick={() => {
              close();
              onOpenContact();
            }}
          />

          {hasReminder && (
            <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-2 text-xs text-sky-800">
              <Bell className="h-3.5 w-3.5" />
              24時間以内に開始する予約読書会があります。
            </div>
          )}

          {currentProfile && (
            <MenuItem
              icon={<LogOut className="h-4 w-4" />}
              label="この端末の設定を解除"
              tone="danger"
              onClick={() => {
                close();
                onClearLocalProfile();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type MenuItemProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: { label: string; tone: "red" | "sky" } | null;
  tone?: "default" | "danger";
};

function MenuItem({ icon, label, onClick, badge, tone = "default" }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm ${
        tone === "danger"
          ? "border-red-200 text-red-700 hover:bg-red-50"
          : "border-neutral-200 hover:bg-neutral-50"
      }`}
    >
      <span className="inline-flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </span>
      {badge && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            badge.tone === "red"
              ? "bg-red-100 text-red-700"
              : "bg-sky-100 text-sky-700"
          }`}
        >
          {badge.label}
        </span>
      )}
    </button>
  );
}
