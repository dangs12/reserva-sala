const state = {
  users: [],
  user: null,
  page: '',
  editingRoom: null
};

const view = document.querySelector('#view');
const navigation = document.querySelector('#navigation');
const personaSelect = document.querySelector('#persona');
const notice = document.querySelector('#notice');

const roleNames = {
  employee: 'Colaborador',
  admin: 'Administrador',
  manager: 'Gestora'
};

function dateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function today() {
  return dateString(new Date());
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return dateString(date);
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível concluir a operação.');
  }

  return data;
}

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.className = error ? 'error' : '';
  notice.hidden = false;
}

function clearNotice() {
  notice.hidden = true;
  notice.className = '';
}

function setUser(userId) {
  state.user = state.users.find((user) => user.id === Number(userId));

  if (state.user.role === 'employee') {
    state.page = 'search';
  } else if (state.user.role === 'admin') {
    state.page = 'rooms';
  } else {
    state.page = 'team';
  }

  renderNavigation();
  renderPage();
}

function getNavigationItems() {
  if (state.user.role === 'employee') {
    return [
      { id: 'search', label: 'Buscar salas' },
      { id: 'my-bookings', label: 'Minhas reservas' }
    ];
  }

  if (state.user.role === 'admin') {
    return [
      { id: 'rooms', label: 'Gerenciar salas' },
      { id: 'admin-bookings', label: 'Reservas' }
    ];
  }

  return [{ id: 'team', label: 'Visão da equipe' }];
}

function renderNavigation() {
  navigation.innerHTML = getNavigationItems().map((item) => `
    <button class="${state.page === item.id ? 'active' : ''}" data-page="${item.id}">
      ${item.label}
    </button>
  `).join('');

  navigation.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.page = button.dataset.page;
      renderNavigation();
      renderPage();
    });
  });
}

function pageTitle(title, description) {
  return `<h2>${title}</h2><p class="muted">${description}</p>`;
}

async function renderPage() {
  clearNotice();

  if (state.page === 'search') await renderSearch();
  if (state.page === 'my-bookings') await renderMyBookings();
  if (state.page === 'rooms') await renderAdminRooms();
  if (state.page === 'admin-bookings') await renderAdminBookings();
  if (state.page === 'team') await renderManager();
}

async function renderSearch() {
  view.innerHTML = `
    ${pageTitle('Buscar salas', 'Escolha a data e o horário para encontrar uma sala disponível.')}
    <form id="search-form" class="panel">
      <div class="fields">
        <label>Data<input type="date" name="date" value="${tomorrow()}" required></label>
        <label>Início<input type="time" name="start" value="09:00" required></label>
        <label>Fim<input type="time" name="end" value="10:00" required></label>
        <label>Participantes<input type="number" name="capacity" min="1" placeholder="Quantidade"></label>
        <button class="primary" type="submit">Buscar salas</button>
      </div>
      <div class="checks">
        <label><input type="checkbox" name="projector"> Projetor</label>
        <label><input type="checkbox" name="video"> Videoconferência</label>
      </div>
    </form>
    <h2 id="results-title">Salas disponíveis</h2>
    <div id="room-results"></div>
    <div id="booking-area"></div>
  `;

  const form = document.querySelector('#search-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    searchRooms(new FormData(form));
  });

  await searchRooms(new FormData(form));
}

async function searchRooms(formData) {
  const params = new URLSearchParams();

  ['date', 'start', 'end', 'capacity'].forEach((field) => {
    if (formData.get(field)) params.set(field, formData.get(field));
  });

  if (formData.get('projector')) params.set('projector', 'true');
  if (formData.get('video')) params.set('video', 'true');

  const rooms = await api(`/api/rooms?${params}`);
  const results = document.querySelector('#room-results');
  const title = document.querySelector('#results-title');

  title.textContent = `Salas disponíveis: ${rooms.length}`;
  document.querySelector('#booking-area').innerHTML = '';

  if (rooms.length === 0) {
    results.innerHTML = '<p class="empty">Nenhuma sala encontrada para esse período.</p>';
    return;
  }

  results.innerHTML = rooms.map((room) => `
    <div class="room">
      <h3>${escapeHtml(room.name)}</h3>
      <p class="room-details">
        Local: ${escapeHtml(room.location)}<br>
        Capacidade: ${room.capacity} pessoas<br>
        Projetor: ${room.has_projector ? 'Sim' : 'Não'}<br>
        Videoconferência: ${room.has_video ? 'Sim' : 'Não'}
      </p>
      <button class="primary" data-room-id="${room.id}" data-room-name="${escapeHtml(room.name)}">
        Reservar esta sala
      </button>
    </div>
  `).join('');

  results.querySelectorAll('[data-room-id]').forEach((button) => {
    button.addEventListener('click', () => {
      showBookingForm(
        button.dataset.roomId,
        button.dataset.roomName,
        new FormData(document.querySelector('#search-form'))
      );
    });
  });
}

