const STORAGE_KEY = "neta-yarden-todo-v1";
const EMAIL_PREF_KEY = "neta-yarden-todo-send-email-v1";
const APP_LINK = "https://ysalvi-commits.github.io/Home/neta-yarden-todo/";
const RECIPIENTS = ["yardensalvi@gmail.com", "barakneta1@gmail.com"];
const EMAIL_ENDPOINT = window.TODO_EMAIL_ENDPOINT || "";
const SHARE_HASH_PREFIX = "#tasks=";

const uiState = {
  editingTaskId: ""
};

const state = loadState();
const elements = {
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  summaryText: document.querySelector("#summaryText"),
  sendEmailToggle: document.querySelector("#sendEmailToggle"),
  shareButton: document.querySelector("#shareButton"),
  toast: document.querySelector("#toast")
};

elements.sendEmailToggle.checked = readEmailPreference();
render();
bindEvents();
registerServiceWorker();

function bindEvents() {
  elements.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTask();
  });

  elements.taskList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-complete-id]");
    if (!checkbox) return;
    markTask(checkbox.dataset.completeId, checkbox.checked);
  });

  elements.taskList.addEventListener("click", (event) => {
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
    confirmTask(confirmButton.dataset.confirmId);
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

  elements.shareButton.addEventListener("click", shareApp);
  elements.sendEmailToggle.addEventListener("change", () => {
    localStorage.setItem(EMAIL_PREF_KEY, elements.sendEmailToggle.checked ? "true" : "false");
  });
}

function loadState() {
  const saved = readJson(localStorage.getItem(STORAGE_KEY));
  const shared = readSharedState();
  const savedTasks = saved?.tasks ? saved.tasks.map(normalizeTask).filter(Boolean) : [];
  const sharedTasks = shared?.tasks ? shared.tasks.map(normalizeTask).filter(Boolean) : [];

  if (savedTasks.length || sharedTasks.length) {
    const snapshot = {
      tasks: sharedTasks.length ? mergeTasks(sharedTasks, savedTasks) : savedTasks,
      updatedAt: shared?.updatedAt || saved?.updatedAt || new Date().toISOString()
    };

    if (sharedTasks.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  }

  return {
    tasks: [],
    updatedAt: new Date().toISOString()
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

function addTask() {
  const title = elements.taskInput.value.trim();
  if (!title) {
    toast("צריך לכתוב משימה.");
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
    toast("המשימה נוספה, מייל בהכנה.");
  } else {
    toast("המשימה נוספה ללא מייל.");
  }
}

function markTask(taskId, checked) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;

  task.completed = checked;

  saveState();
  render();
}

function confirmTask(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return;

  state.tasks.splice(index, 1);
  saveState();
  render();
  toast("המשימה אושרה ונמחקה.");
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
  if (!state.tasks.some((task) => task.id === taskId)) return;
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
  const task = state.tasks.find((candidate) => candidate.id === taskId);
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

function render() {
  renderSummary();
  renderTasks();
}

function renderSummary() {
  const count = state.tasks.length;
  elements.taskCount.textContent = String(count);
  elements.summaryText.textContent = count
    ? count === 1
      ? "יש משימה אחת שמחכה לאישור."
      : `${count} משימות מחכות לאישור.`
    : "אין כרגע משימות פתוחות.";
}

function renderTasks() {
  if (!state.tasks.length) {
    elements.taskList.innerHTML = '<div class="empty-list">אפשר להוסיף משימה חדשה למעלה.</div>';
    return;
  }

  elements.taskList.innerHTML = state.tasks.map(renderTask).join("");
}

function renderTask(task) {
  const needsConfirm = task.completed;
  const isEditing = uiState.editingTaskId === task.id;

  return `
    <article class="task-item ${needsConfirm ? "is-pending-confirm" : ""}">
      ${isEditing ? renderEditTaskTitle(task) : renderReadonlyTaskTitle(task)}
      <div class="completion-row" aria-label="סימון השלמה">
        ${renderCompletionCheck(task)}
      </div>
      <div class="confirm-row">
        <span>סומן כבוצע</span>
        <button class="confirm-button" type="button" data-confirm-id="${escapeHtml(task.id)}">אישור וסיום</button>
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

function renderCompletionCheck(task) {
  return `
    <label>
      <input type="checkbox" data-complete-id="${escapeHtml(task.id)}" ${task.completed ? "checked" : ""} />
      <span class="check-ui" aria-hidden="true"></span>
      <span>בוצע</span>
    </label>
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
  if (!state.tasks.length) return APP_LINK;
  return `${APP_LINK}${SHARE_HASH_PREFIX}${encodeShareState({ tasks: state.tasks, updatedAt: state.updatedAt })}`;
}

function readSharedState() {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return null;

  try {
    const snapshot = decodeShareState(window.location.hash.slice(SHARE_HASH_PREFIX.length));
    if (!snapshot?.tasks?.length) return null;
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

function mergeTasks(primaryTasks, secondaryTasks) {
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
