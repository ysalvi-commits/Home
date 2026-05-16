const STORAGE_KEY = "neta-yarden-todo-v1";
const EMAIL_PREF_KEY = "neta-yarden-todo-send-email-v1";
const USER_NAME_KEY = "neta-yarden-todo-user-name-v1";
const APP_LINK = "https://ysalvi-commits.github.io/Home/neta-yarden-todo/";
const RECIPIENTS = ["yardensalvi@gmail.com", "barakneta1@gmail.com"];
const EMAIL_ENDPOINT = window.TODO_EMAIL_ENDPOINT || "";
const SHARE_HASH_PREFIX = "#tasks=";
const PULL_REFRESH_THRESHOLD = 82;

const uiState = {
  activeTab: "open",
  editingTaskId: "",
  swipe: null,
  refresh: null
};

const state = loadState();
const elements = {
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  userNameInput: document.querySelector("#userNameInput"),
  taskList: document.querySelector("#taskList"),
  taskListTitle: document.querySelector("#taskListTitle"),
  taskCount: document.querySelector("#taskCount"),
  newTaskBadge: document.querySelector("#newTaskBadge"),
  summaryText: document.querySelector("#summaryText"),
  sendEmailToggle: document.querySelector("#sendEmailToggle"),
  openTab: document.querySelector("#openTab"),
  doneTab: document.querySelector("#doneTab"),
  shareButton: document.querySelector("#shareButton"),
  pullRefresh: document.querySelector("#pullRefresh"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsBackdrop: document.querySelector("#settingsBackdrop"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  snailParty: document.querySelector("#snailParty"),
  toast: document.querySelector("#toast")
};

elements.sendEmailToggle.checked = readEmailPreference();
elements.userNameInput.value = readUserName();
render();
bindEvents();
registerServiceWorker();

function bindEvents() {
  elements.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTask();
  });

  elements.userNameInput.addEventListener("input", () => {
    localStorage.setItem(USER_NAME_KEY, elements.userNameInput.value.trim());
  });

  elements.taskList.addEventListener("pointerdown", startSwipe);
  window.addEventListener("pointermove", moveSwipe);
  window.addEventListener("pointerup", endSwipe);
  window.addEventListener("pointercancel", cancelSwipe);
  window.addEventListener("pointerdown", startPullRefresh);
  window.addEventListener("pointermove", movePullRefresh, { passive: false });
  window.addEventListener("pointerup", endPullRefresh);
  window.addEventListener("pointercancel", cancelPullRefresh);

  elements.taskList.addEventListener("click", (event) => {
    if (uiState.swipe?.completed) {
      event.preventDefault();
      return;
    }

    const editButton = closestElement(event.target, "button[data-edit-id]");
    if (editButton) {
      startEditingTask(editButton.dataset.editId);
      return;
    }

    const cancelButton = closestElement(event.target, "button[data-cancel-edit-id]");
    if (cancelButton) {
      cancelEditingTask();
      return;
    }

    const saveButton = closestElement(event.target, "button[data-save-edit-id]");
    if (saveButton) {
      saveEditedTask(saveButton.dataset.saveEditId);
      return;
    }

    const removeButton = closestElement(event.target, "button[data-remove-id]");
    if (removeButton) {
      removeTask(removeButton.dataset.removeId);
    }
  });

  elements.taskList.addEventListener("keydown", (event) => {
    const input = closestElement(event.target, "input[data-edit-input-id]");
    if (!input) return;

    if (event.key === "Enter") {
      event.preventDefault();
      saveEditedTask(input.dataset.editInputId);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditingTask();
    }
  });

  elements.openTab.addEventListener("click", () => setActiveTab("open"));
  elements.doneTab.addEventListener("click", () => setActiveTab("done"));
  elements.shareButton.addEventListener("click", shareApp);
  elements.sendEmailToggle.addEventListener("change", () => {
    localStorage.setItem(EMAIL_PREF_KEY, elements.sendEmailToggle.checked ? "true" : "false");
  });

  elements.settingsButton.addEventListener("click", openSettings);
  elements.settingsBackdrop.addEventListener("click", closeSettings);
  elements.closeSettingsButton.addEventListener("click", closeSettings);
  elements.saveSettingsButton.addEventListener("click", () => {
    localStorage.setItem(USER_NAME_KEY, elements.userNameInput.value.trim());
    closeSettings();
    toast("User name saved.");
  });
}