function showBookingForm(roomId, roomName, filters) {
  const area = document.querySelector('#booking-area');

  area.innerHTML = `
    <h2>Reservar ${escapeHtml(roomName)}</h2>
    <form id="booking-form" class="panel">
      <input type="hidden" name="roomId" value="${roomId}">
      <label>Título da reunião<input name="title" required placeholder="Ex.: Planejamento do projeto"></label>
      <div class="fields">
        <label>Data<input name="date" type="date" value="${filters.get('date')}" required></label>
        <label>Início<input name="start" type="time" value="${filters.get('start')}" required></label>
        <label>Fim<input name="end" type="time" value="${filters.get('end')}" required></label>
      </div>
      <button class="primary" type="submit">Confirmar reserva</button>
    </form>
  `;

  document.querySelector('#booking-form').addEventListener('submit', createReservation);
  area.scrollIntoView({ behavior: 'smooth' });
}

async function createReservation(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  const reservation = {
    userId: state.user.id,
    roomId: form.get('roomId'),
    title: form.get('title'),
    date: form.get('date'),
    start: form.get('start'),
    end: form.get('end')
  };

  try {
    await api('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(reservation)
    });

    state.page = 'my-bookings';
    renderNavigation();
    await renderMyBookings();
    showNotice('Reserva confirmada.');
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function renderMyBookings() {
  const reservations = await api(`/api/reservations?userId=${state.user.id}`);

  view.innerHTML = `
    ${pageTitle('Minhas reservas', 'Consulte seus agendamentos e o histórico de reuniões.')}
    ${reservations.length ? `
      <div class="panel table-wrap">
        <table>
          <thead><tr><th>Reunião</th><th>Sala</th><th>Data</th><th>Horário</th><th>Status</th></tr></thead>
          <tbody>
            ${reservations.map((reservation) => `
              <tr>
                <td>${escapeHtml(reservation.title)}</td>
                <td>${escapeHtml(reservation.room_name)}</td>
                <td>${formatDate(reservation.date)}</td>
                <td>${reservation.start_time} - ${reservation.end_time}</td>
                <td>${reservation.date < today() ? 'Realizada' : 'Agendada'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="empty">Você ainda não possui reservas.</p>'}
  `;
}

function roomForm(room) {
  return `
    <form id="room-form" class="panel">
      <h3>${room ? 'Editar sala' : 'Cadastrar sala'}</h3>
      <label>Nome<input name="name" value="${escapeHtml(room?.name || '')}" required></label>
      <label>Localização<input name="location" value="${escapeHtml(room?.location || '')}" required></label>
      <label>Capacidade<input name="capacity" type="number" min="1" value="${room?.capacity || ''}" required></label>
      <div class="checks">
        <label><input name="projector" type="checkbox" ${room?.has_projector ? 'checked' : ''}> Projetor</label>
        <label><input name="video" type="checkbox" ${room?.has_video ? 'checked' : ''}> Videoconferência</label>
      </div>
      ${room ? `
        <label>Status
          <select name="status">
            <option value="active" ${room.status === 'active' ? 'selected' : ''}>Ativa</option>
            <option value="inactive" ${room.status === 'inactive' ? 'selected' : ''}>Inativa</option>
          </select>
        </label>
      ` : ''}
      <button class="primary" type="submit">${room ? 'Salvar alterações' : 'Cadastrar sala'}</button>
      ${room ? '<button type="button" id="cancel-edit">Cancelar</button>' : ''}
    </form>
  `;
}

async function renderAdminRooms() {
  const data = await api(`/api/admin/overview?userId=${state.user.id}`);
  const room = data.rooms.find((item) => item.id === state.editingRoom);

  view.innerHTML = `
    ${pageTitle('Gerenciar salas', 'Cadastre novos espaços e atualize as informações das salas.')}
    <h2>Salas cadastradas</h2>
    ${data.rooms.length ? `
      <div class="panel table-wrap">
        <table>
          <thead><tr><th>Sala</th><th>Local</th><th>Capacidade</th><th>Recursos</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${data.rooms.map((item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.location)}</td>
                <td>${item.capacity}</td>
                <td>${[item.has_projector ? 'Projetor' : '', item.has_video ? 'Videoconferência' : ''].filter(Boolean).join(', ') || 'Nenhum'}</td>
                <td>${item.status === 'active' ? 'Ativa' : 'Inativa'}</td>
                <td><button data-edit-room="${item.id}">Editar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="empty">Nenhuma sala cadastrada.</p>'}
    ${roomForm(room || null)}
  `;

  document.querySelector('#room-form').addEventListener('submit', saveRoom);

  document.querySelectorAll('[data-edit-room]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editingRoom = Number(button.dataset.editRoom);
      renderAdminRooms();
    });
  });

  document.querySelector('#cancel-edit')?.addEventListener('click', () => {
    state.editingRoom = null;
    renderAdminRooms();
  });
}

async function saveRoom(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  const room = {
    userId: state.user.id,
    name: form.get('name'),
    location: form.get('location'),
    capacity: form.get('capacity'),
    projector: form.get('projector') === 'on',
    video: form.get('video') === 'on',
    status: form.get('status') || 'active'
  };

  try {
    if (state.editingRoom) {
      await api(`/api/rooms/${state.editingRoom}`, {
        method: 'PUT',
        body: JSON.stringify(room)
      });
      state.editingRoom = null;
      await renderAdminRooms();
      showNotice('Sala atualizada.');
    } else {
      await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(room)
      });
      await renderAdminRooms();
      showNotice('Sala cadastrada.');
    }
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function renderAdminBookings() {
  const data = await api(`/api/admin/overview?userId=${state.user.id}`);

  view.innerHTML = `
    ${pageTitle('Reservas', 'Consulte os agendamentos realizados nas salas.')}
    <div class="summary panel">
      <p>Salas cadastradas: <strong>${data.rooms.length}</strong></p>
      <p>Salas ativas: <strong>${data.rooms.filter((room) => room.status === 'active').length}</strong></p>
      <p>Reservas registradas: <strong>${data.reservations.length}</strong></p>
    </div>
    ${data.reservations.length ? `
      <div class="panel table-wrap">
        <table>
          <thead><tr><th>Reunião</th><th>Responsável</th><th>Sala</th><th>Data</th><th>Horário</th></tr></thead>
          <tbody>
            ${data.reservations.map((reservation) => `
              <tr>
                <td>${escapeHtml(reservation.title)}</td>
                <td>${escapeHtml(reservation.user_name)}</td>
                <td>${escapeHtml(reservation.room_name)}</td>
                <td>${formatDate(reservation.date)}</td>
                <td>${reservation.start_time} - ${reservation.end_time}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="empty">Ainda não existem reservas.</p>'}
  `;
}

async function renderManager() {
  const data = await api(`/api/manager/overview?userId=${state.user.id}`);
  const uniqueRooms = new Set(data.reservations.map((reservation) => reservation.room_id)).size;

  view.innerHTML = `
    ${pageTitle('Visão da equipe', 'Acompanhe as reservas da equipe e os horários mais utilizados.')}
    <div class="summary panel">
      <p>Reservas futuras: <strong>${data.reservations.length}</strong></p>
      <p>Salas utilizadas: <strong>${uniqueRooms}</strong></p>
      <p>Horário mais procurado: <strong>${data.peakHours.length ? `${data.peakHours[0].hour}:00` : 'Sem dados'}</strong></p>
    </div>
    <h2>Reservas da equipe</h2>
    ${data.reservations.length ? `
      <div class="panel table-wrap">
        <table>
          <thead><tr><th>Reunião</th><th>Responsável</th><th>Sala</th><th>Data</th><th>Horário</th></tr></thead>
          <tbody>
            ${data.reservations.map((reservation) => `
              <tr>
                <td>${escapeHtml(reservation.title)}</td>
                <td>${escapeHtml(reservation.user_name)}</td>
                <td>${escapeHtml(reservation.room_name)}</td>
                <td>${formatDate(reservation.date)}</td>
                <td>${reservation.start_time} - ${reservation.end_time}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="empty">A equipe ainda não possui reservas futuras.</p>'}
    <h2>Horários de maior utilização</h2>
    ${data.peakHours.length ? `
      <div class="panel table-wrap">
        <table>
          <thead><tr><th>Horário de início</th><th>Quantidade de reservas</th></tr></thead>
          <tbody>
            ${data.peakHours.map((item) => `
              <tr><td>${item.hour}:00</td><td>${item.total}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="empty">Ainda não há dados de utilização.</p>'}
  `;
}

personaSelect.addEventListener('change', () => {
  localStorage.setItem('demo-user-id', personaSelect.value);
  setUser(personaSelect.value);
});

async function start() {
  state.users = await api('/api/users');

  personaSelect.innerHTML = state.users.map((user) => `
    <option value="${user.id}">${escapeHtml(user.name)} - ${roleNames[user.role]}</option>
  `).join('');

  const savedUser = localStorage.getItem('demo-user-id') || '1';
  personaSelect.value = savedUser;
  if (!personaSelect.value) personaSelect.value = '1';

  setUser(personaSelect.value);
}

start().catch((error) => showNotice(error.message, true));
