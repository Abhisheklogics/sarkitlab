export default class VirtualDHT11 {

   static manifest = {
    id:         "dht11",
    label:      "dht11",
    group:      "Sensors & Input",
    imageSrc:   "images/dht11.jpg",
    width:      200,
    height:     200,
    cssClasses: ["dht"],
    physics:    { conductive: false, requiresClosedLoop: false },

    pins: [
      { id: "VCC", x: 10,  y: 105 },
      { id: "SIG", x: 28,  y: 105 },
      { id: "GND", x: 46,  y: 105 },
    ],

    factory: (ctx) => new VirtualDHT11(
      ctx.digitalInputs  ?? {},
      ctx.digitalOutputs ?? {}
    ),
  };

  constructor(pins = {}, instanceName = null) {
    this.pinVCC  = pins.vcc  ?? null;
    this.pinGND  = pins.gnd  ?? null;
    this.pinDATA = pins.data ?? null;

    this.powered      = false;
    this.temperature  = 25.0;
    this.humidity     = 50.0;
    this.state        = 0;

    this._userTemp     = 25.0;
    this._userHum      = 50.0;
    this._nets         = null;
    this._heatActive   = false;
    this._heatWaves    = [];
    this.svg      = this.createSVG();
    this._bindSliderElements();
    
  this.tempSlider = this.svg.querySelector("#dhtTempSlider"); // null
this.humSlider  = this.svg.querySelector("#dhtHumSlider");  // null
this.tempDisp   = this.svg.querySelector("#dhtTempDisp");   // null
this.humDisp    = this.svg.querySelector("#dhtHumDisp");    // null

    this.tempSlider?.addEventListener("input", (e) => {
      e.stopPropagation();
      this._userTemp = Number(e.target.value);
      if (this.tempDisp) this.tempDisp.textContent = this._userTemp + "°C";
    });
    this.tempSlider?.addEventListener("mousedown", e => e.stopPropagation());

    this.humSlider?.addEventListener("input", (e) => {
      e.stopPropagation();
      this._userHum = Number(e.target.value);
      if (this.humDisp) this.humDisp.textContent = this._userHum + "%";
    });
    this.humSlider?.addEventListener("mousedown", e => e.stopPropagation());

    this.svg.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.powered) {
        if (!this._heatActive) this.startHeatWaves();
        if (this.controlsGroup) this.controlsGroup.setAttribute("visibility", "visible");
      }
    });

    document.addEventListener("click", (e) => {
      if (!this.svg.contains(e.target)) {
        if (this._heatActive) this.stopHeatWaves();
        if (this.controlsGroup) this.controlsGroup.setAttribute("visibility", "hidden");
      }
    });
  }
_bindSliderElements() {
  this.tempSlider = this.svg.querySelector("#dhtTempSlider");
  this.humSlider  = this.svg.querySelector("#dhtHumSlider");
  this.tempDisp   = this.svg.querySelector("#dhtTempDisp");
  this.humDisp    = this.svg.querySelector("#dhtHumDisp");
  this._attachSliderEvents();
}
  readTemperature(fahrenheit = false) {
    let t = this._userTemp ?? this.temperature ?? 25.0;
    return fahrenheit ? (t * 9 / 5) + 32 : t;
  }
