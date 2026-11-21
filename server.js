const express = require('express');
const path = require('path');
const db = require('./src/database');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function userById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function isAdmin(userId) {
  const user = userById(userId);
  return user && user.role === 'admin';
}

function dateToday() {
  return new Date().toISOString().slice(0, 10);
}

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, name, role, team_id FROM users ORDER BY id').all();
  res.json(users);
});

app.get('/api/rooms', (req, res) => {
  const { date, start, end, capacity, projector, video, all } = req.query;
  const conditions = [];
  const values = [];

  if (all !== 'true') conditions.push("status = 'active'");
  if (capacity) {
    conditions.push('capacity >= ?');
    values.push(Number(capacity));
  }
  if (projector === 'true') conditions.push('has_projector = 1');
  if (video === 'true') conditions.push('has_video = 1');

  let availability = '';
  if (date && start && end) {
    availability = ` AND NOT EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.room_id = rooms.id
        AND r.date = ?
        AND r.start_time < ?
        AND r.end_time > ?
    )`;
    values.push(date, end, start);
  }

  const sql = `SELECT * FROM rooms ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}${availability} ORDER BY name`;
  const rooms = db.prepare(sql).all(...values);
  res.json(rooms);
});

app.get('/api/reservations', (req, res) => {
  const userId = Number(req.query.userId);
  const reservations = db.prepare(`
    SELECT r.*, rooms.name AS room_name, rooms.location, users.name AS user_name
    FROM reservations r
    JOIN rooms ON rooms.id = r.room_id
    JOIN users ON users.id = r.user_id
    WHERE r.user_id = ?
    ORDER BY r.date DESC, r.start_time DESC
  `).all(userId);
  res.json(reservations);
});

app.post('/api/reservations', (req, res) => {
  const { userId, roomId, title, date, start, end } = req.body;
  const user = userById(userId);

  if (!user || !roomId || !title || !date || !start || !end || start >= end) {
    return res.status(400).json({ error: 'Preencha os dados da reserva corretamente.' });
  }

  const room = db.prepare("SELECT * FROM rooms WHERE id = ? AND status = 'active'").get(roomId);
  if (!room) return res.status(404).json({ error: 'Sala não encontrada ou indisponível.' });

  const conflict = db.prepare(`
    SELECT id FROM reservations
    WHERE room_id = ? AND date = ? AND start_time < ? AND end_time > ?
  `).get(roomId, date, end, start);

  if (conflict) return res.status(409).json({ error: 'Este horário acabou de ser reservado. Escolha outro período.' });

  const result = db.prepare(`
    INSERT INTO reservations (room_id, user_id, title, date, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(roomId, user.id, title, date, start, end);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.get('/api/admin/overview', (req, res) => {
  if (!isAdmin(req.query.userId)) return res.status(403).json({ error: 'Acesso disponível para administradores.' });

  const rooms = db.prepare('SELECT * FROM rooms ORDER BY name').all();
  const reservations = db.prepare(`
    SELECT r.*, rooms.name AS room_name, users.name AS user_name
    FROM reservations r
    JOIN rooms ON rooms.id = r.room_id
    JOIN users ON users.id = r.user_id
    ORDER BY r.date DESC, r.start_time
  `).all();

  res.json({ rooms, reservations });
});

app.post('/api/rooms', (req, res) => {
  const { userId, name, location, capacity, projector, video } = req.body;
  if (!isAdmin(userId)) return res.status(403).json({ error: 'Acesso disponível para administradores.' });
  if (!name || !location || !capacity) return res.status(400).json({ error: 'Informe nome, local e capacidade.' });

  const result = db.prepare(`
    INSERT INTO rooms (name, location, capacity, has_projector, has_video, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(name, location, Number(capacity), projector ? 1 : 0, video ? 1 : 0);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/rooms/:id', (req, res) => {
  const { userId, name, location, capacity, projector, video, status } = req.body;
  if (!isAdmin(userId)) return res.status(403).json({ error: 'Acesso disponível para administradores.' });
  if (!name || !location || !capacity) return res.status(400).json({ error: 'Informe nome, local e capacidade.' });

  db.prepare(`
    UPDATE rooms
    SET name = ?, location = ?, capacity = ?, has_projector = ?, has_video = ?, status = ?
    WHERE id = ?
  `).run(name, location, Number(capacity), projector ? 1 : 0, video ? 1 : 0, status === 'inactive' ? 'inactive' : 'active', req.params.id);

  res.json({ ok: true });
});

app.get('/api/manager/overview', (req, res) => {
  const user = userById(req.query.userId);
  if (!user || user.role !== 'manager') return res.status(403).json({ error: 'Acesso disponível para gestores.' });

  const reservations = db.prepare(`
    SELECT r.*, rooms.name AS room_name, rooms.location, users.name AS user_name
    FROM reservations r
    JOIN rooms ON rooms.id = r.room_id
    JOIN users ON users.id = r.user_id
    WHERE users.team_id = ? AND r.date >= ?
    ORDER BY r.date, r.start_time
  `).all(user.team_id, dateToday());

  const peakHours = db.prepare(`
    SELECT substr(r.start_time, 1, 2) AS hour, COUNT(*) AS total
    FROM reservations r
    JOIN users ON users.id = r.user_id
    WHERE users.team_id = ? AND r.date >= ?
    GROUP BY hour
    ORDER BY total DESC, hour
  `).all(user.team_id, dateToday());

  res.json({ reservations, peakHours });
});

app.listen(port, () => {
  console.log(`Protótipo disponível em http://localhost:${port}`);
});
