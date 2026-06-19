"use strict";

const ARDUINO_KEYWORDS = new Set([
  "void","int","float","double","long","char","bool","boolean","byte","String",
  "short","unsigned","signed","const","static","volatile","auto","return",
  "if","else","for","while","do","switch","case","default","break","continue",
  "goto","struct","class","enum","namespace","public","private","protected",
  "new","delete","sizeof","typedef","extern","inline","true","false","NULL","nullptr",
  "uint8_t","uint16_t","uint32_t","uint64_t","int8_t","int16_t","int32_t","int64_t",
  "word","size_t","ptrdiff_t","PROGMEM","ISR",
]);

const ARDUINO_BUILTINS = new Set([
  "setup","loop","pinMode","digitalWrite","digitalRead","analogWrite","analogRead",
  "delay","delayMicroseconds","millis","micros","tone","noTone","Serial",
  "attachInterrupt","detachInterrupt","interrupts","noInterrupts",
  "pulseIn","pulseInLong","shiftIn","shiftOut","abs","constrain","map","max","min",
  "pow","sq","sqrt","sin","cos","tan","random","randomSeed","bitRead","bitWrite",
  "bitSet","bitClear","bit","highByte","lowByte","Serial1","Serial2","Wire","SPI",
  "EEPROM","print","println","begin","write","read","available","flush","peek",
  "HIGH","LOW","INPUT","OUTPUT","INPUT_PULLUP","INPUT_PULLDOWN","LED_BUILTIN",
  "A0","A1","A2","A3","A4","A5","CHANGE","RISING","FALLING","BOTH",
  "PI","TWO_PI","HALF_PI","true","false","NULL","nullptr",
  "dacWrite","touchRead","hallRead","ledcSetup","ledcAttachPin","ledcWrite",
  "WiFi","BLE","Preferences","analogReadResolution","esp_restart",
  "lcd","init","backlight","clear","setCursor","print","scrollDisplayRight",
  "scrollDisplayLeft","noDisplay","display","noBlink","blink","noCursor","cursor",
  "createChar","home","autoscroll","noAutoscroll","leftToRight","rightToLeft",
]);

function esc(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function tokenizeLine(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === "/" && line[i+1] === "/") {
      tokens.push({ type:"comment", value: line.slice(i) });
      break;
    }
    if (line[i] === '"') {
      let j = i+1;
      while (j < line.length) {
        if (line[j] === '"' && line[j-1] !== "\\") break;
        j++;
      }
      tokens.push({ type:"string", value: line.slice(i, j+1) });
      i = j+1; continue;
    }
    if (line[i] === "'") {
      let j = i+1;
      while (j < line.length) {
        if (line[j] === "'" && line[j-1] !== "\\") break;
        j++;
      }
      tokens.push({ type:"string", value: line.slice(i, j+1) });
      i = j+1; continue;
    }
    const numM = line.slice(i).match(/^(0x[0-9a-fA-F]+|0b[01]+|\d+\.?\d*([eE][+-]?\d+)?[uUlLfF]*)/);
    if (numM) {
      tokens.push({ type:"number", value: numM[0] });
      i += numM[0].length; continue;
    }
    const preM = line.slice(i).match(/^#\s*\w+/);
    if (preM) {
      tokens.push({ type:"preproc", value: preM[0] });
      i += preM[0].length; continue;
    }
    const idM = line.slice(i).match(/^[A-Za-z_]\w*/);
    if (idM) {
      const w = idM[0];
      let type = "ident";
      if (ARDUINO_KEYWORDS.has(w)) type = "keyword";
      else if (ARDUINO_BUILTINS.has(w)) type = "builtin";
      tokens.push({ type, value: w });
      i += w.length; continue;
    }
    if ("{}()[]".includes(line[i])) {
      tokens.push({ type:"bracket", value: line[i] }); i++; continue;
    }
    if ("+-*/=<>!&|^~%".includes(line[i])) {
      tokens.push({ type:"operator", value: line[i] }); i++; continue;
    }
    tokens.push({ type:"other", value: line[i] }); i++;
  }
  return tokens;
}

function renderTokens(tokens) {
  return tokens.map(t => {
    const v = esc(t.value);
    switch (t.type) {
      case "keyword":  return `<span class="tok-kw">${v}</span>`;
      case "builtin":  return `<span class="tok-builtin">${v}</span>`;
      case "string":   return `<span class="tok-str">${v}</span>`;
      case "number":   return `<span class="tok-num">${v}</span>`;
      case "comment":  return `<span class="tok-cmt">${v}</span>`;
      case "preproc":  return `<span class="tok-pre">${v}</span>`;
      case "bracket":  return `<span class="tok-bracket">${v}</span>`;
      case "operator": return `<span class="tok-op">${v}</span>`;
      default:         return v;
    }
  }).join("");
}

