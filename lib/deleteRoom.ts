// lib/deleteRoom.ts
// 部屋削除の共通関数。作成者本人のみが実行できる RPC を呼ぶ。

import { supabase } from "@/lib/supabase";
import type { Room, UserProfile } from "@/lib/types";

export type DeleteRoomResult =
  | { ok: true }
  | { ok: false; reason: "not_creator" | "profile_missing" | "invalid_passphrase" | "network" | "not_found"; message: string };

/**
 * 部屋を削除する。
 * - 事前に UI 側でも created_by_profile_id === profile.id をチェックしておくこと。
 * - 本関数は二重チェックとして DB 側の RPC に丸投げする。
 */
export async function deleteRoom(
  room: Room,
  profile: UserProfile | null,
): Promise<DeleteRoomResult> {
  if (!profile?.id) {
    return { ok: false, reason: "profile_missing", message: "プロフィールが未設定です。" };
  }

  if (room.created_by_profile_id !== profile.id) {
    return { ok: false, reason: "not_creator", message: "この部屋はあなたが作成したものではありません。" };
  }

  const { error } = await supabase.rpc("delete_room_as_creator", {
    p_room_id: room.id,
    p_profile_id: profile.id,
    p_passphrase: profile.passphrase ?? null,
  });

  if (error) {
    if (error.message.includes("not_room_creator")) {
      return { ok: false, reason: "not_creator", message: "この部屋はあなたが作成したものではありません。" };
    }
    if (error.message.includes("invalid_passphrase")) {
      return { ok: false, reason: "invalid_passphrase", message: "合言葉が一致しません。" };
    }
    if (error.message.includes("room_not_found")) {
      return { ok: false, reason: "not_found", message: "部屋が見つかりません。" };
    }
    return { ok: false, reason: "network", message: error.message };
  }

  return { ok: true };
}
