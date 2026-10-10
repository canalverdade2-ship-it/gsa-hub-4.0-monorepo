import React, { useEffect, useState } from 'react';
import { Plus, TicketPercent } from 'lucide-react';
import { api } from '../../api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

type Coupon = {
  code: string;
  type: 'Percentual' | 'Valor fixo' | string;
  value: string;
  status: string;
  maxUses?: number;
  start?: string;
  end?: string;
  maxDiscount?: string;
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [code, setCode] = useState('');
  const [value, setValue] = useState('');
  const [couponType, setCouponType] = useState<'Percentual' | 'Valor fixo'>('Percentual');
  const [maxUses, setMaxUses] = useState('1');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Coupon | null>(null);

  const notify = (message: string, type: 'success' | 'error') => setFeedback({ message, type });

  useEffect(() => {
    api('/infinitepay/coupons')
      .then((data) => setCoupons(Array.isArray(data) ? data : []))
      .catch((error: any) => notify(error?.message || 'Não foi possível carregar os cupons.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const sync = async (nextCoupons: Coupon[]) => {
    try {
      const saved = await api('/infinitepay/coupons', { coupons: nextCoupons }, 'PUT');
      setCoupons(Array.isArray(saved) ? saved : nextCoupons);
      notify('Cupons atualizados com sucesso.', 'success');
      setModalOpen(false);
      return true;
    } catch (error: any) {
      notify(error?.message || 'Não foi possível salvar o cupom.', 'error');
      return false;
    }
  };

  const resetForm = () => {
    setSelected(null);
    setCode('');
    setValue('');
    setCouponType('Percentual');
    setMaxUses('1');
    setStart('');
    setEnd('');
    setMaxDiscount('');
    setModalOpen(true);
  };

  const openCoupon = (coupon: Coupon) => {
    setSelected(coupon);
    setCode(coupon.code);
    setValue(coupon.value);
    setCouponType(coupon.type === 'Valor fixo' ? 'Valor fixo' : 'Percentual');
    setMaxUses(String(coupon.maxUses || 1));
    setStart(coupon.start || '');
    setEnd(coupon.end || '');
    setMaxDiscount(coupon.maxDiscount || '');
    setModalOpen(true);
  };

  const saveCoupon = async () => {
    if (!code.trim()) return;
    const item: Coupon = {
      code: code.trim().toUpperCase(),
      type: couponType,
      value: value || '0',
      status: selected?.status || 'Ativo',
      maxUses: Number(maxUses) || 1,
      start,
      end,
      maxDiscount: couponType === 'Percentual' ? maxDiscount : ''
    };
    const next = selected
      ? coupons.map((coupon) => coupon.code === selected.code ? item : coupon)
      : [...coupons, item];
    await sync(next);
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const next = coupons.map((coupon) => coupon.code === selected.code
      ? { ...coupon, status: coupon.status === 'Ativo' ? 'Suspenso' : 'Ativo' }
      : coupon);
    await sync(next);
  };

  const deleteCoupon = async () => {
    if (!selected) return;
    await sync(coupons.filter((coupon) => coupon.code !== selected.code));
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {feedback && (
        <div role="status" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, color: feedback.type === 'error' ? '#b91c1c' : '#047857', background: feedback.type === 'error' ? '#fef2f2' : '#ecfdf5', border: `1px solid ${feedback.type === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
          {feedback.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Cupons</h1>
          <p className="page-subtitle">Crie e gerencie descontos para seus clientes.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={resetForm}>Novo Cupom</Button>
      </div>

      {loading ? <div>Carregando cupons...</div> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: 14 }}>Código</th>
                <th style={{ padding: 14 }}>Tipo</th>
                <th style={{ padding: 14 }}>Valor</th>
                <th style={{ padding: 14 }}>Validade</th>
                <th style={{ padding: 14 }}>Status</th>
                <th style={{ padding: 14 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.code} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 16, fontWeight: 800 }}><TicketPercent size={15} color="#2563eb" style={{ verticalAlign: 'middle', marginRight: 8 }} />{coupon.code}</td>
                  <td style={{ padding: 16 }}>{coupon.type}</td>
                  <td style={{ padding: 16 }}>{coupon.type === 'Valor fixo' ? `R$ ${coupon.value}` : `${coupon.value}%`}</td>
                  <td style={{ padding: 16 }}>{coupon.start || '—'} até {coupon.end || '—'}</td>
                  <td style={{ padding: 16, color: coupon.status === 'Ativo' ? '#047857' : '#b45309', fontWeight: 700 }}>{coupon.status}</td>
                  <td style={{ padding: 16 }}><Button size="sm" variant="secondary" onClick={() => openCoupon(coupon)}>Ver detalhes</Button></td>
                </tr>
              ))}
              {!coupons.length && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Nenhum cupom cadastrado.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={selected ? `Detalhes do Cupom ${selected.code}` : 'Novo Cupom'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Código</label>
            <input className="form-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ex.: BEMVINDO10" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Tipo de benefício</label>
            <select className="form-input" value={couponType} onChange={(event) => setCouponType(event.target.value as 'Percentual' | 'Valor fixo')}>
              <option value="Percentual">Percentual (%)</option>
              <option value="Valor fixo">Valor fixo (R$)</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{couponType === 'Valor fixo' ? 'Valor do benefício (R$)' : 'Desconto (%)'}</label>
            <input className="form-input" value={value} onChange={(event) => setValue(event.target.value.replace('%', ''))} placeholder={couponType === 'Valor fixo' ? '50,00' : '10'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Limite de utilizações</label>
              <input type="number" min="1" className="form-input" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
            </div>
            {couponType === 'Percentual' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Desconto máximo (R$)</label>
                <input className="form-input" value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} placeholder="Sem limite" />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Data de início</label><input type="date" className="form-input" value={start} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Data de fim</label><input type="date" className="form-input" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'flex', gap: 8 }}>
            {selected && (
              <>
                <Button variant={selected.status === 'Ativo' ? 'danger' : 'success'} onClick={toggleStatus}>{selected.status === 'Ativo' ? 'Suspender' : 'Ativar'}</Button>
                <Button variant="danger" onClick={() => { if (window.confirm('Deseja excluir este cupom?')) void deleteCoupon(); }}>Excluir</Button>
              </>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={saveCoupon}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
