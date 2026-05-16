const STORAGE_KEY = "neta-yarden-todo-v1";
const EMAIL_PREF_KEY = "neta-yarden-todo-send-email-v1";
const USER_NAME_KEY = "neta-yarden-todo-user-name-v1";
const APP_LINK = "https://ysalvi-commits.github.io/Home/neta-yarden-todo/";
const RECIPIENTS = ["yardensalvi@gmail.com", "barakneta1@gmail.com"];
const EMAIL_ENDPOINT = window.TODO_EMAIL_ENDPOINT || "";
const SHARE_HASH_PREFIX = "#tasks=";

const STATUS_OPTIONS = [
  { id: "open", label: "פתוח" },
  { id: "progress", label: "בתהליך" },
  { id: "stuck", label: "תקוע" }
];
const STATUS_IDS = new Set(STATUS_OPTIONS.map((status) => status.id));

const uiState = {
  activeTab: "open",
  editingTaskId: ""
};

const state = loadState();
const elements = {
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  userNameInput: document.querySelector("#userNameInput"),
  taskList: document.querySelector("#taskList"),
  taskListTitle: document.querySelector("#taskListTitle"),
  taskCount: document.querySelector("#taskCount"),
  summaryText: document.querySelector("#summaryText"),
  sendEmailToggle: document.querySelector("#sendEmailToggle"),
  openTab: document.querySelector("#openTab"),
  doneTab: document.querySelector("#doneTab"),
  shareButton: document.querySelector("#shareButton"),
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

  elements.taskList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-complete-id]");
    if (!checkbox) return;
    markTask(checkbox.dataset.completeId, checkbox.checked);
  });

  elements.taskList.addEventListener("click", (event) => {
    const statusButton = event.target.closest("button[data-status-id]");
    if (statusButton) {
      setTaskStatus(statusButton.dataset.statusId, statusButton.dataset.statusValue);
      return;
    }

    const editButton = event.target.closest("button[data-edit-id]");
    if (editButton) {
      startEditingTask(editButton.dataset.editId);
      return;
    }

    const cancelButton = event.target.closest("button[data-cancel-edit-id]");
    if (cancelButton) {
      cancelEditingTask();
      return;
    }

    const saveButton = event.target.closest("button[data-save-edit-id]");
    if (saveButton) {
      saveEditedTask(saveButton.dataset.saveEditId);
      return;
    }

    const removeButton = event.target.closest("button[data-remove-id]");
    if (removeButton) {
      removeTask(removeButton.dataset.removeId);
      return;
    }

    const confirmButton = event.target.closest("button[data-confirm-id]");
    if (!confirmButton) return;
    finishTask(confirmButton.dataset.confirmId);
  });

  elements.taskList.addEventListener("keydown", (event) => {
    const input = event.target.closest("input[data-edit-input-id]");
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
    status: normalizeStatus(task.status),
    completed: Boolean(task.completed || task.checked || task.done || (Array.isArray(task.checkedBy) && task.checkedBy.length))
  };
}

function normalizeCompletedTask(task) {
  const title = String(task?.title || "").trim();
  if (!title) return null;

  return {
    id: String(task.id || newId()),
    title,
    status: normalizeStatus(task.status),
    doneBy: String(task.doneBy || task.completedBy || task.finishedBy || "ללא שם").trim(),
    doneAt: task.doneAt || task.completedAt || task.finishedAt || new Date().toISOString()
  };
}

function normalizeStatus(status) {
  const value = String(status || "open");
  return STATUS_IDS.has(value) ? value : "open";
}

function addTask() {
  const title = elements.taskInput.value.trim();
  if (!title) {
    toast("צריך לכתוב משימה.");
    return;
  }

  const task = {
    id: newId(),
    title,
    status: "open",
    completed: false
  };

  state.tasks.unshift(task);
  elements.taskInput.value = "";
  saveState();
  render();

  if (elements.sendEmailToggle.checked) {
    notifyTaskAdded(task);
    toast("המשימה נוספה, מייל בהכנה.");
  } else {
    toast("המשימה נוספה ללא מייל.");
  }
}

function markTask(taskId, checked) {
  const task = findTask(taskId);
  if (!task) return;

  task.completed = checked;
  saveState();
  render();
}

function setTaskStatus(taskId, status) {
  const task = findTask(taskId);
  if (!task) return;

  task.status = normalizeStatus(status);
  saveState();
  render();
}

function finishTask(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return;

  const [task] = state.tasks.splice(index, 1);
  state.completedTasks.unshift({
    id: newId(),
    title: task.title,
    status: task.status,
    doneBy: readUserName() || "ללא שם",
    doneAt: new Date().toISOString()
  });

  uiState.editingTaskId = "";
  uiState.activeTab = "done";
  saveState();
  render();
  celebrateSnails();
  toast("ניצחון קטן לרשימה.");
}

function removeTask(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return;

  state.tasks.splice(index, 1);
  if (uiState.editingTaskId === taskId) uiState.editingTaskId = "";
  saveState();
  render();
  toast("המשימה הוסרה.");
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
    toast("אי אפשר לשמור משימה ריקה.");
    input.focus();
    return;
  }

  task.title = title;
  uiState.editingTaskId = "";
  saveState();
  render();
  toast("המשימה עודכנה.");
}

function findTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function setActiveTab(tab) {
  uiState.activeTab = tab === "done" ? "done" : "open";
  uiState.editingTaskId = "";
  render();
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
  elements.summaryText.textContent = count
    ? `${count} פתוחות · ${wins} ניצחונות`
    : wins
      ? `אין פתוחות · ${wins} ניצחונות`
      : "אין כרגע משימות פתוחות.";
}

function renderTabs() {
  elements.openTab.textContent = state.tasks.length ? `פתוחות · ${state.tasks.length}` : "פתוחות";
  elements.doneTab.textContent = state.completedTasks.length ? `ניצחונות · ${state.completedTasks.length}` : "ניצחונות";
  elements.openTab.classList.toggle("is-active", uiState.activeTab === "open");
  elements.doneTab.classList.toggle("is-active", uiState.activeTab === "done");
}

function renderTasks() {
  if (uiState.activeTab === "done") {
    elements.taskListTitle.textContent = "ניצחונות";
    renderCompletedTasks();
    return;
  }

  elements.taskListTitle.textContent = "הרשימה שלנו";
  renderOpenTasks();
}

function renderOpenTasks() {
  if (!state.tasks.length) {
    elements.taskList.innerHTML = '<div class="empty-list">אפשר להוסיף משימה חדשה למעלה.</div>';
    return;
  }

  elements.taskList.innerHTML = state.tasks.map(renderTask).join("");
}

function renderCompletedTasks() {
  if (!state.completedTasks.length) {
    elements.taskList.innerHTML = '<div class="empty-list">כאן יופיעו הניצחונות שלכם.</div>';
    return;
  }

  elements.taskList.innerHTML = state.completedTasks.map(renderCompletedTask).join("");
}

function renderTask(task) {
  const needsConfirm = task.completed;
  const isEditing = uiState.editingTaskId === task.id;

  return `
    <article class="task-item ${needsConfirm ? "is-pending-confirm" : ""}">
      ${isEditing ? renderEditTaskTitle(task) : renderReadonlyTaskTitle(task)}
      ${renderStatusControls(task)}
      <div class="completion-row" aria-label="סימון השלמה">
        ${renderCompletionCheck(task)}
      </div>
      <div class="confirm-row">
        <span>סומן כבוצע</span>
        <button class="confirm-button" type="button" data-confirm-id="${escapeHtml(task.id)}">סיום וחגיגה</button>
      </div>
    </article>
  `;
}

function renderReadonlyTaskTitle(task) {
  return `
    <div class="task-title-row">
      <div class="task-title">
        <strong>${escapeHtml(task.title)}</strong>
      </div>
      <div class="task-actions">
        <button class="task-edit-button" type="button" data-edit-id="${escapeHtml(task.id)}">ערוך</button>
        <button class="task-remove-button" type="button" data-remove-id="${escapeHtml(task.id)}">הסר</button>
      </div>
    </div>
  `;
}

function renderEditTaskTitle(task) {
  return `
    <div class="task-edit-row">
      <input data-edit-input-id="${escapeHtml(task.id)}" value="${escapeHtml(task.title)}" aria-label="עריכת משימה" />
      <div class="task-edit-actions">
        <button class="save-edit-button" type="button" data-save-edit-id="${escapeHtml(task.id)}">שמור</button>
        <button class="cancel-edit-button" type="button" data-cancel-edit-id="${escapeHtml(task.id)}">ביטול</button>
      </div>
    </div>
  `;
}

function renderStatusControls(task) {
  return `
    <div class="status-row" aria-label="סטטוס">
      ${STATUS_OPTIONS.map(
        (status) => `
          <button
            type="button"
            data-status-id="${escapeHtml(task.id)}"
            data-status-value="${status.id}"
            class="status-chip status-${status.id} ${task.status === status.id ? "is-active" : ""}"
          >
            ${status.label}
          </button>
        `
      ).join("")}
    </div>
  `;
}

function renderCompletionCheck(task) {
  return `
    <label>
      <input type="checkbox" data-complete-id="${escapeHtml(task.id)}" ${task.completed ? "checked" : ""} />
      <span class="check-ui" aria-hidden="true"></span>
      <span>${task.completed ? "בוצע" : "סמן כבוצע"}</span>
    </label>
  `;
}

function renderCompletedTask(task) {
  return `
    <article class="task-item completed-task">
      <div class="task-title">
        <strong>${escapeHtml(task.title)}</strong>
        <small class="done-meta">${escapeHtml(`סיים/ה: ${task.doneBy}`)} · ${escapeHtml(formatDateTime(task.doneAt))}</small>
      </div>
      <span class="completed-status status-${task.status}">${escapeHtml(statusLabel(task.status))}</span>
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
  const subject = "נוספה משימת To Do";
  const body = [
    "נוספה משימת To Do חדשה:",
    "",
    task.title,
    "",
    "לפתיחת האפליקציה:",
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
    title: "To Do - נטע וירדן",
    text: "הרשימה שלנו",
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
    toast("הלינק הועתק.");
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
      if (existing.status === "open" && task.status !== "open") existing.status = task.status;
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

function statusLabel(status) {
  return STATUS_OPTIONS.find((candidate) => candidate.id === status)?.label || "פתוח";
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
  return new Intl.DateTimeFormat("he-IL", {
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