function loadState() {
  const saved = readJson(localStorage.getItem(STORAGE_KEY));
  const shared = readSharedState();
  const savedSnapshot = normalizeSnapshot(saved);
  const sharedSnapshot = normalizeSnapshot(shared);

  if (sharedSnapshot.tasks.length || sharedSnapshot.completedTasks.length) {
    const snapshot = mergeSnapshots(sharedSnapshot, savedSnapshot);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  }

  if (savedSnapshot.tasks.length || savedSnapshot.completedTasks.length) return savedSnapshot;

  return {
    tasks: [],
    completedTasks: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot) {
    return { tasks: [], completedTasks: [], updatedAt: new Date().toISOString() };
  }

  return {
    tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks.map(normalizeTask).filter(Boolean) : [],
    completedTasks: Array.isArray(snapshot.completedTasks)
      ? snapshot.completedTasks.map(normalizeCompletedTask).filter(Boolean)
      : [],
    updatedAt: snapshot.updatedAt || new Date().toISOString()
  };
}

function normalizeTask(task) {
  const title = String(task?.title || "").trim();
  if (!title) return null;

  return {
    id: String(task.id || newId()),
    title,
    completed: Boolean(task.completed || task.checked || task.done || (Array.isArray(task.checkedBy) && task.checkedBy.length))
  };
}

function normalizeCompletedTask(task) {
  const title = String(task?.title || "").trim();
  if (!title) return null;

  return {
    id: String(task.id || newId()),
    title,
    doneBy: String(task.doneBy || task.completedBy || task.finishedBy || "Someone").trim(),
    doneAt: task.doneAt || task.completedAt || task.finishedAt || new Date().toISOString()
  };
}

function addTask() {
  const title = elements.taskInput.value.trim();
  if (!title) {
    toast("Add a task first.");
    return;
  }

  const task = {
    id: newId(),
    title,
    completed: false
  };

  state.tasks.unshift(task);
  elements.taskInput.value = "";
  saveState();
  render();

  if (elements.sendEmailToggle.checked) {
    notifyTaskAdded(task);
    toast("Task added. Email is ready.");
  } else {
    toast("Task added without email.");
  }
}

function finishTask(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return;

  const [task] = state.tasks.splice(index, 1);
  state.completedTasks.unshift({
    id: newId(),
    title: task.title,
    doneBy: readUserName() || "Someone",
    doneAt: new Date().toISOString()
  });

  uiState.editingTaskId = "";
  uiState.activeTab = "done";
  saveState();
  render();
  celebrateSnails();
  toast("Achievement unlocked.");
}

function removeTask(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return;

  state.tasks.splice(index, 1);
  if (uiState.editingTaskId === taskId) uiState.editingTaskId = "";
  saveState();
  render();
  toast("Task removed.");
}

function startEditingTask(taskId) {
  if (!findTask(taskId)) return;
  uiState.editingTaskId = taskId;
  renderTasks();
  const input = elements.taskList.querySelector(`input[data-edit-input-id="${cssEscape(taskId)}"]`);
  input?.focus();
  input?.select();
}

function cancelEditingTask() {
  uiState.editingTaskId = "";
  renderTasks();
}

function saveEditedTask(taskId) {
  const task = findTask(taskId);
  const input = elements.taskList.querySelector(`input[data-edit-input-id="${cssEscape(taskId)}"]`);
  const title = input?.value.trim() || "";

  if (!task || !input) return;
  if (!title) {
    toast("Task cannot be empty.");
    input.focus();
    return;
  }

  task.title = title;
  uiState.editingTaskId = "";
  saveState();
  render();
  toast("Task updated.");
}

function findTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function setActiveTab(tab) {
  uiState.activeTab = tab === "done" ? "done" : "open";
  uiState.editingTaskId = "";
  render();
}

function startSwipe(event) {
  const row = closestElement(event.target, ".swipe-task");
  if (!row || closestElement(event.target, "button, input")) return;
  if (typeof event.button === "number" && event.button !== 0) return;

  const content = row.querySelector(".task-content");
  uiState.swipe = {
    id: row.dataset.taskId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    row,
    content,
    dragging: false,
    completed: false
  };

  try {
    row.setPointerCapture?.(event.pointerId);
  } catch {
    // Some browsers only allow pointer capture on the original target.
  }
}

