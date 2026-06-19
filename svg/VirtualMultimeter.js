export default class VirtualMultimeter {
  constructor(pins = {}, instanceName = null) {
    this.pinCOM = pins.com ?? null;
    this.pinPOS = pins.pos ?? null;

    this.instanceName = instanceName;
    this.mode = "V"; 
    this.value = 0;

    this.svg = this.createSVG();
  }

  createSVG() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", 400);
    svg.setAttribute("height", 140);
    svg.setAttribute("viewBox", "0 0 400 140");

    const body = document.createElementNS(ns, "rect");
    body.setAttribute("x", 5);
    body.setAttribute("y", 5);
    body.setAttribute("width", 390);
    body.setAttribute("height", 130);
    body.setAttribute("rx", 25);
    body.setAttribute("fill", "#f4b41a");

    const screen = document.createElementNS(ns, "rect");
    screen.setAttribute("x", 30);
    screen.setAttribute("y", 25);
    screen.setAttribute("width", 270);
    screen.setAttribute("height", 70);
    screen.setAttribute("rx", 6);
    screen.setAttribute("fill", "#cfd8dc");
    screen.setAttribute("stroke", "#555");
    screen.setAttribute("stroke-width", 4);

    const display = document.createElementNS(ns, "text");
    display.setAttribute("x", 165);
    display.setAttribute("y", 70);
    display.setAttribute("text-anchor", "middle");
    display.setAttribute("font-size", "28");
    display.setAttribute("font-family", "monospace");
    display.setAttribute("fill", "#000");
    display.textContent = "0.00 V";

    const modes = ["A", "V", "R"];
    this.buttons = {};

    modes.forEach((m, i) => {
      const btn = document.createElementNS(ns, "circle");
      btn.setAttribute("cx", 345);
      btn.setAttribute("cy", 40 + i * 30);
      btn.setAttribute("r", 14);
      btn.setAttribute("fill", m === "V" ? "#555" : "#f4b41a");
      btn.setAttribute("stroke", "#333");
      btn.style.cursor = "pointer";

      const txt = document.createElementNS(ns, "text");
      txt.setAttribute("x", 345);
      txt.setAttribute("y", 45 + i * 30);
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("fill", m === "V" ? "#f4b41a" : "#333");
      txt.setAttribute("font-weight", "bold");
      txt.textContent = m;

      btn.onclick = () => this.setMode(m);

      svg.append(btn, txt);
      this.buttons[m] = { btn, txt };
    });

const blackProbe = document.createElementNS(ns, "circle");
blackProbe.setAttribute("cx", 180);
blackProbe.setAttribute("cy", 125);
blackProbe.setAttribute("r", 6);
blackProbe.setAttribute("fill", "#000");

const redProbe = document.createElementNS(ns, "circle");
redProbe.setAttribute("cx", 220);
redProbe.setAttribute("cy", 125);
redProbe.setAttribute("r", 6);
redProbe.setAttribute("fill", "red");




    svg.append(body, screen, display, blackProbe, redProbe);

    this.display = display;
    return svg;
  }


  setMode(mode) {
    this.mode = mode;

    Object.keys(this.buttons).forEach((m) => {
      this.buttons[m].btn.setAttribute(
        "fill",
        m === mode ? "#555" : "#f4b41a"
      );
      this.buttons[m].txt.setAttribute(
        "fill",
        m === mode ? "#f4b41a" : "#333"
      );
    });

    this.updateDisplay();
  }

  setValue(val) {
    this.value = val;
    this.updateDisplay();
  }

  updateDisplay() {
    let unit = this.mode === "V" ? "V" : this.mode === "A" ? "A" : "Ω";
    this.display.textContent = `${this.value.toFixed(2)} ${unit}`;
  }

  update(input) {
    if (typeof input === "number") {
      this.setValue(input);
    }
  }

  getElement() {
    return this.svg;
  }
}