class SerialMonitor {
  constructor(containerEl) {
    this._lines       = [];
    this._open        = false;
    this._baud        = 9600;
    this._unreadCount = 0;
    this._build(containerEl);
    window.SerialMonitor = this;
  }

  _build(parent) {
    this._wrapper         = document.createElement("div");
    this._wrapper.className = "sm-wrapper";

    const tabBar        = document.createElement("div");
    tabBar.className    = "sm-tabbar";

    this._tabBtn        = document.createElement("button");
    this._tabBtn.className = "sm-tab";
    this._tabBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>Serial Monitor<span class="sm-badge"></span>`;
    this._tabBtn.addEventListener("click", () => this.toggle());

    this._baudSel       = document.createElement("select");
    this._baudSel.style.display = "none";
    [300,1200,2400,4800,9600,19200,38400,57600,74880,115200,230400,250000].forEach(b => {
      const o = document.createElement("option");
      o.value = b; o.textContent = `${b} baud`;
      if (b === 9600) o.selected = true;
      this._baudSel.appendChild(o);
    });
    this._baudSel.addEventListener("change", () => { this._baud = parseInt(this._baudSel.value); });

    this._clearBtn      = document.createElement("button");
    this._clearBtn.textContent = "Clear";
    this._clearBtn.style.display = "none";
    this._clearBtn.addEventListener("click", () => this.clear());

    tabBar.appendChild(this._tabBtn);
    tabBar.appendChild(this._baudSel);
    tabBar.appendChild(this._clearBtn);

    this._panel         = document.createElement("div");
    this._panel.className = "sm-panel";

    this._outputEl      = document.createElement("div");
    this._outputEl.className = "sm-output";

    this._emptyMsg      = document.createElement("div");
    this._emptyMsg.className = "sm-empty";
    this._emptyMsg.textContent = "No output yet. Run simulation with Serial.println() in your code.";
    this._outputEl.appendChild(this._emptyMsg);

    const inputRow      = document.createElement("div");
    inputRow.className  = "sm-input-row";

    this._inputEl       = document.createElement("input");
    this._inputEl.type  = "text";
    this._inputEl.placeholder = "Send message...";
    this._inputEl.addEventListener("keydown", e => { if (e.key === "Enter") this._sendInput(); });

    const sendBtn       = document.createElement("button");
    sendBtn.textContent = "Send";
    sendBtn.className   = "sm-send-btn";
    sendBtn.addEventListener("click", () => this._sendInput());

    inputRow.appendChild(this._inputEl);
    inputRow.appendChild(sendBtn);
    this._panel.appendChild(this._outputEl);
    this._panel.appendChild(inputRow);
    this._wrapper.appendChild(tabBar);
    this._wrapper.appendChild(this._panel);
    parent.appendChild(this._wrapper);
  }

  _sendInput() {
    const val = this._inputEl.value.trim();
    if (!val) return;
    this._appendLine(`> ${val}`, "var(--accent)");
    if (window._simEngineRef?.onSerialInput) window._simEngineRef.onSerialInput(val);
    this._inputEl.value = "";
  }

  _setTabActive(active) {
    this._tabBtn.classList.toggle("sm-tab-active", active);
    this._baudSel.style.display  = active ? "" : "none";
    this._clearBtn.style.display = active ? "" : "none";
  }

  toggle() {
    this._open = !this._open;
    this._panel.style.display = this._open ? "flex" : "none";
    this._setTabActive(this._open);
    if (this._open) {
      this._scrollToBottom();
      this._unreadCount = 0;
      const badge = this._tabBtn.querySelector(".sm-badge");
      if (badge) { badge.style.display = "none"; badge.textContent = ""; }
    }
  }

  open()  { if (!this._open) this.toggle(); }
  close() { if (this._open)  this.toggle(); }

  _appendLine(text, color) {
    if (this._emptyMsg.parentNode) this._emptyMsg.remove();
    const line = document.createElement("span");
    line.style.cssText = `display:block;${color ? `color:${color};` : ""}`;
    const ts = document.createElement("span");
    ts.className = "sm-ts";
    const now = new Date();
    ts.textContent = `${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}.${String(now.getMilliseconds()).padStart(3,"0")}`;
    const content = document.createElement("span");
    content.textContent = text;
    line.appendChild(ts);
    line.appendChild(content);
    this._outputEl.appendChild(line);
    this._lines.push(text);
    this._scrollToBottom();
    if (!this._open) {
      this._unreadCount++;
      const badge = this._tabBtn.querySelector(".sm-badge");
      if (badge) { badge.style.display = "inline-block"; badge.textContent = this._unreadCount > 99 ? "99+" : String(this._unreadCount); }
    }
    if (this._lines.length > 2000) {
      if (this._outputEl.children.length > 0) this._outputEl.removeChild(this._outputEl.children[0]);
      this._lines.shift();
    }
  }

  _scrollToBottom() {
    requestAnimationFrame(() => { this._outputEl.scrollTop = this._outputEl.scrollHeight; });
  }

  write(text) {
    if (text == null) return;
    const parts = String(text).split(/\r?\n/);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1 && parts[i] === "") continue;
      this._appendLine(parts[i]);
    }
  }

  writeLine(text) { this._appendLine(String(text ?? "")); }

  writeError(text) {
    this._appendLine(`[ERROR] ${text}`, "var(--red)");
    this.open();
  }

  clear() {
    this._lines = []; this._unreadCount = 0;
    this._outputEl.innerHTML = "";
    this._outputEl.appendChild(this._emptyMsg);
    const badge = this._tabBtn.querySelector(".sm-badge");
    if (badge) { badge.style.display = "none"; badge.textContent = ""; }
  }

  resetForSimulation() { this.clear(); this.open(); }
  get isOpen() { return this._open; }
}

export default class ArduinoEditor {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options     = Object.assign({ onChange: null, initialValue: "", tabSize: 2 }, options);
    this._value      = this.options.initialValue;
    this._errors     = [];
    this._warnings   = [];
    this._histStack  = [];
    this._histIdx    = -1;
    this._lastHist   = 0;
    this._composing  = false;
    this._lineH      = 0;
    this._build();
    this._attachEvents();
    this._setValue(this._value, false);
  }

  _build() {
    const container = document.getElementById(this.containerId);
    if (!container) throw new Error(`[ArduinoEditor] #${this.containerId} not found`);
    container.innerHTML = "";
    container.classList.add("ace-container");

    this._outer = document.createElement("div");
    this._outer.className = "ace-outer";

    this._editorRow = document.createElement("div");
    this._editorRow.className = "ace-editor-row";

    this._gutter = document.createElement("div");
    this._gutter.className = "ace-gutter";

    this._codeArea = document.createElement("div");
    this._codeArea.className = "ace-code-area";

    this._highlight = document.createElement("div");
    this._highlight.className = "ace-highlight";
    this._highlight.setAttribute("aria-hidden", "true");

    this._textarea = document.createElement("textarea");
    this._textarea.className      = "ace-textarea";
    this._textarea.spellcheck     = false;
    this._textarea.autocomplete   = "off";
    this._textarea.autocorrect    = "off";
    this._textarea.autocapitalize = "off";
    this._textarea.setAttribute("aria-label", "Arduino code editor");

    this._codeArea.appendChild(this._highlight);
    this._codeArea.appendChild(this._textarea);
    this._editorRow.appendChild(this._gutter);
    this._editorRow.appendChild(this._codeArea);

    this._diagEl = document.createElement("div");
    this._diagEl.className = "ace-diagnostics";

    this._outer.appendChild(this._editorRow);
    this._outer.appendChild(this._diagEl);
    container.appendChild(this._outer);

    this.serialMonitor = new SerialMonitor(this._outer);
    window.Serial = this.serialMonitor;
  }

