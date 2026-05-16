const STORAGE_KEY = "neta-yarden-todo-v1";
const APP_LINK = "https://ysalvi-commits.github.io/Home/neta-yarden-todo/";
const RECIPIENTS = ["yardensalvi@gmail.com", "barakneta1@gmail.com"];
const EMAIL_ENDPOINT = window.TODO_EMAIL_ENDPOINT || "";

const people = {
  yarden: "ירדן",
  neta: "נטע"
};

const state = loadState();
const elements = {
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  summaryText: document.querySelector("#summaryText"),
  shareButton: document.querySelector("#shareButton"),
  toast: document.querySelector("#toast")
};

render();
bindEvents();
registerServiceWorker();

function bindEvents() {
  elements.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTask();
  });

  elements.taskList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-task-id][data-person]");
    if (!checkbox) return;
    markTask(checkbox.dataset.taskId, checkbox.dataset.person, checkbox.checked);
  });

  elements.taskList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-confirm-id]");
    if (!button) return;
    confirmTask(button.dataset.confirmId);
  });

  elements.shareButton.addEventListener("click", shareApp);
}

function loadState() {
  const saved = readJson(localStorage.getItem(STORAGE_KEY));
  if (saved?.tasks) {
    return {
      tasks: saved.tasks.map(normalizeTask).filter(Boolean),
      updatedAt: saved.updatedAt || new Date().toISOString()
    };
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
    checkedBy: Array.isArray(task.checkedBy) ? task.checkedBy.filter((person) => people[person]) : []
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
    checkedBy: []
  };

  state.tasks.unshift(task);
  elements.taskInput.value = "";
  saveState();
  render();
  notifyTaskAdded(task);
  toast("המשימה נוספה.");
}

function markTask(taskId, person, checked) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || !people[person]) return;

  const checkedBy = new Set(task.checkedBy);
  if (checked) checkedBy.add(person);
  else checkedBy.delete(person);
  task.checkedBy = [...checkedBy];

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
  const checkedNames = task.checkedBy.map((person) => people[person]).join(" ו");
  const needsConfirm = task.checkedBy.length > 0;

  return `
    <article class="task-item ${needsConfirm ? "is-pending-confirm" : ""}">
      <div class="task-title">
        <strong>${escapeHtml(task.title)}</strong>
      </div>
      <div class="completion-row" aria-label="סימון השלמה">
        ${renderPersonCheck(task, "yarden")}
        ${renderPersonCheck(task, "neta")}
      </div>
      <div class="confirm-row">
        <span>${escapeHtml(`${checkedNames || "מישהו"} סימן/ה שבוצע`)}</span>
        <button class="confirm-button" type="button" data-confirm-id="${escapeHtml(task.id)}">אישור וסיום</button>
      </div>
    </article>
  `;
}

function renderPersonCheck(task, person) {
  const checked = task.checkedBy.includes(person);
  return `
    <label>
      <input type="checkbox" data-task-id="${escapeHtml(task.id)}" data-person="${person}" ${checked ? "checked" : ""} />
      <span class="check-ui" aria-hidden="true"></span>
      <span>${people[person]}</span>
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
  const subject = "נוספה משימת To Do";
  const body = [
    "נוספה משימת To Do חדשה:",
    "",
    task.title,
    "",
    "לפתיחת האפליקציה:",
    APP_LINK
  ].join("\n");

  return {
    to: RECIPIENTS,
    subject,
    body,
    appLink: APP_LINK,
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
  const shareData = {
    title: "To Do - נטע וירדן",
    text: "הרשימה שלנו",
    url: APP_LINK
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
    await navigator.clipboard.writeText(APP_LINK);
    toast("הלינק הועתק.");
  } catch {
    toast(APP_LINK);
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

function readJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
