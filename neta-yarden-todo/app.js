const STORAGE_KEY = "neta-yarden-todo-v1";
const EMAIL_PREF_KEY = "neta-yarden-todo-send-email-v1";
const USER_NAME_KEY = "neta-yarden-todo-user-name-v1";
const APP_LINK = "https://ysalvi-commits.github.io/Home/neta-yarden-todo/";
const RECIPIENTS = ["yardensalvi@gmail.com", "barakneta1@gmail.com"];
const EMAIL_ENDPOINT = window.TODO_EMAIL_ENDPOINT || "";
const SHARE_HASH_PREFIX = "#tasks=";
const PULL_REFRESH_THRESHOLD = 82;
const PULL_REFRESH_START_LIMIT = 220;
const AUTO_REFRESH_AFTER_HIDDEN_MS = 15_000;
const FIREBASE_SDK_VERSION = "12.7.0";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC8bUQPoGdfPoCAW1ixpdNH1IOODqE7tlw",
  authDomain: "neta-yarden-todo.firebaseapp.com",
  databaseURL: "https://neta-yarden-todo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "neta-yarden-todo",
  storageBucket: "neta-yarden-todo.firebasestorage.app",
  messagingSenderId: "909390695587",
  appId: "1:909390695587:web:ab3d56341cd3975fc34316"
};
const FIREBASE_LIST_PATH = "lists/neta-yarden";

const uiState = {
  activeTab: "open",
  editingTaskId: "",
  refresh: null,
  hiddenAt: 0
};

const syncState = {
  api: null,
  listRef: null,
  ready: false,
  firstSnapshot: true,
  localMigrationStarted: false,
  failed: false,
  pendingPatches: []
};

