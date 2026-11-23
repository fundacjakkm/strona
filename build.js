// Składa stronę: szablon/ + dane/strona.json -> dist/
// Uruchamiane automatycznie przez Netlify przy każdej zmianie w panelu.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'szablon');
const OUT = path.join(ROOT, 'dist');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'dane', 'strona.json'), 'utf8'));

// wartości pochodne
const k = data.kontakt || {};
const digits = (s) => String(s || '').replace(/\D/g, '');
k.telefon_link = '+48' + digits(k.telefon).replace(/^48(?=\d{9}$)/, '');
k.konto_cyfry = digits(k.konto);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escHtml = (s) => esc(s).replace(/\r?\n/g, '<br>');
const escJs = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
  .replace(/\r?\n/g, ' ').replace(/</g, '\\x3c');

function lookup(stack, name) {
  if (name === '.') return stack[stack.length - 1];
  const parts = name.split('.');
  for (let i = stack.length - 1; i >= 0; i--) {
    const ctx = stack[i];
    if (ctx !== null && typeof ctx === 'object' && parts[0] in ctx) {
      let v = ctx;
      for (const p of parts) { v = v == null ? undefined : v[p]; }
      return v;
    }
  }
  return undefined;
}

function parse(tpl) {
  const re = /\{\{([#^/]?)\s*([\w.:]+|\.)\s*\}\}/g;
  const root = { children: [] };
  const stack = [root];
  let last = 0, m;
  while ((m = re.exec(tpl))) {
    if (m.index > last) stack[stack.length - 1].children.push(tpl.slice(last, m.index));
    last = re.lastIndex;
    const [, kind, name] = m;
    if (kind === '#' || kind === '^') {
      const node = { kind, name, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (kind === '/') {
      const open = stack.pop();
      if (!open || open.name !== name) throw new Error('Niedomknięty blok: ' + name);
    } else {
      stack[stack.length - 1].children.push({ kind: 'var', name });
    }
  }
  if (stack.length !== 1) throw new Error('Niedomknięty blok: ' + stack[stack.length - 1].name);
  if (last < tpl.length) root.children.push(tpl.slice(last));
  return root;
}

const truthy = (v) => Array.isArray(v) ? v.length > 0 : !!v;

function render(node, stack) {
  let out = '';
  for (const c of node.children) {
    if (typeof c === 'string') { out += c; continue; }
    if (c.kind === 'var') {
      const isJs = c.name.startsWith('js:');
      const v = lookup(stack, isJs ? c.name.slice(3) : c.name);
      if (v === undefined || v === null) continue;
      out += isJs ? escJs(v) : escHtml(v);
    } else {
      const v = lookup(stack, c.name);
      if (c.kind === '^') { if (!truthy(v)) out += render(c, stack); continue; }
      if (!truthy(v)) continue;
      if (Array.isArray(v)) for (const item of v) out += render(c, stack.concat([item]));
      else out += render(c, stack.concat([v]));
    }
  }
  return out;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
  if (!f.endsWith('.html')) continue;
  const p = path.join(OUT, f);
  fs.writeFileSync(p, render(parse(fs.readFileSync(p, 'utf8')), [data]));
}
console.log('Strona zbudowana:', fs.readdirSync(OUT).length, 'elementów w dist/');
