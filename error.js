/**
 * ═══════════════════════════════════════════════════════════════════
 * ErrorDisplay.js  —  Sarkitshala Simulation Engine
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Usage:
 *    import ErrorDisplay from "./ErrorDisplay.js";
 *    const errorUI = new ErrorDisplay();
 *    document.body.appendChild(errorUI.element);
 *
 *    // Show parse errors:
 *    errorUI.showParseResult({ errors: [...], warnings: [...], board: "esp32", boardName: "ESP32" });
 *
 *    // Show runtime error:
 *    errorUI.showRuntimeError({ message: "...", context: "loop" });
 *
 *    // Clear:
 *    errorUI.clear();
 * ═══════════════════════════════════════════════════════════════════
 */

export default class ErrorDisplay {
  constructor(options = {}) {
    this._options = {
      position:  options.position  ?? "bottom",  // "bottom" | "top" | "inline"
      maxErrors: options.maxErrors ?? 20,
    };
    this._visible  = false;
    this._errors   = [];
    this._warnings = [];
    this._build();
  }

  // ── Build DOM ─────────────────────────────────────────────────
  _build() {
    // Inject styles once
    if (!document.getElementById("__sark_err_styles")) {
      const style = document.createElement("style");
      style.id = "__sark_err_styles";
      style.textContent = `
        :root {
          --err-bg:      #0d1117;
          --err-surface: #161b22;
          --err-border:  #30363d;
          --err-error:   #f85149;
          --err-warn:    #d29922;
          --err-info:    #58a6ff;
          --err-success: #3fb950;
          --err-text:    #c9d1d9;
          --err-muted:   #8b949e;
          --err-fix:     #1f6feb;
          --err-radius:  8px;
          --err-mono:    "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
        }

        #__sark_error_panel {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 9999;
          background: var(--err-bg);
          border-top: 2px solid var(--err-border);
          font-family: var(--err-mono);
          font-size: 12.5px;
          color: var(--err-text);
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s cubic-bezier(0.4,0,0.2,1), border-color 0.2s;
          box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
        }
        #__sark_error_panel.open {
          max-height: 340px;
          overflow-y: auto;
        }
        #__sark_error_panel.has-error  { border-top-color: var(--err-error); }
        #__sark_error_panel.has-warn   { border-top-color: var(--err-warn);  }
        #__sark_error_panel.has-ok     { border-top-color: var(--err-success);}

        #__sark_err_header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 14px;
          background: var(--err-surface);
          border-bottom: 1px solid var(--err-border);
          cursor: pointer;
          user-select: none;
          position: sticky; top: 0; z-index: 2;
        }
        #__sark_err_header:hover { background: #1c2330; }

        .__sark_badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700;
          letter-spacing: 0.03em;
        }
        .__sark_badge.error   { background: rgba(248,81,73,0.15);  color: var(--err-error); }
        .__sark_badge.warning { background: rgba(210,153,34,0.15); color: var(--err-warn);  }
        .__sark_badge.ok      { background: rgba(63,185,80,0.15);  color: var(--err-success);}
        .__sark_badge.info    { background: rgba(88,166,255,0.15); color: var(--err-info);  }

        .__sark_board_tag {
          margin-left: auto; font-size: 11px;
          color: var(--err-muted); letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .__sark_board_tag span {
          background: rgba(88,166,255,0.1); color: var(--err-info);
          padding: 2px 7px; border-radius: 4px; font-weight: 600;
        }

        .__sark_chevron {
          margin-left: 4px; color: var(--err-muted);
          transition: transform 0.2s; font-size: 13px;
        }
        .__sark_chevron.open { transform: rotate(180deg); }

        #__sark_err_body { padding: 8px 14px 12px; }

        .__sark_err_row {
          display: grid;
          grid-template-columns: 18px 1fr;
          gap: 6px 10px;
          padding: 6px 10px;
          margin: 4px 0;
          border-radius: var(--err-radius);
          border-left: 3px solid transparent;
          background: var(--err-surface);
          transition: background 0.15s;
          cursor: default;
        }
        .__sark_err_row:hover { background: #1c2330; }
        .__sark_err_row.error   { border-left-color: var(--err-error); }
        .__sark_err_row.warning { border-left-color: var(--err-warn);  }
        .__sark_err_row.info    { border-left-color: var(--err-info);  }
        .__sark_err_row.runtime { border-left-color: #bf00ff; background: rgba(191,0,255,0.07); }

        .__sark_err_icon { font-size: 13px; padding-top: 2px; line-height: 1; }
        .__sark_err_content { display: flex; flex-direction: column; gap: 2px; }
        .__sark_err_msg { color: var(--err-text); line-height: 1.4; word-break: break-word; }
        .__sark_err_msg strong { color: #e6edf3; }
        .__sark_err_meta {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; color: var(--err-muted);
        }
        .__sark_err_line {
          background: rgba(88,166,255,0.1); color: var(--err-info);
          padding: 1px 6px; border-radius: 3px; font-weight: 600;
        }
        .__sark_err_type {
          text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em;
          color: var(--err-muted);
        }
        .__sark_err_fix {
          display: inline-flex; align-items: center; gap: 5px;
          margin-top: 3px; font-size: 11px;
          color: var(--err-fix);
        }
        .__sark_err_fix::before { content: "💡"; font-size: 11px; }
        .__sark_err_raw {
          font-family: var(--err-mono); font-size: 11px;
          color: var(--err-muted); background: rgba(255,255,255,0.04);
          padding: 2px 6px; border-radius: 3px; margin-top: 2px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          max-width: 600px;
        }

        .__sark_runtime_box {
          background: rgba(191,0,255,0.08);
          border: 1px solid rgba(191,0,255,0.25);
          border-radius: var(--err-radius);
          padding: 10px 14px; margin: 4px 0;
        }
        .__sark_runtime_title {
          color: #e879f9; font-weight: 700; font-size: 12px;
          letter-spacing: 0.03em; margin-bottom: 4px;
          display: flex; align-items: center; gap: 6px;
        }
        .__sark_runtime_msg {
          color: var(--err-text); font-size: 12.5px; word-break: break-word;
        }
        .__sark_runtime_ctx {
          margin-top: 4px; font-size: 11px; color: var(--err-muted);
        }

        .__sark_divider {
          border: none; border-top: 1px solid var(--err-border);
          margin: 8px 0;
        }

        .__sark_ok_msg {
          display: flex; align-items: center; gap: 8px;
          color: var(--err-success); padding: 8px 4px; font-size: 12.5px;
        }

        #__sark_err_panel::-webkit-scrollbar { width: 6px; }
        #__sark_err_panel::-webkit-scrollbar-thumb { background: var(--err-border); border-radius: 3px; }
      `;
      document.head.appendChild(style);
    }

    // Root panel
    this.element = document.createElement("div");
    this.element.id = "__sark_error_panel";

    // Header (click to toggle)
    this._header = document.createElement("div");
    this._header.id = "__sark_err_header";
    this._header.innerHTML = `
      <span class="__sark_badge ok" id="__sark_status_badge">✓ Ready</span>
      <span id="__sark_err_count_badge" style="display:none"></span>
      <span id="__sark_warn_count_badge" style="display:none"></span>
      <span class="__sark_board_tag" id="__sark_board_tag"></span>
      <span class="__sark_chevron" id="__sark_chevron">▲</span>
    `;
    this._header.addEventListener("click", () => this.toggle());
    this.element.appendChild(this._header);

    // Body
    this._body = document.createElement("div");
    this._body.id = "__sark_err_body";
    this.element.appendChild(this._body);
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Show results from ArduinoParserEngine.arduinoToJSON()
   * @param {object} result — { errors, warnings, board, boardName }
   */
  showParseResult(result) {
    const errors   = result.errors   ?? [];
    const warnings = result.warnings ?? [];
    const board    = result.board    ?? "arduino";
    const boardName= result.boardName ?? board;

    this._errors   = errors;
    this._warnings = warnings;
    this._renderAll(errors, warnings, boardName, null);

    const hasErr  = errors.length   > 0;
    const hasWarn = warnings.length > 0;

    if (hasErr || hasWarn) {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * Show a runtime error from SimulationEngine
   * @param {object} err — { message, context, stack }
   */
  showRuntimeError(err) {
    this._renderAll(this._errors, this._warnings, null, err);
    this.open();
  }

  /** Clear all errors and close panel */
  clear() {
    this._errors   = [];
    this._warnings = [];
    this._renderAll([], [], null, null);
    this.close();
  }

  /** Open the panel */
  open() {
    this.element.classList.add("open");
    document.getElementById("__sark_chevron")?.classList.add("open");
    this._visible = true;
  }

  /** Close the panel */
  close() {
    this.element.classList.remove("open");
    document.getElementById("__sark_chevron")?.classList.remove("open");
    this._visible = false;
  }

  /** Toggle open/close */
  toggle() {
    this._visible ? this.close() : this.open();
  }

  // ── Internal rendering ────────────────────────────────────────

  _renderAll(errors, warnings, boardName, runtimeError) {
    const errBadge  = document.getElementById("__sark_err_count_badge");
    const warnBadge = document.getElementById("__sark_warn_count_badge");
    const status    = document.getElementById("__sark_status_badge");
    const boardTag  = document.getElementById("__sark_board_tag");

    // Board tag
    if (boardTag && boardName) {
      boardTag.innerHTML = `<span>${boardName}</span>`;
    }

    // Badges
    const hasErr      = errors.length > 0 || !!runtimeError;
    const hasWarn     = warnings.length > 0;
    const hasRuntime  = !!runtimeError;

    if (errBadge) {
      const n = errors.length + (hasRuntime ? 1 : 0);
      errBadge.style.display = n > 0 ? "inline-flex" : "none";
      errBadge.className = "__sark_badge error";
      errBadge.textContent = `✕ ${n} error${n !== 1 ? "s" : ""}`;
    }
    if (warnBadge) {
      warnBadge.style.display = hasWarn ? "inline-flex" : "none";
      warnBadge.className = "__sark_badge warning";
      warnBadge.textContent = `⚠ ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`;
    }
    if (status) {
      if (hasErr || hasRuntime) {
        status.className = "__sark_badge error";
        status.textContent = hasRuntime ? "⚡ Runtime Error" : "✕ Errors";
        this.element.className = "__sark_error_panel open has-error".replace("__sark_error_panel", "").trim();
        this.element.id = "__sark_error_panel";
        this.element.classList.remove("has-warn", "has-ok");
        this.element.classList.add("has-error");
      } else if (hasWarn) {
        status.className = "__sark_badge warning";
        status.textContent = "⚠ Warnings";
        this.element.classList.remove("has-error", "has-ok");
        this.element.classList.add("has-warn");
      } else {
        status.className = "__sark_badge ok";
        status.textContent = "✓ No Issues";
        this.element.classList.remove("has-error", "has-warn");
        this.element.classList.add("has-ok");
      }
    }

    // Body content
    this._body.innerHTML = "";

    if (!hasErr && !hasWarn && !hasRuntime) {
      this._body.innerHTML = `<div class="__sark_ok_msg">✅ Code parsed successfully — ready to simulate.</div>`;
      return;
    }

    // Runtime error (shown first)
    if (runtimeError) {
      const box = document.createElement("div");
      box.className = "__sark_runtime_box";
      box.innerHTML = `
        <div class="__sark_runtime_title">⚡ Runtime Error${runtimeError.context ? ` in ${runtimeError.context}()` : ""}</div>
        <div class="__sark_runtime_msg">${this._escape(runtimeError.message)}</div>
        ${runtimeError.stack ? `<div class="__sark_runtime_ctx">${this._escape(runtimeError.stack.split("\n")[1] ?? "")}</div>` : ""}
      `;
      this._body.appendChild(box);
      if (errors.length || warnings.length) {
        const hr = document.createElement("hr");
        hr.className = "__sark_divider";
        this._body.appendChild(hr);
      }
    }

    // Parse errors
    const shown = [...errors, ...warnings].slice(0, this._options.maxErrors);
    for (const e of shown) {
      this._body.appendChild(this._buildRow(e));
    }

    if (errors.length + warnings.length > this._options.maxErrors) {
      const more = document.createElement("div");
      more.style.cssText = "padding:6px 10px; color: var(--err-muted); font-size:11px;";
      more.textContent = `… and ${errors.length + warnings.length - this._options.maxErrors} more issues`;
      this._body.appendChild(more);
    }
  }

  _buildRow(e) {
    const div = document.createElement("div");
    const severity = e.severity ?? "error";
    const icon     = severity === "error"   ? "✕"
                   : severity === "warning" ? "⚠"
                   : "ℹ";
    div.className = `__sark_err_row ${severity}`;
    div.innerHTML = `
      <span class="__sark_err_icon" style="color:${severity === "error" ? "var(--err-error)" : severity === "warning" ? "var(--err-warn)" : "var(--err-info)"}">${icon}</span>
      <div class="__sark_err_content">
        <div class="__sark_err_msg">${this._escape(e.message)}</div>
        <div class="__sark_err_meta">
          ${e.line ? `<span class="__sark_err_line">line ${e.line}</span>` : ""}
          ${e.type ? `<span class="__sark_err_type">${this._escape(e.type)}</span>` : ""}
        </div>
        ${e.raw  ? `<div class="__sark_err_raw">${this._escape(e.raw)}</div>` : ""}
        ${e.fix  ? `<div class="__sark_err_fix">${this._escape(e.fix)}</div>`  : ""}
      </div>
    `;
    return div;
  }

  _escape(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONVENIENCE: Global singleton + integration helpers
// ═══════════════════════════════════════════════════════════════════

let _globalInstance = null;

/**
 * Get or create the global ErrorDisplay instance,
 * automatically appended to document.body.
 */
export function getErrorDisplay() {
  if (!_globalInstance) {
    _globalInstance = new ErrorDisplay();
    document.body.appendChild(_globalInstance.element);
  }
  return _globalInstance;
}


export function wireErrorDisplay(parser, engine, existingDisplay = null) {
  const display = existingDisplay ?? getErrorDisplay();

  // Patch parser: wrap arduinoToJSON to auto-show results
  const _orig = parser.arduinoToJSON.bind(parser);
  parser.arduinoToJSON = function(code) {
    display.clear();
    const result = _orig(code);
    display.showParseResult(result);
    return result;
  };

  // Wire engine error callback if provided
  if (engine && !engine.onError) {
    engine.onError = (err) => display.showRuntimeError(err);
  }
console.log(display)
  return display;
}