function moveSwipe(event) {
  const swipe = uiState.swipe;
  if (!swipe || swipe.completed) return;

  const deltaX = event.clientX - swipe.startX;
  const deltaY = event.clientY - swipe.startY;
  if (!swipe.dragging && Math.abs(deltaX) < 9) return;
  if (!swipe.dragging && Math.abs(deltaY) > Math.abs(deltaX) * 1.1) {
    cancelSwipe();
    return;
  }

  swipe.dragging = true;
  swipe.lastX = event.clientX;
  const movement = Math.max(-136, Math.min(136, deltaX));
  swipe.row.classList.toggle("is-swipe-ready", Math.abs(deltaX) > 86);
  swipe.content.style.transform = `translateX(${movement}px)`;
  event.preventDefault();
}

function endSwipe(event) {
  const swipe = uiState.swipe;
  if (!swipe) return;

  const endX = typeof event?.clientX === "number" ? event.clientX : swipe.lastX;
  const deltaX = endX - swipe.startX;
  if (swipe.dragging && Math.abs(deltaX) > 96) {
    swipe.completed = true;
    finishTask(swipe.id);
    uiState.swipe = null;
    return;
  }

  resetSwipe(swipe);
  uiState.swipe = null;
}

function cancelSwipe() {
  if (uiState.swipe) resetSwipe(uiState.swipe);
  uiState.swipe = null;
}

function resetSwipe(swipe) {
  swipe.row.classList.remove("is-swipe-ready");
  swipe.content.style.transform = "";
}

function openSettings() {
  elements.userNameInput.value = readUserName();
  elements.settingsPanel.hidden = false;
  requestAnimationFrame(() => {
    elements.settingsPanel.classList.add("is-open");
    elements.userNameInput.focus();
    elements.userNameInput.select();
  });
}

function closeSettings() {
  elements.settingsPanel.classList.remove("is-open");
  window.setTimeout(() => {
    elements.settingsPanel.hidden = true;
  }, 180);
}

function startPullRefresh(event) {
  if (window.scrollY > 2 || event.clientY > 180) return;
  if (closestElement(event.target, "button, input, textarea, .swipe-task, .settings-panel")) return;

  uiState.refresh = {
    startY: event.clientY,
    active: false,
    ready: false,
    refreshing: false
  };
}

function movePullRefresh(event) {
  const refresh = uiState.refresh;
  if (!refresh || refresh.refreshing) return;

  const deltaY = event.clientY - refresh.startY;
  if (deltaY <= 0) {
    cancelPullRefresh();
    return;
  }

  if (deltaY < 10) return;
  refresh.active = true;
  refresh.ready = deltaY >= PULL_REFRESH_THRESHOLD;
  const distance = Math.min(112, Math.round(deltaY * 0.68));
  elements.pullRefresh.style.setProperty("--pull-distance", `${distance}px`);
  elements.pullRefresh.textContent = refresh.ready ? "Release to refresh" : "Pull to refresh";
  elements.pullRefresh.classList.toggle("is-active", true);
  elements.pullRefresh.classList.toggle("is-ready", refresh.ready);
  event.preventDefault();
}

function endPullRefresh() {
  const refresh = uiState.refresh;
  if (!refresh) return;

  if (refresh.active && refresh.ready) {
    refresh.refreshing = true;
    refreshApp();
    return;
  }

  resetPullRefresh();
}

function cancelPullRefresh() {
  if (uiState.refresh?.refreshing) return;
  resetPullRefresh();
}

function resetPullRefresh() {
  uiState.refresh = null;
  elements.pullRefresh.classList.remove("is-active", "is-ready", "is-loading");
  elements.pullRefresh.style.setProperty("--pull-distance", "0px");
  elements.pullRefresh.textContent = "Pull to refresh";
}

function refreshApp() {
  elements.pullRefresh.textContent = "Refreshing";
  elements.pullRefresh.classList.add("is-active", "is-loading");
  elements.pullRefresh.style.setProperty("--pull-distance", "74px");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
  }

  window.setTimeout(() => {
    window.location.reload();
  }, 260);
}

function render() {
  renderSummary();
  renderTabs();
  renderTasks();
}

