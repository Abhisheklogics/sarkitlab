  import DigitalInputModel from "./models/digitalInput.model.js";


  const TYPE_ALIASES = {
  "lcd":               ["lcd", "lcd-16x2-i2c"],
  "lcd-16x2-i2c":      ["lcd", "lcd-16x2-i2c"],
  "servo":             ["servo"],
  "stepper":           ["stepper"],
  "dht":               ["dht"],
  "neopixel":          ["neopixel"],
  "hcsr04":            ["hcsr04"],
  "4-digit-7-segment": ["4-digit-7-segment"],
  "oled":              ["oled"],
  "keypad":            ["keypad"],
  "softwareserial":    ["softwareserial"],
};
  const MODEL_MAP = {
  DIGITAL_INPUT: DigitalInputModel
};
  
  class ComponentRegistry {
    constructor() {
      this.components = [];
      this.pinMap = new Map();  
     this._counters   = {};
      this.attachedInstances = new Map();
      this.instances = new Map(); 
    }

   
  reset() {
  console.log("full circuit reset");

  this.components.length = 0;
  this.pinMap.clear();
  this.instances.clear();
  this.attachedInstances.clear();
 this._counters    = {};

  console.log("blank workspace ready");
}
   registerComponent({
  id,
  type,
  instance,
  svg,
  pins,
  instanceName = null,
  model = null
}) {

  const resolvedModel =
    typeof model === "string"
      ? MODEL_MAP[model]
      : model;

  if (model && !resolvedModel) {
    console.warn(" Model not found:", model, "for", type);
  }

  const componentObj = {
    id,
    type,
    instance,
    instanceName,
    svg,
    pins,
    model: resolvedModel || null,
    meta: resolvedModel?.meta || {},  
    pinMap: {},
    simulationHandler: null
  };

  pins?.forEach(pin => {
    if (pin.number !== undefined && pin.number !== null) {
      const num = Number(pin.number);
      if (Number.isNaN(num)) return;
      componentObj.pinMap[num] = pin.id;
      if (!this.pinMap.has(num)) this.pinMap.set(num, []);
      this.pinMap.get(num).push({ component: componentObj, pinId: pin.id });
    }
  });

  this.components.push(componentObj);

  if (instanceName) this.ensureInstance(type, instanceName);

  return componentObj;
}


   getArduino() {
  return this.components.find(c => c.type === "arduino") || null;
}

    ensureInstance(type, instanceName) {
      if (!this.attachedInstances.has(type)) this.attachedInstances.set(type, new Set());
      if (!this.instances.has(type)) this.instances.set(type, new Map());

      this.attachedInstances.get(type).add(instanceName);

      const comp = this.components.find(c => c.instanceName === instanceName && c.type === type);
      if (comp) this.instances.get(type).set(instanceName, comp);
    }

    getComponentByInstance(name) {
      return this.components.find(c => c.instanceName === name) || null;
    }

    getFirstUnattachedComponent(type) {
      return this.components.find(c => c.type === type && !c.instanceName) || null;
    }

    setInstanceNameForComponent(idOrInstance, name) {
      const comp = typeof idOrInstance === "string"
        ? this.getComponentById(idOrInstance)
        : this.components.find(c => c.instance === idOrInstance);

      if (!comp) return false;

      comp.instanceName = name;
      if (comp.instance) comp.instance.instanceName = name;

      this.ensureInstance(comp.type, name);
      return true;
    }

    detachInstance(type, name) {
      const comp = this.getComponentByInstance(name);
      if (!comp) return;

      if (comp.instance) {
        comp.instance.attached = false;
        comp.instance.pinSIG = null;
        comp.instance.instanceName = null;
      }

      this.instances.get(type)?.delete(name);
      this.attachedInstances.get(type)?.delete(name);
    }

getComponentsByPinNumber(pin) {
  if (this.pinMap.has(pin)) {
    return this.pinMap.get(pin);
  }
  return [];
}
getAllComponents() {
  return this.components; 
}


unregisterComponent(id) {
    const comp = this.getComponentById(id);
    if (!comp) return false;

    this.components = this.components.filter(c => c.id !== id);

    Object.keys(comp.pinMap || {}).forEach(pinNum => {
      const arr = this.pinMap.get(Number(pinNum)) || [];
      this.pinMap.set(Number(pinNum), arr.filter(e => e.component.id !== id));
    });
    if (comp.instanceName) {
      this.instances.get(comp.type)?.delete(comp.instanceName);
      this.attachedInstances.get(comp.type)?.delete(comp.instanceName);
    }

    return true;
  }

    getComponentById(id) {
      return this.components.find(c => c.id === id) || null;
    }

    updatePins(id, newPins) {
      const comp = this.getComponentById(id);
      if (!comp) return false;

      Object.keys(comp.pinMap || {}).forEach(num => {
        const arr = this.pinMap.get(Number(num)) || [];
        this.pinMap.set(Number(num), arr.filter(e => e.component !== comp));
      });

      comp.pinMap = {};

      comp.pins?.forEach(p => {
        if (newPins[p.id] !== undefined) p.number = newPins[p.id];

        if (p.number === "GND") { comp.pinMap.GND = "GND"; return; }

        const num = Number(p.number);
        if (!Number.isNaN(num)) {
          comp.pinMap[num] = p.id;
          if (!this.pinMap.has(num)) this.pinMap.set(num, []);
          this.pinMap.get(num).push({ component: comp, pinId: p.id });
        }
      });

      return true;
    }
    generateId(prefix, override = null) {
    if (override) {
      // Counter sync karo taaki future IDs collision se bachein
      // e.g. override = "ic-74HC04-3" → counter[prefix] = max(current, 3)
      const parts = override.split("-");
      const num   = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num)) {
        this._counters[prefix] = Math.max(this._counters[prefix] ?? 0, num);
      }
      return override;
    }
 
    if (!this._counters[prefix]) {
      this._counters[prefix] = 0;
    }
    this._counters[prefix] += 1;
    return `${prefix}-${this._counters[prefix]}`;
  }
  getAll() {
      return this.components;
    }
 getOrBindComponent(type, instanceName) {
 
  const byName = this.getComponentByInstance(instanceName);
  if (byName) return byName;
 
  const acceptedTypes = TYPE_ALIASES[type] ?? [type];
 
 
  const free = this.components.find(c =>
    acceptedTypes.includes(c.type) && !c.instanceName
  );
 
  if (free) {
    this.setInstanceNameForComponent(free.id, instanceName);
    console.log(`[Registry] Auto-bound '${free.type}' → '${instanceName}'`);
    return free;
  }
 
 
  const any = this.components.find(c => acceptedTypes.includes(c.type));
  if (any) {
    console.warn(`[Registry] No free '${type}' found — reusing '${any.instanceName ?? any.id}' for '${instanceName}'`);
    return any;
  }
 
  return null;
}
  resetAllComponents() {
    this.components.forEach(comp => {
      comp.instanceName = null;
    
    });

    console.log("🔄 Registry fully reset");
  }


  }

  export const registry = new ComponentRegistry();
