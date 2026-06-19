import { registry } from "../src/ComponentRegistry.js";

// -------------------
// LED Component (3D Hyper-Realistic)
// -------------------
export class LED {
  constructor(color = "red", pins = {}, instanceName = null, registryId = null) {
    this.color = color;
    this.pinA = pins.a ?? null;
    this.pinK = pins.k ?? null;
    this.instanceName = instanceName ?? null;
    this.intensity = 0;

    this.svg = this.createSVG();
    this.svg.__instance = this;

    if (registryId) this._registryId = registryId;

    this.init3D();
  }

  register() {
    if (!this._registryId)
      this._registryId = "led-" + Math.random().toString(36).substr(2, 9);

    this.svg.dataset.id = this._registryId;

    const pinsArr = [
      { id: "A", pinKey: `${this._registryId}:A` },
      { id: "K", pinKey: `${this._registryId}:K` }
    ];

    return registry.registerComponent({
      id: this._registryId,
      type: "led",
      instance: this,
      svg: this.svg,
      pins: pinsArr,
      physics: { conductive: true, requiresClosedLoop: true, requiresPolarity: true, allowsSeries: true }
    });
  }

  createSVG() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "100");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.style.overflow = "visible";

    this._containerId = "led3d-" + Math.random().toString(36).substr(2, 9);
    this._glowId = "ledglow-" + Math.random().toString(36).substr(2, 9);

    svg.innerHTML = `
      <foreignObject x="0" y="0" width="100" height="100">
        <div style="position: relative; width: 100%; height: 100%; pointer-events: none;" xmlns="http://www.w3.org/1999/xhtml">
          <!-- A glowing orb centered behind the 3D dome, so legs don't glow -->
          <div id="${this._glowId}" style="position: absolute; top: 25px; left: 40px; width: 20px; height: 20px; border-radius: 50%; opacity: 0; filter: blur(8px); transition: opacity 0.1s;"></div>
          <!-- Three.js Canvas Container -->
          <div id="${this._containerId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
        </div>
      </foreignObject>
      <!-- Transparent rects to keep wire connection anchors working if dependent on SVGElements -->
      <rect x="47" y="0" width="6" height="20" fill="transparent" />
      <rect x="47" y="80" width="6" height="20" fill="transparent" />
    `;
    return svg;
  }

  init3D() {
    if (typeof THREE === "undefined") {
      console.warn("Three.js not loaded.");
      return;
    }

    setTimeout(() => {
      const container = this.svg.querySelector(`#${this._containerId}`);
      if (!container) return;

      const vWidth = 100;
      const vHeight = 100;

      this.scene = new THREE.Scene();
      
      // Use PerspectiveCamera with a narrower FOV for a portrait-like, realistic perspective
      this.camera = new THREE.PerspectiveCamera(35, vWidth / vHeight, 0.1, 1000);
      this.camera.position.set(0, -3, 85);

      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      this.renderer.setSize(vWidth, vHeight);
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      
      this.renderer.domElement.style.width = "100%";
      this.renderer.domElement.style.height = "100%";
      this.renderer.domElement.style.pointerEvents = "none";
      
      container.appendChild(this.renderer.domElement);

      // --- LIGHTING ---
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambientLight);

      // Main specular highlight light (simulates the photo's bright reflection)
      const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
      dirLight.position.set(10, 20, 40);
      this.scene.add(dirLight);

      // Soft fill light from the other side
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
      fillLight.position.set(-15, 0, 20);
      this.scene.add(fillLight);

      // Internal light for when the LED is ON
      this.pointLight = new THREE.PointLight(this.color, 0, 100);
      this.pointLight.position.set(0, 2, 0);
      this.scene.add(this.pointLight);

      this.ledGroup = new THREE.Group();
      this.scene.add(this.ledGroup);

      // --- MATERIALS ---
      const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 1.0,
        roughness: 0.35 // Slightly dull metal like real LED legs
      });

      const baseColor = new THREE.Color(this.color);

      // Hyper-realistic clear epoxy/plastic material for bulb using volumetric attenuation
      this.bulbMaterial = new THREE.MeshPhysicalMaterial({
        color: baseColor,
        metalness: 0.1,
        roughness: 0.05, // very smooth for sharp reflections
        transmission: 0.95, // Highly transparent
        thickness: 6.0, // Refraction thickness to simulate solid plastic
        ior: 1.54, // Index of refraction for epoxy resin
        attenuationColor: baseColor, // Deep tinting inside the volume
        attenuationDistance: 8.0, // How fast the color gets dense
        transparent: true,
        opacity: 1.0,
        emissive: baseColor,
        emissiveIntensity: 0.0, // Off by default
        clearcoat: 1.0,
        clearcoatRoughness: 0.02
      });

      // --- INTERNAL STRUCTURE ---
      // 1. Anvil (Cathode cup) - Large cup shape on the left
      const anvilGroup = new THREE.Group();
      const anvilStem = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 8, 16), metalMaterial);
      anvilStem.position.set(0, -4, 0);
      const anvilCup = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 1.2, 4, 16), metalMaterial);
      anvilCup.position.set(0, 2, 0);
      anvilGroup.add(anvilStem);
      anvilGroup.add(anvilCup);
      anvilGroup.position.set(-2, 0, 0);
      this.ledGroup.add(anvilGroup);

      // 2. Post (Anode tip) - Thinner stem on the right
      const postGroup = new THREE.Group();
      const postStem = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10, 16), metalMaterial);
      postStem.position.set(0, -3, 0);
      postGroup.add(postStem);
      postGroup.position.set(2.5, 0, 0);
      this.ledGroup.add(postGroup);

      // 3. Tiny wire connecting post to anvil
      const wirePath = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(2.5, 2, 0),
        new THREE.Vector3(0, 4.5, 0),
        new THREE.Vector3(-1.5, 3.5, 0)
      );
      const wireGeo = new THREE.TubeGeometry(wirePath, 8, 0.15, 8, false);
      const wireMesh = new THREE.Mesh(wireGeo, metalMaterial);
      this.ledGroup.add(wireMesh);

      // --- LEGS ---
      // Cathode Leg (Left, connected to Anvil, shorter)
      const cathodeGeo = new THREE.CylinderGeometry(0.6, 0.6, 35, 16);
      const cathodeMesh = new THREE.Mesh(cathodeGeo, metalMaterial);
      cathodeMesh.position.set(-2, -25.5, 0);
      this.ledGroup.add(cathodeMesh);

      // Anode Leg (Right, connected to Post, longer)
      const anodeGeo = new THREE.CylinderGeometry(0.6, 0.6, 40, 16);
      const anodeMesh = new THREE.Mesh(anodeGeo, metalMaterial);
      anodeMesh.position.set(2.5, -28, 0);
      this.ledGroup.add(anodeMesh);

      // --- BULB DOME & BASE ---
      const bulbGroup = new THREE.Group();
      
      // Base rim / Flange (Thick ring at the bottom)
      const bulbRimGeo = new THREE.CylinderGeometry(8.5, 8.5, 2.5, 32);
      const bulbRim = new THREE.Mesh(bulbRimGeo, this.bulbMaterial);
      bulbRim.position.set(0, -6.5, 0);
      bulbGroup.add(bulbRim);

      // Cylinder body
      const bulbBaseGeo = new THREE.CylinderGeometry(8, 8, 12, 32);
      const bulbBase = new THREE.Mesh(bulbBaseGeo, this.bulbMaterial);
      bulbBase.position.set(0, 0.75, 0);
      bulbGroup.add(bulbBase);

      // Dome top
      const bulbDomeGeo = new THREE.SphereGeometry(8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const bulbDome = new THREE.Mesh(bulbDomeGeo, this.bulbMaterial);
      bulbDome.position.set(0, 6.75, 0);
      bulbGroup.add(bulbDome);

      this.ledGroup.add(bulbGroup);

      // Adjust group position and scale to fit perfectly in the 100x100 box
      this.ledGroup.scale.set(1.1, 1.1, 1.1);
      this.ledGroup.position.set(0, 4, 0);
      
      // Tilt it slightly upward to see the internal structure clearly
      this.ledGroup.rotation.x = 0.1;

      let time = 0;
      const animate = () => {
        requestAnimationFrame(animate);
        time += 0.02;
        // Subtle swaying back and forth to appreciate the 3D glass refraction
        this.ledGroup.rotation.y = Math.sin(time) * 0.3;
        this.renderer.render(this.scene, this.camera);
      };
      animate();

    }, 0);
  }

  changeColor(newColor) {
    this.color = newColor;
    if (this.bulbMaterial) {
      this.bulbMaterial.color.set(newColor);
      this.bulbMaterial.emissive.set(newColor);
    }
    if (this.pointLight) {
      this.pointLight.color.set(newColor);
    }
    
    // Dynamically update the localized CSS glow color
    const glowDiv = this.svg.querySelector(`#${this._glowId}`);
    if (glowDiv) {
      glowDiv.style.backgroundColor = this.color;
      glowDiv.style.boxShadow = `0 0 12px 5px ${this.color}`;
    }
  }

  setOn(intensity = 1) {
    this.intensity = intensity;
    if (this.bulbMaterial) {
      this.bulbMaterial.emissiveIntensity = 8.0 * intensity;
    }
    if (this.pointLight) {
      this.pointLight.intensity = 5.0 * intensity;
    }
    
    // Apply intense localized CSS glow effect based on intensity
    const glowDiv = this.svg.querySelector(`#${this._glowId}`);
    if (glowDiv) {
      glowDiv.style.backgroundColor = this.color;
      glowDiv.style.boxShadow = `0 0 12px 5px ${this.color}`;
      glowDiv.style.opacity = Math.min(1.0, intensity * 2);
    }
  }

  setOff() {
    this.intensity = 0;
    if (this.bulbMaterial) {
      this.bulbMaterial.emissiveIntensity = 0.0;
    }
    if (this.pointLight) {
      this.pointLight.intensity = 0;
    }
    
    // Hide the localized CSS glow effect
    const glowDiv = this.svg.querySelector(`#${this._glowId}`);
    if (glowDiv) {
      glowDiv.style.opacity = 0;
    }
  }

  getElement() {
    return this.svg;
  }
}