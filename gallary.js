function loadGallery(username) {
  const container = document.getElementById("gallery-container");
  if (!container) return;

  const storageKey = `all_projects_${username}`;
  const projects = JSON.parse(localStorage.getItem(storageKey) || "[]");

  container.innerHTML = "";

  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "gallery-empty";
    empty.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M9 9h6M9 13h4"/>
      </svg>
      <p>No circuits yet. Click <strong>Create New Circuit</strong> to start!</p>
    `;
    container.appendChild(empty);
    return;
  }

  projects.sort((a, b) => b.date - a.date);
  projects.forEach(p => container.appendChild(_createProjectCard(p, username)));
}

function openProject(id) {
  window.location.href = `circuit.html?project=${id}`;
}

function deleteProject(id, name = "this circuit") {
  const user = localStorage.getItem("currentUser");
  if (!user) { alert("Pehle login karein!"); return; }

  if (!confirm(`"${name}" ko delete karna chahte hain?.`)) return;

  const storageKey = `all_projects_${user}`;
  localStorage.removeItem(id);

  let list = JSON.parse(localStorage.getItem(storageKey) || "[]");
  list = list.filter(p => p.id !== id);
  localStorage.setItem(storageKey, JSON.stringify(list));

  const card = document.querySelector(`[data-project-id="${id}"]`);
  if (card) {
    card.style.transition = "opacity .25s, transform .25s";
    card.style.opacity = "0";
    card.style.transform = "scale(0.95)";
    setTimeout(() => loadGallery(user), 270);
  } else {
    loadGallery(user);
  }
}

function renameProject(id, currentName) {
  const user = localStorage.getItem("currentUser");
  if (!user) return;

  const newName = prompt("Naya naam daalein:", currentName);
  if (!newName || newName.trim() === currentName) return;

  const raw = localStorage.getItem(id);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    data.name = newName.trim();
    localStorage.setItem(id, JSON.stringify(data));

    const storageKey = `all_projects_${user}`;
    let list = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) list[idx].name = newName.trim();
    localStorage.setItem(storageKey, JSON.stringify(list));

    loadGallery(user);
  } catch (e) {
    console.error("[Gallery] Rename failed:", e);
  }
}

function _createProjectCard(project, username) {
  const card = document.createElement("div");
  card.className = "project-card";
  card.dataset.projectId = project.id;

  const dateStr = new Date(project.date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  card.innerHTML = `
    
    <div class="card-body">
      <h3 class="card-title">${_escHtml(project.name || "Untitled")}</h3>
      <p class="card-date">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        ${dateStr}
      </p>
    </div>
    <div class="card-actions">
      <button class="btn-open" onclick="openProject('${project.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
        Open
      </button>
      <button class="btn-rename" onclick="renameProject('${project.id}', '${_escAttr(project.name || 'Untitled')}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Rename
      </button>
      <button class="btn-delete" onclick="deleteProject('${project.id}', '${_escAttr(project.name || 'Untitled')}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
        </svg>
        Delete
      </button>
    </div>
  `;

  return card;
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _escAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  const user = localStorage.getItem("currentUser");
  if (user) loadGallery(user);
});

document.getElementById('gallerySearch').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('.project-card').forEach(card => {
    const name = card.querySelector('h3').textContent.toLowerCase();
    card.style.display = name.includes(q) ? '' : 'none';
  });
});
window.loadGallery = loadGallery;
window.openProject = openProject;
window.deleteProject = deleteProject;
window.renameProject = renameProject;