const state = loadState();
const elements = {
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  userNameInput: document.querySelector("#userNameInput"),
  taskList: document.querySelector("#taskList"),
  taskListTitle: document.querySelector("#taskListTitle"),
  newTaskBadge: document.querySelector("#newTaskBadge"),
  sendEmailToggle: document.querySelector("#sendEmailToggle"),
  openTab: document.querySelector("#openTab"),
  doneTab: document.querySelector("#doneTab"),
  pullRefresh: document.querySelector("#pullRefresh"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsBackdrop: document.querySelector("#settingsBackdrop"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  badgePermissionButton: document.querySelector("#badgePermissionButton"),
  badgePermissionText: document.querySelector("#badgePermissionText"),
  snailParty: document.querySelector("#snailParty"),
  toast: document.querySelector("#toast")
};

elements.sendEmailToggle.checked = readEmailPreference();
elements.userNameInput.value = readUserName();
render();
bindEvents();
registerServiceWorker();
updateBadgePermissionStatus();
initializeSharedBackend();

function bindEvents() {
  elements.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTask();
  });

  elements.userNameInput.addEventListener("input", () => {
    localStorage.setItem(USER_NAME_KEY, elements.userNameInput.value.trim());
  });

  window.addEventListener("pointerdown", startPullRefresh);
  window.addEventListener("pointermove", movePullRefresh, { passive: false });
  window.addEventListener("pointerup", endPullRefresh);
  window.addEventListener("pointercancel", cancelPullRefresh);
  window.addEventListener("touchstart", startPullRefresh, { passive: true });
  window.addEventListener("touchmove", movePullRefresh, { passive: false });
  window.addEventListener("touchend", endPullRefresh);
  window.addEventListener("touchcancel", cancelPullRefresh);
  document.addEventListener("visibilitychange", handleVisibilityRefresh);
  window.addEventListener("focus", handleFocusRefresh);

  elements.taskList.addEventListener("click", (event) => {
    const completeButton = closestElement(event.target, "button[data-complete-id]");
    if (completeButton) {
      finishTask(completeButton.dataset.completeId);
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
  elements.doneTab?.addEventListener("click", () => setActiveTab("done"));
  elements.sendEmailToggle.addEventListener("change", () => {
    localStorage.setItem(EMAIL_PREF_KEY, elements.sendEmailToggle.checked ? "true" : "false");
  });

  elements.settingsButton.addEventListener("click", openSettings);
  elements.settingsBackdrop.addEventListener("click", closeSettings);
  elements.closeSettingsButton.addEventListener("click", closeSettings);
  elements.badgePermissionButton.addEventListener("click", requestBadgePermission);
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
    tasks: collectionToArray(snapshot.tasks).map(normalizeTask).filter(Boolean).sort(sortTasks),
    completedTasks: collectionToArray(snapshot.completedTasks)
      .map(normalizeCompletedTask)
      .filter(Boolean)
      .sort(sortCompletedTasks),
    updatedAt: snapshot.updatedAt || new Date().toISOString()
  };
}

function normalizeTask(task) {
  const title = String(task?.title || "").trim();
  if (!title) return null;

  return {
    id: String(task.id || newId()),
    title,
    createdAt: task.createdAt || new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
    completed: false
  };

  state.tasks.unshift(task);
  elements.taskInput.value = "";
  saveState();
  render();
  writeTaskToRemote(task);

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
  const completedTask = {
    id: newId(),
    title: task.title,
    doneBy: readUserName() || "Someone",
    doneAt: new Date().toISOString()
  };
  state.completedTasks.unshift(completedTask);

  uiState.editingTaskId = "";
  uiState.activeTab = "open";
  saveState();
  render();
  completeTaskInRemote(task.id, completedTask);
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
  removeTaskFromRemote(taskId);
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
  updateTaskTitleInRemote(task);
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

function openSettings() {
  elements.userNameInput.value = readUserName();
  updateBadgePermissionStatus();
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
  const y = getPullClientY(event);
  if (!y && y !== 0) return;
  if (window.scrollY > 2 || y > PULL_REFRESH_START_LIMIT) return;
  if (closestElement(event.target, "button, input, textarea, .settings-panel")) return;

  uiState.refresh = {
    startY: y,
    startX: getPullClientX(event),
    active: false,
    ready: false,
    refreshing: false
  };
}

function movePullRefresh(event) {
  const refresh = uiState.refresh;
  if (!refresh || refresh.refreshing) return;

  const currentY = getPullClientY(event);
  const currentX = getPullClientX(event);
  if (!currentY && currentY !== 0) return;

  const deltaY = currentY - refresh.startY;
  const deltaX = Math.abs(currentX - refresh.startX);
  if (deltaY <= 0) {
    cancelPullRefresh();
    return;
  }

  if (!refresh.active && deltaX > deltaY * 0.8) {
    cancelPullRefresh();
    return;
  }

  if (deltaY < 10) return;
  refresh.active = true;
  refresh.ready = deltaY >= PULL_REFRESH_THRESHOLD;
  event.preventDefault();
}

function endPullRefresh() {
  const refresh = uiState.refresh;
  if (!refresh) return;
  if (refresh.refreshing) return;

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
  if (syncState.ready) {
    refreshFromRemote({ silent: true }).finally(() => {
      window.setTimeout(resetPullRefresh, 360);
    });
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
  }
  window.setTimeout(() => {
    window.location.reload();
  }, 260);
}

function getPullClientY(event) {
  if (typeof event.clientY === "number") return event.clientY;
  if (event.touches?.[0]) return event.touches[0].clientY;
  if (event.changedTouches?.[0]) return event.changedTouches[0].clientY;
  return null;
}

function getPullClientX(event) {
  if (typeof event.clientX === "number") return event.clientX;
  if (event.touches?.[0]) return event.touches[0].clientX;
  if (event.changedTouches?.[0]) return event.changedTouches[0].clientX;
  return 0;
}

function handleVisibilityRefresh() {
  if (document.visibilityState === "hidden") {
    uiState.hiddenAt = Date.now();
    return;
  }

  maybeAutoRefresh();
}

function handleFocusRefresh() {
  maybeAutoRefresh();
}

function maybeAutoRefresh() {
  if (!uiState.hiddenAt) return;
  if (Date.now() - uiState.hiddenAt < AUTO_REFRESH_AFTER_HIDDEN_MS) return;
  if (uiState.editingTaskId || elements.taskInput.value.trim()) return;
  if (syncState.ready) {
    refreshFromRemote({ silent: true });
    return;
  }
  refreshApp();
}

function render() {
  renderCounts();
  renderTabs();
  renderTasks();
}

function renderCounts() {
  const count = state.tasks.length;
  if (elements.newTaskBadge) {
    elements.newTaskBadge.textContent = count > 99 ? "99+" : String(count);
    elements.newTaskBadge.hidden = count === 0;
  }
  updateAppIconBadge(count);
  updateBadgePermissionStatus();
}

function renderTabs() {
  elements.openTab.textContent = state.tasks.length ? `Open · ${state.tasks.length}` : "Open";
  if (elements.doneTab) elements.doneTab.textContent = state.completedTasks.length ? `Wins · ${state.completedTasks.length}` : "Wins";
  elements.openTab.classList.toggle("is-active", uiState.activeTab === "open");
  elements.doneTab?.classList.toggle("is-active", uiState.activeTab === "done");
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
    <article class="task-item" data-task-id="${escapeHtml(task.id)}">
      ${isEditing ? renderEditTaskTitle(task) : renderReadonlyTaskTitle(task)}
    </article>
  `;
}

function renderReadonlyTaskTitle(task) {
  return `
    <div class="task-title-row">
      <button class="task-complete-button" type="button" data-complete-id="${escapeHtml(task.id)}" aria-label="Complete task"></button>
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

function saveState({ refreshUpdatedAt = true } = {}) {
  if (refreshUpdatedAt) state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function initializeSharedBackend() {
  try {
    const [{ initializeApp }, authModule, databaseModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`)
    ]);

    const app = initializeApp(FIREBASE_CONFIG);
    const auth = authModule.getAuth(app);
    const database = databaseModule.getDatabase(app);
    syncState.api = {
      onAuthStateChanged: authModule.onAuthStateChanged,
      signInAnonymously: authModule.signInAnonymously,
      ref: databaseModule.ref,
      onValue: databaseModule.onValue,
      get: databaseModule.get,
      set: databaseModule.set,
      update: databaseModule.update
    };
    syncState.listRef = syncState.api.ref(database, FIREBASE_LIST_PATH);

    syncState.api.onAuthStateChanged(auth, (user) => {
      if (!user || syncState.ready) return;
      syncState.ready = true;
      listenToRemoteTasks();
    });

    await syncState.api.signInAnonymously(auth);
  } catch (error) {
    syncState.failed = true;
    console.warn("Live sync unavailable", error);
    toast("Live sync is not connected.");
  }
}

function listenToRemoteTasks() {
  syncState.api.onValue(
    syncState.listRef,
    (snapshot) => applyRemoteSnapshot(snapshot.val()),
    (error) => {
      syncState.failed = true;
      console.warn("Live sync permission error", error);
      toast("Live sync failed. Check Firebase rules.");
    }
  );
}

function applyRemoteSnapshot(remoteValue) {
  const remoteSnapshot = normalizeSnapshot(remoteValue);
  const remoteIsEmpty = !remoteSnapshot.tasks.length && !remoteSnapshot.completedTasks.length;
  const localHasData = Boolean(state.tasks.length || state.completedTasks.length);

  if (syncState.firstSnapshot && remoteIsEmpty && localHasData && !syncState.localMigrationStarted) {
    syncState.localMigrationStarted = true;
    syncState.firstSnapshot = false;
    writeFullSnapshotToRemote()
      .then(flushPendingRemotePatches)
      .catch((error) => {
        console.warn("Initial live sync migration failed", error);
        toast("Could not upload local tasks.");
      });
    return;
  }

  syncState.firstSnapshot = false;
  state.tasks = remoteSnapshot.tasks;
  state.completedTasks = remoteSnapshot.completedTasks;
  state.updatedAt = remoteSnapshot.updatedAt;
  saveState({ refreshUpdatedAt: false });
  render();
  flushPendingRemotePatches();
}

async function refreshFromRemote({ silent = false } = {}) {
  if (!syncState.ready || !syncState.api || !syncState.listRef) return;

  try {
    const snapshot = await syncState.api.get(syncState.listRef);
    applyRemoteSnapshot(snapshot.val());
    if (!silent) toast("Updated.");
  } catch (error) {
    console.warn("Refresh failed", error);
    if (!silent) toast("Could not refresh.");
  }
}

function writeTaskToRemote(task) {
  return updateRemote({
    [`tasks/${task.id}`]: serializeTask(task),
    updatedAt: new Date().toISOString()
  });
}

function updateTaskTitleInRemote(task) {
  return updateRemote({
    [`tasks/${task.id}/title`]: task.title,
    [`tasks/${task.id}/updatedAt`]: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function removeTaskFromRemote(taskId) {
  return updateRemote({
    [`tasks/${taskId}`]: null,
    updatedAt: new Date().toISOString()
  });
}

function completeTaskInRemote(taskId, completedTask) {
  return updateRemote({
    [`tasks/${taskId}`]: null,
    [`completedTasks/${completedTask.id}`]: completedTask,
    updatedAt: new Date().toISOString()
  });
}

function writeFullSnapshotToRemote() {
  if (!syncState.ready || !syncState.api || !syncState.listRef) return Promise.resolve();

  const payload = {
    tasks: state.tasks.reduce((tasks, task) => {
      tasks[task.id] = serializeTask(task);
      return tasks;
    }, {}),
    completedTasks: state.completedTasks.reduce((tasks, task) => {
      tasks[task.id] = task;
      return tasks;
    }, {}),
    updatedAt: state.updatedAt || new Date().toISOString()
  };

  return syncState.api.set(syncState.listRef, payload);
}

function updateRemote(patch) {
  if (!syncState.ready || !syncState.api || !syncState.listRef) {
    syncState.pendingPatches.push(patch);
    return Promise.resolve();
  }

  return syncState.api.update(syncState.listRef, patch).catch((error) => {
    console.warn("Live sync write failed", error);
    toast("Live sync failed.");
  });
}

function flushPendingRemotePatches() {
  if (!syncState.pendingPatches.length || !syncState.ready || !syncState.api || !syncState.listRef) return;

  const patches = syncState.pendingPatches.splice(0);
  const mergedPatch = Object.assign({}, ...patches);
  syncState.api.update(syncState.listRef, mergedPatch).catch((error) => {
    syncState.pendingPatches.unshift(...patches);
    console.warn("Live sync retry failed", error);
    toast("Live sync failed.");
  });
}

function serializeTask(task) {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt || new Date().toISOString(),
    completed: Boolean(task.completed)
  };
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getShareLink() {
  return APP_LINK;
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

function collectionToArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function sortTasks(a, b) {
  return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

function sortCompletedTasks(a, b) {
  return String(b.doneAt || "").localeCompare(String(a.doneAt || ""));
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

async function requestBadgePermission() {
  if (!("Notification" in window)) {
    toast("App badges are not supported here.");
    updateBadgePermissionStatus();
    return;
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast("App badge permission was not enabled.");
      updateBadgePermissionStatus();
      return;
    }
  }

  updateAppIconBadge(state.tasks.length);
  updateBadgePermissionStatus();
  toast("App badge enabled.");
}

function updateBadgePermissionStatus() {
  if (!elements.badgePermissionButton || !elements.badgePermissionText) return;

  const supportsBadge = "setAppBadge" in navigator || "clearAppBadge" in navigator;
  const supportsNotifications = "Notification" in window;

  if (!supportsBadge) {
    elements.badgePermissionButton.disabled = true;
    elements.badgePermissionButton.textContent = "App badge unavailable";
    elements.badgePermissionText.textContent = "Add the app to the Home Screen on a supported iPhone or browser to use icon badges.";
    return;
  }

  if (!supportsNotifications) {
    elements.badgePermissionButton.disabled = true;
    elements.badgePermissionButton.textContent = "App badge unavailable";
    elements.badgePermissionText.textContent = "This browser does not expose notification permission for icon badges.";
    return;
  }

  if (Notification.permission === "granted") {
    elements.badgePermissionButton.disabled = false;
    elements.badgePermissionButton.textContent = "Refresh app badge";
    elements.badgePermissionText.textContent = `Current badge count: ${state.tasks.length}`;
    return;
  }

  elements.badgePermissionButton.disabled = false;
  elements.badgePermissionButton.textContent = "Enable app badge";
  elements.badgePermissionText.textContent = "Allow notifications once so the Home Screen icon can show the open-task count.";
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