function renderSummary() {
  const count = state.tasks.length;
  const wins = state.completedTasks.length;
  elements.taskCount.textContent = String(count);
  elements.newTaskBadge.textContent = count > 99 ? "99+" : String(count);
  elements.newTaskBadge.hidden = count === 0;
  elements.summaryText.textContent = count
    ? `${count} open · ${wins} wins`
    : wins
      ? `No open tasks · ${wins} wins`
      : "No open tasks right now.";
  updateAppIconBadge(count);
}

function renderTabs() {
  elements.openTab.textContent = state.tasks.length ? `Open · ${state.tasks.length}` : "Open";
  elements.doneTab.textContent = state.completedTasks.length ? `Wins · ${state.completedTasks.length}` : "Wins";
  elements.openTab.classList.toggle("is-active", uiState.activeTab === "open");
  elements.doneTab.classList.toggle("is-active", uiState.activeTab === "done");
}

function renderTasks() {
  if (uiState.activeTab === "done") {
    elements.taskListTitle.textContent = "Wins";
    renderCompletedTasks();
    return;
  }

  elements.taskListTitle.textContent = "Our List";
  renderOpenTasks();
}

function renderOpenTasks() {
  if (!state.tasks.length) {
    elements.taskList.innerHTML = '<div class="empty-list">Add a new task above.</div>';
    return;
  }

  elements.taskList.innerHTML = state.tasks.map(renderTask).join("");
}

function renderCompletedTasks() {
  if (!state.completedTasks.length) {
    elements.taskList.innerHTML = '<div class="empty-list">Your wins will show up here.</div>';
    return;
  }

  elements.taskList.innerHTML = state.completedTasks.map(renderCompletedTask).join("");
}

function renderTask(task) {
  const isEditing = uiState.editingTaskId === task.id;

  return `
    <article class="task-item swipe-task" data-task-id="${escapeHtml(task.id)}">
      <div class="swipe-complete-bg" aria-hidden="true">Done</div>
      <div class="task-content">
        ${isEditing ? renderEditTaskTitle(task) : renderReadonlyTaskTitle(task)}
        <div class="swipe-cue" aria-hidden="true">
          <span class="swipe-arrows">← ← ←</span>
          <span>Swipe me to done</span>
          <span class="swipe-arrows">→ → →</span>
        </div>
      </div>
    </article>
  `;
}

function renderReadonlyTaskTitle(task) {
  return `
    <div class="task-title-row">
      <div class="task-title">
        <strong dir="auto">${escapeHtml(task.title)}</strong>
      </div>
      <div class="task-actions">
        <button class="task-edit-button" type="button" data-edit-id="${escapeHtml(task.id)}">Edit</button>
        <button class="task-remove-button" type="button" data-remove-id="${escapeHtml(task.id)}">Remove</button>
      </div>
    </div>
  `;
}

function renderEditTaskTitle(task) {
  return `
    <div class="task-edit-row">
      <input data-edit-input-id="${escapeHtml(task.id)}" dir="auto" value="${escapeHtml(task.title)}" aria-label="Edit task" />
      <div class="task-edit-actions">
        <button class="save-edit-button" type="button" data-save-edit-id="${escapeHtml(task.id)}">Save</button>
        <button class="cancel-edit-button" type="button" data-cancel-edit-id="${escapeHtml(task.id)}">Cancel</button>
      </div>
    </div>
  `;
}

function renderCompletedTask(task) {
  return `
    <article class="task-item completed-task">
      <div class="task-title">
        <strong dir="auto">${escapeHtml(task.title)}</strong>
        <small class="done-meta">${escapeHtml(`Completed by ${task.doneBy}`)} · ${escapeHtml(formatDateTime(task.doneAt))}</small>
      </div>
    </article>
  `;
}

async function notifyTaskAdded(task) {
  const payload = buildEmailPayload(task);

  if (EMAIL_ENDPOINT) {
    try {
      const response = await fetch(EMAIL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) return;
    } catch {
      // Fall through to mail compose.
    }
  }

  openMailDraft(payload);
}

function buildEmailPayload(task) {
  const appLink = getShareLink();
  const subject = "New To Do task added";
  const body = [
    "A new To Do task was added:",
    "",
    task.title,
    "",
    "Open the app:",
    appLink
  ].join("\n");

  return {
    to: RECIPIENTS,
    subject,
    body,
    appLink,
    taskTitle: task.title
  };
}

