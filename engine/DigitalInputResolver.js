export default class DigitalInputResolver {
  resolve(pin, netId, electrical, pinMode, opts = {}) {
    const { hasPullUp, hasPullDown } = opts;
console.log(electrical)
    if (!netId) return 0;

    const V = electrical.netVoltage?.get(netId) ?? 0;
    if (V < 0.8) return 0;
    if (V > 2.5) return 1;
    if (hasPullUp) return 1;
    if (hasPullDown) return 0;
    if (pinMode === "INPUT_PULLUP") return 1;

    return 0; 
  }
}
