export const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export const text = (v, name, max = 500) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${name}: preencha um valor válido.`);
  return v.trim();
};

export const cents = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) fail('Valor inválido.');
  return Math.round(n * 100);
};

export const date = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T12:00:00Z'))) fail('Data inválida.');
  return v;
};

export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

export function taxValid(value) {
  const s = String(value || '').replace(/\D/g, '');
  if (/^(\d)\1+$/.test(s)) return false;
  if (s.length === 11) {
    for (let i = 9; i < 11; i++) {
      let sum = 0;
      for (let j = 0; j < i; j++) sum += Number(s[j]) * (i + 1 - j);
      const d = (sum * 10) % 11 % 10;
      if (d !== Number(s[i])) return false;
    }
    return true;
  }
  if (s.length === 14) {
    for (let n = 12; n < 14; n++) {
      let sum = 0,
        w = n - 7;
      for (let i = 0; i < n; i++) {
        sum += Number(s[i]) * w;
        if (--w < 2) w = 9;
      }
      const r = sum % 11;
      if ((r < 2 ? 0 : 11 - r) !== Number(s[n])) return false;
    }
    return true;
  }
  return false;
}

export function commercial(b, service) {
  const base = b.base === undefined ? service.price : cents(b.base);
  const extra = cents(b.extra || 0);
  const subtotal = base + extra;
  let discount =
    b.discountType === 'percent'
      ? Math.round((subtotal * Number(b.discount || 0)) / 100)
      : cents(b.discount || 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) fail('Desconto inválido.');
  return {
    base,
    extra,
    extraName: String(b.extraName || ''),
    subtotal,
    discount,
    discountType: b.discountType || 'fixed',
    discountInput: Number(b.discount || 0),
    total: subtotal - discount
  };
}

export function installments(total, count, first) {
  count = Number(count);
  if (!Number.isInteger(count) || count < 1 || count > 60) fail('Escolha de 1 a 60 parcelas.');
  date(first);
  const [y, m, d] = first.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const last = new Date(Date.UTC(y, m + i, 0)).getUTCDate();
    const at = new Date(Date.UTC(y, m - 1 + i, Math.min(d, last))).toISOString().slice(0, 10);
    return {
      number: i + 1,
      amount: Math.floor(total / count) + (i < total % count ? 1 : 0),
      due: at,
      status: 'Pendente'
    };
  });
}
