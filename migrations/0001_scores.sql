-- Leaderboard rows: one per finished run.
CREATE TABLE IF NOT EXISTS scores (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nick TEXT NOT NULL,
	points INTEGER NOT NULL,
	level INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS scores_by_points ON scores (points DESC, level DESC, created_at ASC);
