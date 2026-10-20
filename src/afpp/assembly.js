/**
 * KLAP's assembly scripts (public/chat/assembly/, shared byte for byte with
 * the Klimat Action Protocol) are plain scripts on window.arguman.assembly,
 * not modules: they are added to the page once, in order, when first needed.
 *
 *   loadAssembly(['tbt'])                      Time Based Text only
 *   loadAssembly()                             tbt, ascii, room, presence
 */
const ALL = ['tbt', 'ascii', 'room', 'presence'];
const loading = new Map(); // src -> Promise

export function loadScript(src) {
  if (!loading.has(src)) {
    loading.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false; // keep the order they were added in
        s.onload = resolve;
        s.onerror = () => {
          loading.delete(src);
          reject(new Error(`could not load ${src}`));
        };
        document.body.appendChild(s);
      }),
    );
  }
  return loading.get(src);
}

export async function loadAssembly(names = ALL) {
  const base = `${import.meta.env.BASE_URL}chat/assembly/`;
  await Promise.all(names.map((n) => loadScript(`${base}${n}.js`)));
  return window.arguman.assembly;
}