function openMailDraft(payload) {
  const mailto = `mailto:${payload.to.join(",")}?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.body)}`;

  window.setTimeout(() => {
    window.location.href = mailto;
  }, 250);
}

async function shareApp() {
  const appLink = getShareLink();
  const shareData = {
    title: "To Do - Neta and Yarden",
    text: "Our list",
    url: appLink
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch {
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(appLink);
    toast("Link copied.");
  } catch {
    toast(appLink);
  }
}

function saveState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getShareLink() {
  if (!state.tasks.length && !state.completedTasks.length) return APP_LINK;
  return `${APP_LINK}${SHARE_HASH_PREFIX}${encodeShareState({
    tasks: state.tasks,
    completedTasks: state.completedTasks,
    updatedAt: state.updatedAt
  })}`;
}

function readSharedState() {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return null;

  try {
    const snapshot = decodeShareState(window.location.hash.slice(SHARE_HASH_PREFIX.length));
    if (!snapshot?.tasks?.length && !snapshot?.completedTasks?.length) return null;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return snapshot;
  } catch {
    return null;
  }
}

function encodeShareState(snapshot) {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let value = "";
  bytes.forEach((byte) => {
    value += String.fromCharCode(byte);
  });
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeShareState(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function mergeSnapshots(primary, secondary) {
  const completedTasks = mergeCompletedTasks(primary.completedTasks, secondary.completedTasks);
  const completedTitles = new Set(completedTasks.map((task) => simplify(task.title)));
  const tasks = mergeOpenTasks(primary.tasks, secondary.tasks).filter((task) => !completedTitles.has(simplify(task.title)));

  return {
    tasks,
    completedTasks,
    updatedAt: primary.updatedAt || secondary.updatedAt || new Date().toISOString()
  };
}

function mergeOpenTasks(primaryTasks, secondaryTasks) {
  const merged = [];
  const byTitle = new Map();

  [...primaryTasks, ...secondaryTasks].forEach((task) => {
    const key = simplify(task.title);
    const existing = byTitle.get(key);
    if (existing) {
      existing.completed = existing.completed || task.completed;
      return;
    }

    const copy = { ...task };
    byTitle.set(key, copy);
    merged.push(copy);
  });

  return merged;
}

function mergeCompletedTasks(primaryTasks, secondaryTasks) {
  const merged = [];
  const seen = new Set();

  [...primaryTasks, ...secondaryTasks].forEach((task) => {
    const key = `${simplify(task.title)}-${task.doneAt}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ ...task });
  });

  return merged.sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
}

function readUserName() {
  return (localStorage.getItem(USER_NAME_KEY) || "").trim();
}

function celebrateSnails() {
  elements.snailParty.innerHTML = "";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = reducedMotion ? 12 : 42;
  const snails = ["🐌", "🐌🎉", "🐌✨", "🎊🐌"];

  for (let index = 0; index < count; index += 1) {
    const snail = document.createElement("span");
    snail.textContent = snails[index % snails.length];
    snail.style.setProperty("--x", `${Math.random() * 100}%`);
    snail.style.setProperty("--drift", `${Math.random() * 90 - 45}px`);
    snail.style.setProperty("--delay", `${Math.random() * 0.7}s`);
    snail.style.setProperty("--duration", `${2.2 + Math.random() * 1.2}s`);
    snail.style.setProperty("--size", `${24 + Math.random() * 28}px`);
    elements.snailParty.appendChild(snail);
  }

  elements.snailParty.classList.add("is-active");
  window.clearTimeout(celebrateSnails.timer);
  celebrateSnails.timer = window.setTimeout(() => {
    elements.snailParty.classList.remove("is-active");
    elements.snailParty.innerHTML = "";
  }, reducedMotion ? 1600 : 3200);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function simplify(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function readJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function readEmailPreference() {
  const saved = localStorage.getItem(EMAIL_PREF_KEY);
  return saved === null ? true : saved === "true";
}

function updateAppIconBadge(count) {
  if (count > 0 && "setAppBadge" in navigator) {
    navigator.setAppBadge(count).catch(() => undefined);
    return;
  }

  if (count === 0 && "clearAppBadge" in navigator) {
    navigator.clearAppBadge().catch(() => undefined);
  }
}

function closestElement(target, selector) {
  const element = target instanceof Element ? target : target?.parentElement;
  return element?.closest(selector) || null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2400);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => undefined);
  });
}
