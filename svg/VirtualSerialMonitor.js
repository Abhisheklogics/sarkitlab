export class SerialMonitor {
  constructor(containerId = "serial-monitor") {

    this.container = document.createElement("div");
    this.container.id = containerId;
    Object.assign(this.container.style, {
      width: "340px",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "8px",
      fontFamily: "monospace",
      fontSize: "13px",
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "9999",
      display: "none",
      boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
      overflow: "hidden"
    });

    // ── Title bar
    const titleBar = document.createElement("div");
    Object.assign(titleBar.style, {
      background: "#f5f5f5",
      borderBottom: "1px solid #ddd",
      padding: "6px 10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: "move",
      userSelect: "none"
    });

    const title = document.createElement("span");
    title.textContent = "Serial Monitor";
    Object.assign(title.style, { fontWeight: "600", fontSize: "13px", color: "#333" });

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    Object.assign(clearBtn.style, {
      fontSize: "11px", padding: "2px 8px", border: "1px solid #bbb",
      borderRadius: "4px", background: "#fff", cursor: "pointer", color: "#555"
    });
    clearBtn.onclick = () => this.clear();

    titleBar.appendChild(title);
    titleBar.appendChild(clearBtn);

    // ── Output area
    this.output = document.createElement("div");
    Object.assign(this.output.style, {
      height: "200px",
      overflowY: "auto",
      padding: "8px 10px",
      background: "#fff",
      color: "#1a1a1a",
      lineHeight: "1.5"
    });

    this.container.appendChild(titleBar);
    this.container.appendChild(this.output);
    document.body.appendChild(this.container);

    // ── Drag logic
    let ox = 0, oy = 0, dragging = false;
    titleBar.addEventListener("mousedown", e => {
      dragging = true;
      ox = e.clientX - this.container.getBoundingClientRect().left;
      oy = e.clientY - this.container.getBoundingClientRect().top;
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      this.container.style.left   = (e.clientX - ox) + "px";
      this.container.style.top    = (e.clientY - oy) + "px";
      this.container.style.right  = "auto";
      this.container.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
      document.body.style.userSelect = "";
    });
  }

  print(text) {
    const line = document.createElement("div");
    line.textContent = text;
    line.style.borderBottom = "1px solid #f0f0f0";
    line.style.padding = "1px 0";
    this.output.appendChild(line);
    this.output.scrollTop = this.output.scrollHeight;
  }

  clear() {
    this.output.innerHTML = "";
  }
}

window.Serial = new SerialMonitor();