'use strict';

const STORAGE_KEY = 'todo-app.v1';

const state = {
  todos: load(),
  filter: 'all',
};

const els = {
  form: document.getElementById('new-todo'),
  title: document.getElementById('new-title'),
  due: document.getElementById('new-due'),
  list: document.getElementById('todo-list'),
  empty: document.getElementById('empty'),
  summary: document.getElementById('summary'),
  clearDone: document.getElementById('clear-done'),
  filters: document.querySelectorAll('[data-filter]'),
  template: document.getElementById('todo-template'),
};

// ---- 永続化 ----

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
  } catch {
    // 保存できない環境（プライベートモード等）でも動作は続ける
  }
}

// ---- 操作 ----

function addTodo(title, due) {
  state.todos.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    title,
    due: due || '',
    done: false,
    createdAt: Date.now(),
  });
  commit();
}

function updateTodo(id, changes) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  Object.assign(todo, changes);
  commit();
}

function deleteTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  commit();
}

function clearDone() {
  state.todos = state.todos.filter((t) => !t.done);
  commit();
}

function moveTodo(id, beforeId) {
  const from = state.todos.findIndex((t) => t.id === id);
  if (from === -1) return;
  const [todo] = state.todos.splice(from, 1);
  const to = beforeId ? state.todos.findIndex((t) => t.id === beforeId) : state.todos.length;
  state.todos.splice(to === -1 ? state.todos.length : to, 0, todo);
  commit();
}

function commit() {
  save();
  render();
}

// ---- 表示 ----

function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDue(due) {
  if (!due) return '';
  const today = todayString();
  if (due === today) return '期限: 今日';
  const [y, m, d] = due.split('-').map(Number);
  const label = y === new Date().getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
  return due < today ? `期限切れ: ${label}` : `期限: ${label}`;
}

function visibleTodos() {
  if (state.filter === 'active') return state.todos.filter((t) => !t.done);
  if (state.filter === 'done') return state.todos.filter((t) => t.done);
  return state.todos;
}

function render() {
  const today = todayString();
  const items = visibleTodos();

  els.list.replaceChildren(
    ...items.map((todo) => {
      const li = els.template.content.firstElementChild.cloneNode(true);
      li.dataset.id = todo.id;
      li.classList.toggle('done', todo.done);
      li.classList.toggle('overdue', !todo.done && !!todo.due && todo.due < today);
      li.querySelector('.toggle').checked = todo.done;
      li.querySelector('.title').textContent = todo.title;
      li.querySelector('.due').textContent = formatDue(todo.due);
      return li;
    }),
  );

  const remaining = state.todos.filter((t) => !t.done).length;
  const doneCount = state.todos.length - remaining;
  els.summary.textContent = state.todos.length ? `残り ${remaining} 件 / 全 ${state.todos.length} 件` : '';
  els.clearDone.disabled = doneCount === 0;

  els.empty.hidden = items.length > 0;
  els.empty.textContent = state.todos.length === 0
    ? 'やることはまだありません'
    : state.filter === 'done' ? '完了したものはありません' : 'すべて完了しました 🎉';

  els.filters.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === state.filter));
  });
}

// ---- 編集 ----

function startEdit(li) {
  const id = li.dataset.id;
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;

  const titleEl = li.querySelector('.title');
  const input = document.createElement('input');
  input.className = 'edit';
  input.value = todo.title;
  input.maxLength = 200;
  titleEl.replaceWith(input);
  li.draggable = false;
  input.focus();
  input.select();

  let finished = false;
  const finish = (saveChanges) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    if (!saveChanges) return render();
    if (value) updateTodo(id, { title: value });
    else deleteTodo(id);
  };

  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // 日本語変換中の Enter は無視
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ---- イベント ----

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;
  addTodo(title, els.due.value);
  els.form.reset();
  if (state.filter === 'done') {
    state.filter = 'all';
    render();
  }
  els.title.focus();
});

els.filters.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    render();
  });
});

els.clearDone.addEventListener('click', () => {
  const count = state.todos.filter((t) => t.done).length;
  if (count && confirm(`完了した ${count} 件を削除しますか？`)) clearDone();
});

els.list.addEventListener('change', (e) => {
  if (!e.target.matches('.toggle')) return;
  const li = e.target.closest('.todo');
  updateTodo(li.dataset.id, { done: e.target.checked });
});

els.list.addEventListener('click', (e) => {
  if (!e.target.matches('.delete')) return;
  deleteTodo(e.target.closest('.todo').dataset.id);
});

els.list.addEventListener('dblclick', (e) => {
  if (!e.target.matches('.title')) return;
  startEdit(e.target.closest('.todo'));
});

// ドラッグで並べ替え
let draggingId = null;

els.list.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.todo');
  if (!li) return;
  draggingId = li.dataset.id;
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});

els.list.addEventListener('dragover', (e) => {
  if (!draggingId) return;
  e.preventDefault();
  const dragging = els.list.querySelector('.dragging');
  const after = [...els.list.querySelectorAll('.todo:not(.dragging)')].find((li) => {
    const box = li.getBoundingClientRect();
    return e.clientY < box.top + box.height / 2;
  });
  if (after) els.list.insertBefore(dragging, after);
  else els.list.appendChild(dragging);
});

els.list.addEventListener('dragend', (e) => {
  const li = e.target.closest('.todo');
  if (!li || !draggingId) return;
  // 表示中の次の要素の直前へ移動（フィルタ中でも非表示項目の順序は維持）
  const next = li.nextElementSibling;
  moveTodo(draggingId, next ? next.dataset.id : null);
  draggingId = null;
});

// 他のタブでの変更を反映
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  state.todos = load();
  render();
});

render();
