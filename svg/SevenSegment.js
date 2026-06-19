export default class SevenSegment {
 constructor(pins = {}) {
  this.svg = this.createSVG();
  this.svg.__instance = this;

  this.pins = pins; 

  this.lookup = {
    A: this.svg.querySelector('#segA'),
    B: this.svg.querySelector('#segB'),
    C: this.svg.querySelector('#segC'),
    D: this.svg.querySelector('#segD'),
    E: this.svg.querySelector('#segE'),
    F: this.svg.querySelector('#segF'),
    G: this.svg.querySelector('#segG'),
    DP: this.svg.querySelector('#segDP')
  };
}


  mapResistanceToIntensity(R) {
    if (R <= 100) return 1.0;
    if (R <= 220) return 0.9;
    if (R <= 470) return 0.8;
    if (R <= 1000) return 0.7;
    if (R <= 2000) return 0.5;
    if (R <= 4700) return 0.3;
    if (R <= 10000) return 0.1;
    return 0.02;
  }

  turnOn(segment, intensity=1) {
    if (this.lookup[segment])
      this.lookup[segment].setAttribute("fill", `rgba(255,0,0,${intensity})`);
  }

  turnOff(segment) {
    if (this.lookup[segment])
      this.lookup[segment].setAttribute("fill", "#A9A9A9");
  }

  clear() {
    ["A","B","C","D","E","F","G","DP"].forEach(s => this.turnOff(s));
  }

  writePin(pin, voltage = 0, resistance = 100) {
  
    const intensity = this.mapResistanceToIntensity(resistance);
    const isOn = this.pinCommon ? voltage === 0 : voltage > 0; 

    if (pin === this.pinA) this.setSegment("A", isOn, intensity);
    if (pin === this.pinB) this.setSegment("B", isOn, intensity);
    if (pin === this.pinC) this.setSegment("C", isOn, intensity);
    if (pin === this.pinD) this.setSegment("D", isOn, intensity);
    if (pin === this.pinE) this.setSegment("E", isOn, intensity);
    if (pin === this.pinF) this.setSegment("F", isOn, intensity);
    if (pin === this.pinG) this.setSegment("G", isOn, intensity);
    if (pin === this.pinDP) this.setSegment("DP", isOn, intensity);
  }

  setSegment(segment, value, intensity=1) {
    if (value) this.turnOn(segment,intensity);
    else this.turnOff(segment);
  }

  displayChar(char, resistance=100) {
    this.clear();
    const map = {
      "0":["A","B","C","D","E","F"], "1":["B","C"], "2":["A","B","D","E","G"],
      "3":["A","B","C","D","G"], "4":["B","C","F","G"], "5":["A","C","D","F","G"],
      "6":["A","C","D","E","F","G"], "7":["A","B","C"], "8":["A","B","C","D","E","F","G"],
      "9":["A","B","C","D","F","G"], "A":["A","B","C","E","F","G"], "b":["C","D","E","F","G"],
      "C":["A","D","E","F"], "d":["B","C","D","E","G"], "E":["A","D","E","F","G"], "F":["A","E","F","G"],
      "H":["B","C","E","F","G"], "L":["D","E","F"], "P":["A","B","E","F","G"], "U":["B","C","D","E","F"],
      "-":["G"], " ":[]
    };
    const segments = map[char];
    if (!segments) return;
    const intensity = this.mapResistanceToIntensity(resistance);
    segments.forEach(seg => this.turnOn(seg,intensity));
  }

  displayNumber(num,resistance=100) {
    this.displayChar(num.toString(),resistance);
  }

  getElement() { return this.svg; }

  createSVG() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", 200);
    svg.setAttribute("height", 300);
    svg.setAttribute("viewBox", "0 0 200 300");

    svg.innerHTML = `
      <rect x="35" y="20" width="130" height="220" rx="18"
            fill="grey" stroke="#444" stroke-width="3"/>
      <rect x="50" y="45" width="100" height="170" rx="12" fill="#363737"/>
      <rect id="segA" x="75" y="55" width="50" height="10" rx="5" fill="#A9A9A9"/>
      <rect id="segB" x="125" y="70" width="10" height="45" rx="5" fill="#A9A9A9"/>
      <rect id="segC" x="125" y="135" width="10" height="45" rx="5" fill="#A9A9A9"/>
      <rect id="segD" x="75" y="185" width="50" height="10" rx="5" fill="#A9A9A9"/>
      <rect id="segE" x="65" y="135" width="10" height="45" rx="5" fill="#A9A9A9"/>
      <rect id="segF" x="65" y="70" width="10" height="45" rx="5" fill="#A9A9A9"/>
      <rect id="segG" x="75" y="120" width="50" height="10" rx="5" fill="#A9A9A9"/>
      <circle id="segDP" cx="135" cy="202" r="6" fill="#A9A9A9"/>
    `;
    return svg;
  }
}
