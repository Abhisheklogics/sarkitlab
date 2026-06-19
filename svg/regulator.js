export default class VirtualRegulator7805 {
  constructor(pins = {}, instanceName = null) {
    this.pins = pins;
    this.instanceName = instanceName;
    
    this.svg = this.createSVG();
  }

  createSVG() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "80");
    svg.setAttribute("height", "120");
    svg.setAttribute("viewBox", "0 0 80 120");

    const tab = document.createElementNS(ns, "rect");
    tab.setAttribute("x", "15");
    tab.setAttribute("y", "5");
    tab.setAttribute("width", "50");
    tab.setAttribute("height", "40");
    tab.setAttribute("rx", "3");
    tab.setAttribute("fill", "#C0C0C0");
    svg.appendChild(tab);

    const hole = document.createElementNS(ns, "circle");
    hole.setAttribute("cx", "40");
    hole.setAttribute("cy", "20");
    hole.setAttribute("r", "6");
    hole.setAttribute("fill", "#fff");
    svg.appendChild(hole);

    const body = document.createElementNS(ns, "rect");
    body.setAttribute("x", "15");
    body.setAttribute("y", "35");
    body.setAttribute("width", "50");
    body.setAttribute("height", "55");
    body.setAttribute("rx", "2");
    body.setAttribute("fill", "#2d2d2d");
    svg.appendChild(body);

    const pinCoords = [25, 40, 55]; 
    pinCoords.forEach(x => {
      const pin = document.createElementNS(ns, "rect");
      pin.setAttribute("x", x - 2);
      pin.setAttribute("y", "90");
      pin.setAttribute("width", "4");
      pin.setAttribute("height", "20");
      pin.setAttribute("fill", "#b0b0b0");
      svg.appendChild(pin);
    });

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", "40");
    label.setAttribute("y", "65");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "#fff");
    label.setAttribute("font-size", "14");
    label.setAttribute("font-family", "Arial");
    label.setAttribute("font-weight", "bold");
    label.textContent = "5V";
    svg.appendChild(label);

    const labels = ["I", "G", "O"];
    pinCoords.forEach((x, i) => {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", x);
      t.setAttribute("y", "85");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("fill", "#888");
      t.setAttribute("font-size", "8");
      t.textContent = labels[i];
      svg.appendChild(t);
    });

    return svg;
  }

  getElement() {
    return this.svg;
  }
}