_attachSliderEvents() {
  this.tempSlider?.addEventListener("input", (e) => {
    e.stopPropagation();
    this._userTemp = Number(e.target.value);
    if (this.tempDisp) this.tempDisp.textContent = this._userTemp + "°C";
  });
  this.tempSlider?.addEventListener("mousedown", e => e.stopPropagation());
  this.humSlider?.addEventListener("input", (e) => {
    e.stopPropagation();
    this._userHum = Number(e.target.value);
    if (this.humDisp) this.humDisp.textContent = this._userHum + "%";
  });
  this.humSlider?.addEventListener("mousedown", e => e.stopPropagation());
}
  readHumidity() {
    return this._userHum ?? this.humidity ?? 50.0;
  }

  createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");

    // ── ONLY THESE THREE LINES CHANGED (1.8× bigger) ──────────────────────
    svg.setAttribute("width",   "540");
    svg.setAttribute("height",  "378");
    svg.setAttribute("viewBox", "0 0 300 210");
    // ───────────────────────────────────────────────────────────────────────

    svg.style.cursor = "pointer";
    svg.style.userSelect = "none";
    svg.style.overflow = "visible";

    const defs = document.createElementNS(ns, "defs");

    const blackBoxGrad = this._makeRadialGrad(ns, "blackBoxGrad",
      [["0%","#525151","1"],["100%","#0a0a0a","1"]]);
    const borderHL = this._makeLinearGrad(ns, "borderHighlight", "0%","0%","100%","100%",
      [["0%","#888","1"],["50%","#222","1"],["100%","#212121","1"]]);
    const bodyGrad = this._makeLinearGrad(ns, "dhtBodyGrad", "0%","0%","0%","100%",
      [["0%","#5DADE2","1"],["100%","#21618C","1"]]);
    const meshBg = this._makeLinearGrad(ns, "dhtMeshBg", "0%","0%","0%","100%",
      [["0%","#1B2631","1"],["100%","#2C3E50","1"]]);
    const pinGrad = this._makeLinearGrad(ns, "dhtPinGrad", "0%","0%","100%","0%",
      [["0%","#999","1"],["50%","#fff","1"],["100%","#888","1"]]);
    const boxGrad = this._makeLinearGrad(ns, "dhtBoxGrad", "0%","0%","0%","100%",
      [["0%","#000000","1"],["100%","#393838","1"]]);
    const legGrad = this._makeLinearGrad(ns, "dhtLegGrad", "0%","0%","100%","0%",
      [["0%","#888","1"],["50%","#fff","1"],["100%","#676767","1"]]);
    const icBodyGrad = this._makeLinearGrad(ns, "dhtIcBodyGrad", "0%","0%","0%","100%",
      [["0%","#5a5757","1"],["100%","#222222","1"]]);

    [blackBoxGrad, borderHL, bodyGrad, meshBg, pinGrad, boxGrad, legGrad, icBodyGrad]
      .forEach(g => defs.appendChild(g));
    svg.appendChild(defs);

    const outerShell = document.createElementNS(ns, "rect");
    outerShell.setAttribute("x","2"); outerShell.setAttribute("y","0");
    outerShell.setAttribute("width","55"); outerShell.setAttribute("height","90");
    outerShell.setAttribute("rx","4"); outerShell.setAttribute("fill","url(#borderHighlight)");
    svg.appendChild(outerShell);

    const blackBody = document.createElementNS(ns, "rect");
    blackBody.setAttribute("x","6"); blackBody.setAttribute("y","1");
    blackBody.setAttribute("width","53"); blackBody.setAttribute("height","88");
    blackBody.setAttribute("rx","3"); blackBody.setAttribute("fill","url(#blackBoxGrad)");
    svg.appendChild(blackBody);

    const sepLine = document.createElementNS(ns, "rect");
    sepLine.setAttribute("x","6"); sepLine.setAttribute("y","59");
    sepLine.setAttribute("width","55"); sepLine.setAttribute("height","1.5");
    sepLine.setAttribute("fill","#ffd700"); sepLine.setAttribute("opacity","0.6");
    svg.appendChild(sepLine);

    const lens = document.createElementNS(ns, "circle");
    lens.setAttribute("cx","32"); lens.setAttribute("cy","65");
    lens.setAttribute("r","5"); lens.setAttribute("fill","#fff");
    lens.setAttribute("opacity","0.8"); lens.setAttribute("stroke","#ffd700");
    lens.setAttribute("stroke-width","1.5");
    svg.appendChild(lens);

    const labelBox = document.createElementNS(ns, "rect");
    labelBox.setAttribute("x","10"); labelBox.setAttribute("y","70");
    labelBox.setAttribute("width","42"); labelBox.setAttribute("height","12");
    labelBox.setAttribute("fill","none"); labelBox.setAttribute("stroke","#ffd700");
    labelBox.setAttribute("stroke-width","0.8");
    svg.appendChild(labelBox);

    [[22,70],[34,70]].forEach(([x,y]) => {
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1",x); l.setAttribute("y1",y);
      l.setAttribute("x2",x); l.setAttribute("y2",y+12);
      l.setAttribute("stroke","#fff"); l.setAttribute("stroke-width","0.5");
      svg.appendChild(l);
    });

    [["11","VCC"],["23","DATA"],["38","GND"]].forEach(([x,label]) => {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", x); t.setAttribute("y", "79");
      t.setAttribute("font-family","Arial, sans-serif");
      t.setAttribute("font-size","4.5"); t.setAttribute("fill","#fff");
      t.textContent = label;
      svg.appendChild(t);
    });

    const jacket = document.createElementNS(ns, "g");
    jacket.setAttribute("transform","translate(5,-14)");

    const jacketBody = document.createElementNS(ns, "rect");
    jacketBody.setAttribute("x","3"); jacketBody.setAttribute("y","3");
    jacketBody.setAttribute("width","50"); jacketBody.setAttribute("height","65");
    jacketBody.setAttribute("rx","4"); jacketBody.setAttribute("fill","url(#dhtBodyGrad)");
    jacketBody.setAttribute("stroke","#1B4F72"); jacketBody.setAttribute("stroke-width","0.8");
    jacket.appendChild(jacketBody);

    [[22,3],[30,3],[38,3]].forEach(x => {
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x",x); r.setAttribute("y","3");
      r.setAttribute("width","4"); r.setAttribute("height","8");
      r.setAttribute("fill","url(#dhtMeshBg)");
      jacket.appendChild(r);
    });

    const meshRect = document.createElementNS(ns, "rect");
    meshRect.setAttribute("x","9"); meshRect.setAttribute("y","17");
    meshRect.setAttribute("width","38"); meshRect.setAttribute("height","42");
    meshRect.setAttribute("fill","url(#dhtMeshBg)"); meshRect.setAttribute("rx","1");
    jacket.appendChild(meshRect);

    [16,23,30,37].forEach(x => {
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x",x); r.setAttribute("y","17");
      r.setAttribute("width","4"); r.setAttribute("height","42");
      r.setAttribute("fill","url(#dhtBodyGrad)");
      jacket.appendChild(r);
    });

    [24,32,40,48].forEach(y => {
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x","9"); r.setAttribute("y",y);
      r.setAttribute("width","38"); r.setAttribute("height","4");
      r.setAttribute("fill","url(#dhtBodyGrad)");
      jacket.appendChild(r);
    });

    [[5,9],[5,22],[5,32],[5,42],[5,54]].forEach(([x,y]) => {
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x",x); r.setAttribute("y",y);
      r.setAttribute("width","2"); r.setAttribute("height", y===9?10:5);
      r.setAttribute("rx","1"); r.setAttribute("fill","white");
      r.setAttribute("opacity", y===9||y===54?"0.4":"0.3");
      jacket.appendChild(r);
    });

    const curve = document.createElementNS(ns, "path");
    curve.setAttribute("d","M5 64 Q28 67 51 64");
    curve.setAttribute("fill","none"); curve.setAttribute("stroke","white");
    curve.setAttribute("stroke-width","0.4"); curve.setAttribute("opacity","0.2");
    jacket.appendChild(curve);

    svg.appendChild(jacket);

    const pinBoxGroup = document.createElementNS(ns, "g");
    pinBoxGroup.setAttribute("transform","translate(10,83)");
    [[0],[14],[28]].forEach(([x]) => {
      const pb = document.createElementNS(ns, "rect");
      pb.setAttribute("x",x); pb.setAttribute("y","0");
      pb.setAttribute("width","13"); pb.setAttribute("height","10");
      pb.setAttribute("rx","1"); pb.setAttribute("fill","url(#dhtBoxGrad)");
      pb.setAttribute("stroke","#393838");
      pinBoxGroup.appendChild(pb);
    });
    svg.appendChild(pinBoxGroup);

    const legGroup = document.createElementNS(ns, "g");
    legGroup.setAttribute("transform","translate(10,89)");
    [4,18,32].forEach(x => {
      const leg = document.createElementNS(ns, "rect");
      leg.setAttribute("x",x); leg.setAttribute("y","0");
      leg.setAttribute("width","3"); leg.setAttribute("height","15");
      leg.setAttribute("rx","1"); leg.setAttribute("fill","url(#dhtPinGrad)");
      legGroup.appendChild(leg);
    });
    svg.appendChild(legGroup);

    const icLeg = document.createElementNS(ns, "rect");
    icLeg.setAttribute("x","56"); icLeg.setAttribute("y","68");
    icLeg.setAttribute("width","3"); icLeg.setAttribute("height","14");
    icLeg.setAttribute("fill","url(#dhtLegGrad)");
    svg.appendChild(icLeg);

    this.heatContainer = document.createElementNS(ns, "g");
    this.heatContainer.setAttribute("id","heat-waves");
    svg.appendChild(this.heatContainer);

    this.controlsGroup = document.createElementNS(ns, "g");
    this.controlsGroup.setAttribute("id", "dhtControls");
    this.controlsGroup.setAttribute("visibility", "hidden");
    
    this.controlsGroup.innerHTML = `
      <foreignObject x="115" y="0" width="180" height="150">
        <div xmlns="http://www.w3.org/1999/xhtml" style="background: rgba(20,25,30,0.95); border: 1px solid #444; border-radius: 8px; padding: 14px; color: #ccc; font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
          <div style="margin-bottom: 6px; font-weight: bold; color: #fff;">Environment Config</div>
          
          <div style="display: flex; justify-content: space-between; margin-top: 14px;">
            <span>Temperature:</span> <span id="dhtTempDisp" style="color:#ff7b72; font-weight:bold;">25°C</span>
          </div>
          <input type="range" id="dhtTempSlider" min="0" max="50" value="25" style="width: 100%; cursor:pointer; margin-top: 6px;" />
          
          <div style="display: flex; justify-content: space-between; margin-top: 16px;">
            <span>Humidity:</span> <span id="dhtHumDisp" style="color:#79c0ff; font-weight:bold;">50%</span>
          </div>
          <input type="range" id="dhtHumSlider" min="20" max="90" value="50" style="width: 100%; cursor:pointer; margin-top: 6px;" />
        </div>
      </foreignObject>
    `;
    svg.appendChild(this.controlsGroup);

    return svg;
  }

  startHeatWaves() {
    this._heatActive = true;
    this._spawnInterval = setInterval(() => this._spawnWave(), 320);
  }

  stopHeatWaves() {
    this._heatActive = false;
    clearInterval(this._spawnInterval);
    setTimeout(() => {
      while (this.heatContainer.firstChild)
        this.heatContainer.removeChild(this.heatContainer.firstChild);
      this._heatWaves = [];
    }, 600);
  }

  _spawnWave() {
    const ns   = "http://www.w3.org/2000/svg";
    const waveY = 6 + Math.random() * 38;
    const startX = 70 + Math.random() * 15;
    const amplitude = 3 + Math.random() * 4;
    const freq      = 0.18 + Math.random() * 0.12;
    
    const isTempWave = Math.random() > 0.5;
    let color;
    
    if (isTempWave) {
      let temp = this._userTemp ?? 25;
      let hue = 35;
      if (temp > 30) {
        hue = Math.max(0, 35 - ((temp - 30) / 20) * 35);
      }
      color = `hsl(${hue}, 100%, ${55 + Math.random()*15}%)`;
    } else {
      let hum = this._userHum ?? 50;
      let factor = (hum - 20) / 70;
      let hue = 195 + factor * 25;
      let lightness = 70 - factor * 35;
      color = `hsl(${hue}, 100%, ${lightness}%)`;
    }

    const path = document.createElementNS(ns, "path");
    path.setAttribute("fill","none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width","2.0");
    path.setAttribute("stroke-linecap","round");
    path.setAttribute("opacity","0.85");
    this.heatContainer.appendChild(path);

    let progress = 0;
    const totalLen = 55;

    const tick = setInterval(() => {
      progress += 2.2;
      if (progress > totalLen) {
        clearInterval(tick);
        if (path.parentNode) path.parentNode.removeChild(path);
        return;
      }

      let d = `M ${startX - progress} ${waveY}`;
      for (let dx = 1; dx <= progress; dx += 2) {
        const x = startX - progress + dx;
        const y = waveY + Math.sin(dx * freq) * amplitude;
        d += ` L ${x} ${y}`;
      }
      path.setAttribute("d", d);
      const opacity = Math.max(0, 0.9 - progress / totalLen);
      path.setAttribute("opacity", String(opacity));
    }, 16);
  }

  updatePhysics(data) {
    const { temperature, humidity, powered } = data;
    this.powered     = !!powered;
    this.temperature = temperature ?? 25.0;
    this.humidity    = humidity    ?? 50.0;
    this._refreshDisplay();
  }

  _refreshDisplay() {}

  _makeLinearGrad(ns, id, x1, y1, x2, y2, stops) {
    const grad = document.createElementNS(ns, "linearGradient");
    grad.setAttribute("id",id); grad.setAttribute("x1",x1); grad.setAttribute("y1",y1);
    grad.setAttribute("x2",x2); grad.setAttribute("y2",y2);
    stops.forEach(([offset, color, opacity]) => {
      const s = document.createElementNS(ns, "stop");
      s.setAttribute("offset",offset);
      s.setAttribute("style",`stop-color:${color};stop-opacity:${opacity}`);
      grad.appendChild(s);
    });
    return grad;
  }

  _makeRadialGrad(ns, id, stops) {
    const grad = document.createElementNS(ns, "radialGradient");
    grad.setAttribute("id",id); grad.setAttribute("cx","50%"); grad.setAttribute("cy","50%");
    grad.setAttribute("r","70%"); grad.setAttribute("fx","50%"); grad.setAttribute("fy","30%");
    stops.forEach(([offset, color, opacity]) => {
      const s = document.createElementNS(ns, "stop");
      s.setAttribute("offset",offset);
      s.setAttribute("style",`stop-color:${color};stop-opacity:${opacity}`);
      grad.appendChild(s);
    });
    return grad;
  }

  getElement() { return this.svg; }
}