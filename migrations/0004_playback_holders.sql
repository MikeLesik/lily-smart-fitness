-- Одно устройство на аккаунт: какая сессия сейчас смотрит платное видео.
-- Строка одна на пользователя; кто открыл видео последним, тот и записан.
CREATE TABLE playback_holders (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  video_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
