// A tiny template engine for the kit's Markdown templates.
//
//   {{path.to.value}}                      insert a value (arrays are joined with ", ")
//   {{#each list}} … {{/each}}             repeat for every item
//   {{#if value}} … {{else}} … {{/if}}     show a part only when a value is set
//   {{#unless value}} … {{/unless}}        the opposite of #if
//
// Inside #each, names are looked up on the item first, then outwards.
// {{this}} is the item itself, {{@number}} is its position starting at 1,
// and {{@first}} / {{@last}} are true on the first and last item.
// A block tag alone on its line removes that whole line, so templates stay readable.

export function render(src, data) {
  const tidy = src.replace(/^[ \t]*(\{\{(?:[#/][^{}]*|else)\}\})[ \t]*\r?\n/gm, '$1');
  return run(parse(tidy), [{ v: data }]);
}

function parse(src) {
  const root = { type: 'root', body: [], alt: [] };
  const stack = [root];
  let last = 0;
  const into = () => {
    const top = stack[stack.length - 1];
    return top.inElse ? top.alt : top.body;
  };
  for (const m of src.matchAll(/\{\{([^{}]+)\}\}/g)) {
    into().push(src.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[1].trim();
    if (tag.startsWith('#')) {
      const [kind, path] = tag.slice(1).split(/\s+/);
      if (!['each', 'if', 'unless'].includes(kind)) throw new Error(`Unknown block {{${tag}}}`);
      const node = { type: kind, path, body: [], alt: [] };
      into().push(node);
      stack.push(node);
    } else if (tag.startsWith('/')) {
      const node = stack.pop();
      if (!node || node.type !== tag.slice(1)) throw new Error(`Unexpected {{${tag}}}`);
    } else if (tag === 'else') {
      stack[stack.length - 1].inElse = true;
    } else {
      into().push({ type: 'var', path: tag });
    }
  }
  into().push(src.slice(last));
  if (stack.length !== 1) throw new Error(`Unclosed {{#${stack[stack.length - 1].type}}}`);
  return root.body;
}

function run(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (typeof n === 'string') { out += n; continue; }
    const value = lookup(n.path, scopes);
    if (n.type === 'var') out += show(value);
    else if (n.type === 'if') out += run(truthy(value) ? n.body : n.alt, scopes);
    else if (n.type === 'unless') out += run(truthy(value) ? n.alt : n.body, scopes);
    else if (n.type === 'each') {
      const list = Array.isArray(value) ? value : [];
      if (!list.length) out += run(n.alt, scopes);
      list.forEach((item, i) => { out += run(n.body, [{ v: item, i, n: list.length }, ...scopes]); });
    }
  }
  return out;
}

function lookup(path, scopes) {
  if (path.startsWith('@')) {
    const s = scopes.find(x => x.i !== undefined);
    if (!s) return undefined;
    return { '@number': s.i + 1, '@index': s.i, '@first': s.i === 0, '@last': s.i === s.n - 1 }[path];
  }
  const parts = path.split('.');
  if (parts[0] === 'this') return dig(scopes[0].v, parts.slice(1));
  for (const s of scopes) {
    if (s.v && typeof s.v === 'object' && Object.hasOwn(s.v, parts[0])) return dig(s.v, parts);
  }
  return undefined;
}

function dig(obj, parts) {
  return parts.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function truthy(v) {
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

function show(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
