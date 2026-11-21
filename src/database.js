const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'database.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    team_id INTEGER,
    FOREIGN KEY (team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    has_projector INTEGER NOT NULL DEFAULT 0,
    has_video INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_room_date ON reservations(room_id, date);
  CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id);
`);

const userCount = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;

if (userCount === 0) {
  const addDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const seed = db.transaction(() => {
    db.prepare('INSERT INTO teams (id, name) VALUES (1, ?)').run('Operações');
    db.prepare('INSERT INTO users (id, name, role, team_id) VALUES (?, ?, ?, ?)').run(1, 'José Silva', 'employee', 1);
    db.prepare('INSERT INTO users (id, name, role, team_id) VALUES (?, ?, ?, ?)').run(2, 'Marina Costa', 'employee', 1);
    db.prepare('INSERT INTO users (id, name, role, team_id) VALUES (?, ?, ?, ?)').run(3, 'Carlos Almeida', 'admin', 1);
    db.prepare('INSERT INTO users (id, name, role, team_id) VALUES (?, ?, ?, ?)').run(4, 'Adriana Castro', 'manager', 1);

    const addRoom = db.prepare(`
      INSERT INTO rooms (name, location, capacity, has_projector, has_video, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);
    addRoom.run('Sala 001', '1º andar', 8, 1, 1);
    addRoom.run('Sala 002', '1º andar', 4, 0, 1);
    addRoom.run('Sala 003', '2º andar', 12, 1, 1);
    addRoom.run('Sala 004', '2º andar', 2, 0, 0);

    const addReservation = db.prepare(`
      INSERT INTO reservations (room_id, user_id, title, date, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    addReservation.run(1, 1, 'Planejamento do projeto', addDays(1), '09:00', '10:00');
    addReservation.run(2, 2, 'Revisão de entregas', addDays(1), '10:00', '11:30');
    addReservation.run(3, 1, 'Alinhamento semanal', addDays(1), '14:00', '15:00');
    addReservation.run(1, 2, 'Acompanhamento da equipe', addDays(2), '09:00', '10:30');
  });

  seed();
}

module.exports = db;
