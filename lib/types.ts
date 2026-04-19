export type Message = {
  id: number;
  room_id: number;
  user_name: string;
  user_color: string | null;
  text: string;
  created_at: string;
};

export type Reservation = {
  id: number;
  room_id: number;
  profile_id: number;
  profile_name: string | null;
  created_at: string;
};

export type Room = {
  id: number;
  book_id: string;
  title: string;
  entry_type: "welcome" | "deep" | "small" | "open" | "approval";
  spoiler: "none" | "progress" | "read";
  active_users: number;
  updated_at: string;
  expires_at: string | null;
  created_by_profile_id: number | null;
  scheduled_start_at: string | null;
  messages: Message[];
  reservations: Reservation[];
};

export type BookTrace = {
  id: number;
  book_id: string;
  room_id: number | null;
  room_title: string | null;
  body: string;
  created_at: string;
  created_by_name: string | null;
};

export type Book = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  updated_at?: string | null;
  updated_by_name?: string | null;
  rooms: Room[];
  traces: BookTrace[];
};

export type UserProfile = {
  name: string;
  color: string;
  favoriteBookId?: string | null;
  favoriteNote?: string;
  passphrase?: string;
};

export type ProfileRecord = {
  id: number;
  name: string;
  color: string;
  favorite_book_id: string | null;
  favorite_note: string | null;
  passphrase: string | null;
  created_at: string;
  updated_at: string;
};