  _measureLineHeight() {
    const lh = parseFloat(getComputedStyle(this._textarea).lineHeight);
    this._lineH = isNaN(lh) || lh < 1 ? 22 : lh;
  }

  _attachEvents() {
    const ta = this._textarea;

    const sync = () => {
      this._value = ta.value;
      this._pushHist(this._value);
      this._render();
      this.options.onChange?.(this._value);
    };

    ta.addEventListener("input", () => { if (!this._composing) sync(); });

    ta.addEventListener("paste", () => {
      requestAnimationFrame(() => { this._value = ta.value; this._pushHist(this._value); this._render(); this._syncScroll(); this.options.onChange?.(this._value); });
    });

    ta.addEventListener("cut", () => {
      requestAnimationFrame(() => { this._value = ta.value; this._pushHist(this._value); this._render(); this.options.onChange?.(this._value); });
    });

    ta.addEventListener("compositionstart", () => { this._composing = true; });
    ta.addEventListener("compositionend",   () => { this._composing = false; this._value = ta.value; this._render(); this.options.onChange?.(this._value); });

    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart, end = ta.selectionEnd;
        const sp = " ".repeat(this.options.tabSize);
        if (s !== end) {
          const lines = ta.value.split("\n");
          let cc = 0;
          const nl = lines.map(line => {
            const ls = cc, le = cc + line.length;
            cc += line.length + 1;
            if (le >= s && ls <= end)
              return e.shiftKey ? line.replace(new RegExp(`^ {1,${this.options.tabSize}}`), "") : sp + line;
            return line;
          });
          ta.value = nl.join("\n");
        } else {
          ta.value = ta.value.slice(0,s) + sp + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = s + sp.length;
        }
        this._value = ta.value; this._pushHist(this._value); this._render(); this.options.onChange?.(this._value);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") { e.preventDefault(); this._undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); this._redo(); return; }

      if (e.key === "Enter") {
        e.preventDefault();
        const s     = ta.selectionStart;
        const lines = ta.value.slice(0, s).split("\n");
        const cur   = lines[lines.length - 1];
        const m     = cur.match(/^(\s*)/);
        let indent  = m ? m[1] : "";
        if (cur.trimEnd().endsWith("{")) indent += " ".repeat(this.options.tabSize);
        const ins   = "\n" + indent;
        ta.value    = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + ins.length;
        this._value = ta.value; this._pushHist(this._value); this._render(); this.options.onChange?.(this._value);
        return;
      }

      if (e.key === "}") {
        const s    = ta.selectionStart;
        const bef  = ta.value.slice(0, s);
        const last = bef.split("\n").pop();
        if (/^\s+$/.test(last) && last.length >= this.options.tabSize) {
          e.preventDefault();
          const nb = bef.slice(0, bef.length - this.options.tabSize);
          ta.value = nb + "}" + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = nb.length + 1;
          this._value = ta.value; this._pushHist(this._value); this._render(); this.options.onChange?.(this._value);
        }
      }
    });

    ta.addEventListener("scroll", () => this._syncScroll());
    window.addEventListener("resize", () => { this._measureLineHeight(); this._syncScroll(); });
  }

  _syncScroll() {
    const ta       = this._textarea;
    const scrollTop  = ta.scrollTop;
    const scrollLeft = ta.scrollLeft;
    this._highlight.scrollTop  = scrollTop;
    this._highlight.scrollLeft = scrollLeft;
    this._gutter.scrollTop     = scrollTop;
  }

  _pushHist(value) {
    const now = Date.now();
    if (now - this._lastHist < 500 && this._histIdx >= 0) {
      this._histStack[this._histIdx] = value;
    } else {
      this._histStack = this._histStack.slice(0, this._histIdx + 1);
      this._histStack.push(value);
      this._histIdx = this._histStack.length - 1;
    }
    this._lastHist = now;
    if (this._histStack.length > 200) { this._histStack.shift(); this._histIdx--; }
  }

  _undo() {
    if (this._histIdx <= 0) return;
    this._histIdx--;
    this._setValue(this._histStack[this._histIdx], false);
    this.options.onChange?.(this._value);
  }

  _redo() {
    if (this._histIdx >= this._histStack.length - 1) return;
    this._histIdx++;
    this._setValue(this._histStack[this._histIdx], false);
    this.options.onChange?.(this._value);
  }

  _setValue(val, push = true) {
    this._value = val;
    this._textarea.value = val;
    if (push) this._pushHist(val);
    this._render();
  }

  _blockComments(lines) {
    const ranges = []; let inB = false, bs = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!inB) {
        const si = line.indexOf("/*");
        if (si !== -1) {
          const ei = line.indexOf("*/", si+2);
          if (ei !== -1) ranges.push({ s:i, e:i });
          else { inB = true; bs = i; }
        }
      } else {
        const ei = line.indexOf("*/");
        if (ei !== -1) { ranges.push({ s:bs, e:i }); inB = false; bs = -1; }
      }
    }
    if (inB && bs !== -1) ranges.push({ s:bs, e:lines.length-1 });
    return ranges;
  }

  _render() {
    if (!this._lineH) this._measureLineHeight();

    const lines   = this._value.split("\n");
    const blocks  = this._blockComments(lines);
    const errSet  = new Set(this._errors.map(e => e.line).filter(Boolean));
    const warnSet = new Set(this._warnings.map(w => w.line).filter(Boolean));

    let gHTML = "", hHTML = "";

    for (let i = 0; i < lines.length; i++) {
      const ln      = i + 1;
      const line    = lines[i];
      const isErr   = errSet.has(ln);
      const isWarn  = warnSet.has(ln);

      const gClass  = "ace-gutter-line" + (isErr ? " ge" : isWarn ? " gw" : "");
      const dot     = isErr  ? `<span class="gdot ged" title="Error line ${ln}">●</span>`
                    : isWarn ? `<span class="gdot gwd" title="Warning line ${ln}">●</span>` : "";
      gHTML += `<div class="${gClass}" data-ln="${ln}">${dot}${ln}</div>`;

      const inBlock = blocks.some(r => i > r.s && i < r.e);
      const isBS    = blocks.some(r => r.s === i);
      const isBE    = blocks.some(r => r.e === i && r.s !== i);

      let rendered;
      if (inBlock || isBS || isBE) {
        rendered = `<span class="tok-cmt">${esc(line)}</span>`;
      } else {
        rendered = renderTokens(tokenizeLine(line));
      }

      const lClass = "ace-line" + (isErr ? " le" : isWarn ? " lw" : "");
      hHTML += `<div class="${lClass}">${rendered || "\u00a0"}</div>`;
    }

    this._gutter.innerHTML    = gHTML;
    this._highlight.innerHTML = hHTML;

    this._gutter.querySelectorAll(".ace-gutter-line[data-ln]").forEach(el => {
      el.addEventListener("click", () => this._jumpTo(parseInt(el.dataset.ln)));
    });

    this._syncScroll();
    this._renderDiag();
  }

  _renderDiag() {
    const all = [
      ...this._errors.map(d => ({...d, sev:"error"})),
      ...this._warnings.map(d => ({...d, sev:"warning"})),
    ].sort((a,b) => (a.line||999)-(b.line||999));

    if (!all.length) {
      this._diagEl.innerHTML = "";
      this._diagEl.classList.remove("has-diag");
      return;
    }
    this._diagEl.classList.add("has-diag");

    const ec = this._errors.length, wc = this._warnings.length;
    let h = `<div class="dh">`;
    if (ec) h += `<span class="db eb"><svg width="11" height="11" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" stroke="currentColor" fill="none"/><path d="M6 3.5v3M6 8h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>${ec} error${ec>1?"s":""}</span>`;
    if (wc) h += `<span class="db wb"><svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1L11 10H1L6 1Z" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M6 4.5v2.5M6 8.5h.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>${wc} warning${wc>1?"s":""}</span>`;
    h += `<span class="dhint">Click to jump to line</span></div><div class="dl">`;

    for (const d of all) {
      const isE  = d.sev === "error";
      const icon = isE
        ? `<svg width="13" height="13" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" stroke="currentColor" fill="none"/><path d="M6 3.5v3M6 8h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 12 12"><path d="M6 1L11 10H1L6 1Z" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M6 4.5v2.5M6 8.5h.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
      const loc  = d.line ? `<span class="dloc">Line ${d.line}${d.col!=null?`:${d.col}`:""}</span>` : "";
      const code = d.code ? `<span class="dcode">[${d.code}]</span>` : "";
      const fix  = d.fix  ? `<span class="dfix">Suggestion: ${esc(d.fix)}</span>` : "";
      h += `<div class="di ${isE?"de":"dw"}" data-ln="${d.line||""}">${icon}<div class="db2">${loc}${code}<span class="dmsg">${esc(d.message||"")}</span>${fix}</div></div>`;
    }
    h += `</div>`;
    this._diagEl.innerHTML = h;

    this._diagEl.querySelectorAll(".di[data-ln]").forEach(el => {
      const ln = parseInt(el.dataset.ln);
      if (ln) el.addEventListener("click", () => this._jumpTo(ln));
    });
  }

  _jumpTo(ln) {
    const ta    = this._textarea;
    const lines = ta.value.split("\n");
    let pos = 0;
    for (let i = 0; i < Math.min(ln-1, lines.length); i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos + (lines[ln-1]?.length ?? 0));
    if (!this._lineH) this._measureLineHeight();
    ta.scrollTop = Math.max(0, (ln-3) * this._lineH);
    this._syncScroll();
  }

  setDiagnostics(errors=[], warnings=[]) {
    this._errors   = errors;
    this._warnings = warnings;
    this._render();
  }

  getValue()    { return this._value; }
  setValue(val) { this._setValue(val, true); }
  focus()       { this._textarea.focus(); }

  destroy() {
    const c = document.getElementById(this.containerId);
    if (c) c.innerHTML = "";
  }

  onSimulationStart() {
    if (/\bSerial\s*\.\s*(print|println|begin|write)\b/.test(this._value))
      this.serialMonitor.resetForSimulation();
  }

  onSimulationStop() {}
}

window.ArduinoEditor = ArduinoEditor;