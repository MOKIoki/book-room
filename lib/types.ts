export type Message = {
  id: number;
  room_id: number;
  user_name: string;
  user_color: string;
  text: string;
  created_at: string;
};

export type Reservation = {
  id: number;
  room_id: number;
  profile_id: number | null;
  profile_name: string | null;
  created_at: string;
};

export type Room = {
  id: number;
  book_id: string;
  title: string;
  entry_type: "open" | "approval" | "welcome" | "deep" | "small";
  spoiler: "none" | "progress" | "read";
  active_users: number;
  expires_at: string | null;
  updated_at: string;
  created_at?: string;
  scheduled_start_at: string | null;
  created_by_profile_id: number | null;
  messages: Message[];
  reservations: Reservation[];
};

export type BookTrace = {
  id: number;
  book_id: string;
  room_id: number | null;
  room_title: string | null;
  body: string;
  created_by_name: string | null;
  created_at: string;
};

export type Book = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  updated_at: string;
  updated_by_name: string | null;
  /** 本を追加した人の名前 (追加時点のスナップショット)。 */
  created_by_name: string | null;
  rooms: Room[];
  traces: BookTrace[];
};

export type UserProfile = {
  name: string;
  color: string;
  favoriteBookId?: string | null;
  favoriteNote?: string | null;
  passphrase?: string | null;
};

export type ProfileRecord = {
  id: number;
  name: string;
  color: string;
  favorite_book_id: string | null;
  favorite_note: string | null;
};
