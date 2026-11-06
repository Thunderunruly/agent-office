/**
 * Host half of the dsh-pixel-office bundle.
 *
 * The Client module (./client.js) owns the whole visualization: it subscribes to the
 * live Session/Workspace snapshots, derives the building → floor → office model, and
 * paints the pixel-art scenes. The Host side needs no service of its own today; this
 * entry keeps the bundle shape stable for future Super-agent adapters that may expose
 * extra roster data through the Host.
 */
export function apply() {}
