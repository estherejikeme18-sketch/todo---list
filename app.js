/* ==========================================================================
   Todo app — behaviour
   Vanilla JavaScript (ES5-compatible syntax, modern DOM APIs).
   No dependencies, no build step. Tasks live in localStorage.
   ========================================================================== */

(function () {
  'use strict';

  var TASK_STORAGE_KEY = 'cline-todo.tasks.v1';
  var THEME_STORAGE_KEY = 'cline-todo.theme';
  var MAX_LENGTH = 200;
  var FILTERS = ['all', 'active', 'completed'];

  /* ------------------------------------------------------------------ state */

  var state = {
    tasks: [],      // [{ id, text, completed, createdAt, updatedAt }]
    filter: 'all',
    editingId: null // id of the task currently being renamed
  };

  var elements = {
    form: document.getElementById('todo-form'),
    input: document.getElementById('todo-input'),
    inputError: document.getElementById('input-error'),
    list: document.getElementById('todo-list'),
    itemTemplate: document.getElementById('todo-item-template'),
    emptyState: document.getElementById('empty-state'),
    statusLine: document.getElementById('status-line'),
    progress: document.getElementById('progress'),
    progressBar: document.getElementById('progress-bar'),
    filters: document.getElementById('filters'),
    toggleAll: document.getElementById('toggle-all'),
    clearCompleted: document.getElementById('clear-completed'),
    themeToggle: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    themeLabel: document.getElementById('theme-label'),
    liveRegion: document.getElementById('live-region')
  };

  /* -------------------------------------------------------------- utilities */

  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null; // storage blocked (private mode, disabled cookies, ...)
    }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function makeId() {
    return 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function closestElement(node, selector) {
    while (node && node.nodeType === 1) {
      if (typeof node.matches === 'function' && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function findTask(id) {
    for (var index = 0; index < state.tasks.length; index += 1) {
      if (state.tasks[index].id === id) return state.tasks[index];
    }
    return null;
  }

  function matchesFilter(task) {
    if (state.filter === 'active') return !task.completed;
    if (state.filter === 'completed') return task.completed;
    return true;
  }

  function visibleTasks() {
    return state.tasks.filter(matchesFilter);
  }

  function countCompleted() {
    var total = 0;
    for (var index = 0; index < state.tasks.length; index += 1) {
      if (state.tasks[index].completed) total += 1;
    }
    return total;
  }

  function announce(message) {
    if (!elements.liveRegion) return;
    elements.liveRegion.textContent = '';
    window.setTimeout(function () {
      elements.liveRegion.textContent = message;
    }, 40);
  }

  /* ------------------------------------------------------------ persistence */

  function normalizeTask(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var text = typeof raw.text === 'string' ? raw.text.trim().slice(0, MAX_LENGTH) : '';
    if (!text) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
      text: text,
      completed: raw.completed === true,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : null
    };
  }

  function loadState() {
    var raw = readRaw(TASK_STORAGE_KEY);
    if (!raw) return;

    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      parsed = null; // corrupt payload — start from an empty list instead of crashing
    }
    if (!parsed) return;

    var tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
    if (Array.isArray(tasks)) {
      state.tasks = tasks.map(normalizeTask).filter(Boolean);
    }

    var savedFilter = Array.isArray(parsed) ? null : parsed.filter;
    if (FILTERS.indexOf(savedFilter) !== -1) state.filter = savedFilter;
  }

  function persist() {
    writeRaw(
      TASK_STORAGE_KEY,
      JSON.stringify({ version: 1, filter: state.filter, tasks: state.tasks })
    );
  }

  /* --------------------------------------------------------------- rendering */

  function buildStatusLine(total, active) {
    if (total === 0) return 'Nothing on your list yet.';
    if (active === 0) return 'All ' + total + (total === 1 ? ' task is' : ' tasks are') + ' complete. Nice work!';
    return active + (active === 1 ? ' task left' : ' tasks left') + ' of ' + total + '.';
  }

  function buildEmptyMessage() {
    if (state.tasks.length === 0) return 'Your list is empty. Add your first task above.';
    if (state.filter === 'active') return 'No active tasks — everything is done!';
    if (state.filter === 'completed') return 'Nothing completed yet. Check off a task to see it here.';
    return 'No tasks to show.';
  }

  function setProgress(percent) {
    if (!elements.progressBar || !elements.progress) return;
    elements.progressBar.style.width = percent + '%';
    elements.progress.setAttribute('aria-valuenow', String(percent));
  }

  function setCount(name, value) {
    var target = elements.filters ? elements.filters.querySelector('[data-count="' + name + '"]') : null;
    if (target) target.textContent = String(value);
  }

  function itemElement(id) {
    var items = elements.list ? elements.list.children : [];
    for (var index = 0; index < items.length; index += 1) {
      if (items[index].dataset && items[index].dataset.id === id) return items[index];
    }
    return null;
  }

  function createItem(task) {
    var templateContent = elements.itemTemplate.content || elements.itemTemplate;
    var node = templateContent.firstElementChild.cloneNode(true);
    var isEditing = state.editingId === task.id;

    node.dataset.id = task.id;
    if (task.completed) node.classList.add('is-complete');
    if (isEditing) node.classList.add('is-editing');

    var toggle = node.querySelector('.todo-item__toggle');
    toggle.checked = task.completed;
    toggle.setAttribute(
      'aria-label',
      (task.completed ? 'Mark as active: ' : 'Mark as complete: ') + task.text
    );

    var label = node.querySelector('.todo-item__label');
    label.textContent = task.text;
    label.title = 'Double-click to edit';

    node.querySelector('.todo-item__edit').value = task.text;

    var editButton = node.querySelector('[data-action="edit"]');
    editButton.setAttribute('aria-label', 'Edit task: ' + task.text);
    var deleteButton = node.querySelector('[data-action="delete"]');
    deleteButton.setAttribute('aria-label', 'Delete task: ' + task.text);

    return node;
  }

  function focusEditInput(id) {
    var item = itemElement(id);
    if (!item) return;
    var field = item.querySelector('.todo-item__edit');
    if (!field) return;
    field.focus();
    if (typeof field.setSelectionRange === 'function') {
      var end = field.value.length;
      field.setSelectionRange(end, end);
    }
  }

  function focusItem(id) {
    var item = itemElement(id);
    if (item) item.focus();
  }

  function render() {
    var total = state.tasks.length;
    var completed = countCompleted();
    var active = total - completed;

    elements.statusLine.textContent = buildStatusLine(total, active);
    setProgress(total === 0 ? 0 : Math.round((completed / total) * 100));
    setCount('all', total);
    setCount('active', active);
    setCount('completed', completed);

    elements.toggleAll.disabled = total === 0;
    elements.toggleAll.checked = total > 0 && active === 0;
    elements.toggleAll.indeterminate = active > 0 && completed > 0;
    elements.clearCompleted.disabled = completed === 0;

    var filterButtons = elements.filters.querySelectorAll('.filter');
    for (var index = 0; index < filterButtons.length; index += 1) {
      var button = filterButtons[index];
      var isActive = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    elements.list.textContent = '';
    var visible = visibleTasks();
    for (var itemIndex = 0; itemIndex < visible.length; itemIndex += 1) {
      elements.list.appendChild(createItem(visible[itemIndex]));
    }

    elements.emptyState.hidden = visible.length > 0;
    elements.emptyState.textContent = buildEmptyMessage();

    if (state.editingId && !findTask(state.editingId)) state.editingId = null;
    if (state.editingId) focusEditInput(state.editingId);
  }

  /* --------------------------------------------------------------- actions */

  function addTask(text) {
    state.tasks.push({
      id: makeId(),
      text: text,
      completed: false,
      createdAt: Date.now(),
      updatedAt: null
    });
    // A brand new task is active, so make sure it is visible in the current view.
    if (state.filter === 'completed') state.filter = 'all';
    state.editingId = null;
    persist();
    render();
    announce('Added "' + text + '".');
  }

  function toggleTask(id) {
    var task = findTask(id);
    if (!task) return;
    task.completed = !task.completed;
    task.updatedAt = Date.now();
    persist();
    render();
    var item = itemElement(id);
    if (item) {
      var toggle = item.querySelector('.todo-item__toggle');
      if (toggle) toggle.focus();
    }
    announce(task.text + (task.completed ? ' marked complete.' : ' marked active.'));
  }

  function removeTask(id) {
    var task = findTask(id);
    if (!task) return;
    var indexInView = visibleTasks().indexOf(task);

    state.tasks = state.tasks.filter(function (candidate) {
      return candidate.id !== id;
    });
    if (state.editingId === id) state.editingId = null;

    persist();
    render();

    // Keep keyboard users in the list instead of dropping focus on <body>.
    var items = elements.list.querySelectorAll('.todo-item');
    if (items.length === 0) {
      elements.input.focus();
    } else {
      var nextIndex = indexInView < 0 ? 0 : Math.min(indexInView, items.length - 1);
      items[nextIndex].focus();
    }
    announce('Deleted "' + task.text + '".');
  }

  function startEdit(id) {
    if (!findTask(id)) return;
    state.editingId = id;
    render();
  }

  function commitEdit(field) {
    var item = closestElement(field, '.todo-item');
    var id = item && item.dataset ? item.dataset.id : null;
    if (!id || state.editingId !== id) return;

    var task = findTask(id);
    var text = String(field.value).trim().slice(0, MAX_LENGTH);
    state.editingId = null;

    if (!task) {
      render();
      return;
    }

    if (!text) {
      render();
      focusItem(id);
      announce('Task left unchanged — a task needs some text.');
      return;
    }

    if (text !== task.text) {
      task.text = text;
      task.updatedAt = Date.now();
      persist();
      announce('Renamed to "' + text + '".');
    }

    render();
    focusItem(id);
  }

  function cancelEdit(field) {
    var item = closestElement(field, '.todo-item');
    var id = item && item.dataset ? item.dataset.id : null;
    if (!id || state.editingId !== id) return;
    state.editingId = null;
    render();
    focusItem(id);
    announce('Edit cancelled.');
  }

  // Commit whatever rename is in flight, e.g. before another row is touched.
  function commitActiveEdit() {
    if (!state.editingId) return;
    var item = itemElement(state.editingId);
    var field = item ? item.querySelector('.todo-item__edit') : null;
    if (field) {
      commitEdit(field);
    } else {
      state.editingId = null;
    }
  }

  function setAllCompleted(completed) {
    if (state.tasks.length === 0) return;
    var changed = 0;
    state.tasks.forEach(function (task) {
      if (task.completed !== completed) {
        task.completed = completed;
        task.updatedAt = Date.now();
        changed += 1;
      }
    });
    if (changed === 0) return;
    persist();
    render();
    announce(completed ? 'All tasks marked complete.' : 'All tasks marked active.');
  }

  function clearCompleted() {
    var completed = state.tasks.filter(function (task) {
      return task.completed;
    });
    if (completed.length === 0) return;

    state.tasks = state.tasks.filter(function (task) {
      return !task.completed;
    });
    state.editingId = null;
    persist();
    render();
    announce('Cleared ' + completed.length + (completed.length === 1 ? ' completed task.' : ' completed tasks.'));
  }

  function setFilter(filter) {
    if (FILTERS.indexOf(filter) === -1 || state.filter === filter) return;
    state.filter = filter;
    state.editingId = null;
    persist();
    render();
    announce('Showing ' + filter + ' tasks.');
  }

  /* ------------------------------------------------------------------ theme */

  function applyTheme(theme) {
    var isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (elements.themeToggle) {
      elements.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    }
    if (elements.themeIcon) elements.themeIcon.textContent = isDark ? '☀️' : '🌙';
    if (elements.themeLabel) {
      elements.themeLabel.textContent = isDark ? 'Switch to light theme' : 'Switch to dark theme';
    }
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    writeRaw(THEME_STORAGE_KEY, next);
  }

  /* ----------------------------------------------------------------- events */

  function showInputError(message) {
    elements.inputError.textContent = message;
    elements.inputError.hidden = false;
    elements.input.setAttribute('aria-invalid', 'true');
  }

  function clearInputError() {
    if (elements.inputError.hidden) return;
    elements.inputError.textContent = '';
    elements.inputError.hidden = true;
    elements.input.removeAttribute('aria-invalid');
  }

  function bindEvents() {
    elements.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = elements.input.value.trim().slice(0, MAX_LENGTH);
      if (!text) {
        showInputError('Please type a task before adding it.');
        elements.input.focus();
        return;
      }
      clearInputError();
      addTask(text);
      elements.input.value = '';
      elements.input.focus();
    });

    elements.input.addEventListener('input', clearInputError);
    elements.input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && elements.input.value !== '') {
        elements.input.value = '';
        clearInputError();
      }
    });

    // Row buttons should not steal focus while a rename is in progress: a focus
    // change would commit the edit and replace the node the click is aimed at.
    elements.list.addEventListener('mousedown', function (event) {
      if (closestElement(event.target, '.todo-item__actions') || closestElement(event.target, '.checkbox')) {
        event.preventDefault();
      }
    });

    elements.list.addEventListener('click', function (event) {
      var item = closestElement(event.target, '.todo-item');
      var itemId = item && item.dataset ? item.dataset.id : null;

      // Any click inside the list means the user moved on from a pending rename.
      if (state.editingId && state.editingId !== itemId) commitActiveEdit();
      if (!item) return;

      var actionButton = closestElement(event.target, '[data-action]');
      if (!actionButton) return;

      if (actionButton.dataset.action === 'edit') {
        startEdit(itemId);
      } else if (actionButton.dataset.action === 'delete') {
        removeTask(itemId);
      }
    });

    elements.list.addEventListener('dblclick', function (event) {
      var label = closestElement(event.target, '.todo-item__label');
      var item = label ? closestElement(label, '.todo-item') : null;
      if (item) startEdit(item.dataset.id);
    });

    elements.list.addEventListener('change', function (event) {
      var checkbox = closestElement(event.target, '.todo-item__toggle');
      var item = checkbox ? closestElement(checkbox, '.todo-item') : null;
      if (!item) return;
      var id = item.dataset.id;
      if (state.editingId && state.editingId !== id) commitActiveEdit();
      toggleTask(id);
    });

    elements.list.addEventListener('keydown', function (event) {
      var field = closestElement(event.target, '.todo-item__edit');
      if (!field) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(field);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit(field);
      }
    });

    // Leaving a rename field (tab, click elsewhere) saves it.
    elements.list.addEventListener('focusout', function (event) {
      var field = closestElement(event.target, '.todo-item__edit');
      if (field) commitEdit(field);
    });

    elements.filters.addEventListener('click', function (event) {
      var button = closestElement(event.target, '[data-filter]');
      if (button) setFilter(button.dataset.filter);
    });

    elements.toggleAll.addEventListener('change', function () {
      setAllCompleted(elements.toggleAll.checked);
    });

    elements.clearCompleted.addEventListener('click', clearCompleted);

    if (elements.themeToggle) elements.themeToggle.addEventListener('click', toggleTheme);

    // Keep other tabs showing the same app in sync.
    window.addEventListener('storage', function (event) {
      if (event.key !== TASK_STORAGE_KEY && event.key !== null) return;
      state.tasks = [];
      state.filter = 'all';
      state.editingId = null;
      loadState();
      render();
    });
  }

  /* ------------------------------------------------------------------- boot */

  function init() {
    if (!elements.form || !elements.list || !elements.itemTemplate) return;
    loadState();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    bindEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
