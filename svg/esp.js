export default class ESP {
  constructor(pins = {}) {
    this.svg = this.createSVG();
    this.svg.__instance = this;

    // Map of pin IDs to their current values
    this.pins = pins; 
  }

  createSVG() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");

    svg.setAttribute("width", "500");
    svg.setAttribute("height", "400");
    svg.setAttribute("viewBox", "0 0 500 400");

    svg.innerHTML = `
      <!-- ESP32 Body -->
      <rect x="50" y="50" width="400" height="300" rx="30" fill="#2c3e50" stroke="#1a252f" stroke-width="6"/>
      
      <!-- ESP32 Label -->
      <text x="250" y="40" font-size="24" fill="#ecf0f1" text-anchor="middle">ESP32</text>
      
      <!-- Left Pin Row -->
      <g id="pinsLeft">
        <rect x="40" y="60" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
        <rect x="40" y="90" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
        <rect x="40" y="120" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
        <rect x="40" y="150" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
        <rect x="40" y="180" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
        <rect x="40" y="210" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
        <rect x="40" y="240" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
        <rect x="40" y="270" width="20" height="20" fill="#3498db" stroke="#2980b9"/>
      </g>
      
      <!-- Right Pin Row -->
      <g id="pinsRight">
        <rect x="440" y="60" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
        <rect x="440" y="90" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
        <rect x="440" y="120" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
        <rect x="440" y="150" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
        <rect x="440" y="180" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
        <rect x="440" y="210" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
        <rect x="440" y="240" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
        <rect x="440" y="270" width="20" height="20" fill="#e74c3c" stroke="#c0392b"/>
      </g>
      
      <!-- Top Power Pins -->
      <g id="powerPins">
        <rect x="200" y="35" width="30" height="20" fill="#f1c40f" stroke="#f39c12"/> <!-- 3.3V -->
        <rect x="240" y="35" width="30" height="20" fill="#f1c40f" stroke="#f39c12"/> <!-- 5V -->
        <rect x="280" y="35" width="30" height="20" fill="#bdc3c7" stroke="#7f8c8d"/> <!-- GND -->
        <rect x="320" y="35" width="30" height="20" fill="#f1c40f" stroke="#f39c12"/> <!-- VIN -->
      </g>
    `;
    
    return svg;
  }

  getElement() {
    return this.svg;
  }

  updatePin(pinId, value) {
    if (!this.pins[pinId]) {
      console.warn(`Pin ${pinId} does not exist.`);
      return;
    }
    this.pins[pinId] = value;
    console.log(`Pin ${pinId} updated with value:`, value);
  }
}
