import { useState } from 'react';
import { X } from 'lucide-react';
import { C, display, body, mono } from './tokens';
import { Button, Field, TextInput, Select, inputStyle } from './primitives';

/* ---------------------------------- modal ---------------------------------- */
export function Modal({ title, onClose, children, footer }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,6,9,0.65)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderSoft}` }}
        >
          <h3 style={{ ...display, fontSize: 15, fontWeight: 600, color: C.text }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10151C]"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: C.textFaint,
              borderRadius: 4,
            }}
          >
            <X size={17} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2"
            style={{ padding: '14px 20px', borderTop: `1px solid ${C.borderSoft}` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- user detail / edit modal ---------------------------------- */
export function UserDetailModal({ user, onClose, onSave }) {
  const [form, setForm] = useState(user);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      title={form.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(form)}>
            Save changes
          </Button>
        </>
      }
    >
      <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginBottom: 16 }}>
        {user.id} · {user.wallet}
      </div>

      <Field label="Full name">
        <TextInput value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Email">
        <TextInput value={form.email} onChange={set('email')} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Risk profile">
          <Select
            value={form.risk}
            onChange={set('risk')}
            options={['Conservative', 'Balanced', 'Aggressive']}
          />
        </Field>
        <Field label="Account status">
          <Select
            value={form.status}
            onChange={set('status')}
            options={['active', 'flagged', 'onboarding', 'suspended']}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Active signal flows">
          <TextInput value={form.bots} onChange={set('bots')} type="number" />
        </Field>
        <Field label="Portfolio value">
          <TextInput value={form.value} onChange={set('value')} />
        </Field>
      </div>

      <Field label="Wallet balance (USD)">
        <TextInput
          value={form.walletBalance}
          onChange={set('walletBalance')}
          type="number"
          min="0"
        />
      </Field>

      <Field label="Wallet address">
        <TextInput value={form.wallet} onChange={set('wallet')} style={mono} />
      </Field>

      <Field label="Admin notes">
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={3}
          placeholder="Internal notes — not visible to the user."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 4 }}>
        Joined {form.joined}
      </div>
    </Modal>
  );
}

/* ---------------------------------- add bot modal ---------------------------------- */
export function AddBotModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    type: 'Grid',
    pair: 'ETH/USDC',
    user: '',
    confidence: 80,
    status: 'running',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      title="Add signal flow"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onAdd(form)} disabled={!form.user}>
            Create signal flow
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Strategy type">
          <Select
            value={form.type}
            onChange={set('type')}
            options={['Grid', 'DCA', 'Arbitrage', 'Trailing Stop']}
          />
        </Field>
        <Field label="Pair">
          <Select
            value={form.pair}
            onChange={set('pair')}
            options={['ETH/USDC', 'BTC/USDC', 'SOL/USDT', 'ARB/USDC']}
          />
        </Field>
      </div>
      <Field label="Assigned user">
        <TextInput value={form.user} onChange={set('user')} placeholder="e.g. Marcus Owusu" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model confidence (%)">
          <TextInput
            type="number"
            min="0"
            max="100"
            value={form.confidence}
            onChange={set('confidence')}
          />
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={set('status')}
            options={['running', 'paused', 'fallback']}
          />
        </Field>
      </div>
      <div style={{ fontSize: 11.5, color: C.textFaint }}>
        Signal flows below 70% confidence automatically revert to static parameters per the fallback
        policy.
      </div>
    </Modal>
  );
}

/* ---------------------------------- reject kyc modal ---------------------------------- */
export function RejectKycModal({ onClose, onReject }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    onReject(reason.trim());
  };

  return (
    <Modal
      title="Reject verification"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Reject application
          </Button>
        </>
      }
    >
      <Field label="Reason (shown to the user)">
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError('');
          }}
          rows={3}
          placeholder="e.g. ID document image was unreadable — please resubmit a clearer photo."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      {error && <div style={{ ...body, color: C.red, fontSize: 12 }}>{error}</div>}
    </Modal>
  );
}

/* ---------------------------------- add model modal ---------------------------------- */
export function AddModelModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: '', scope: '', confidence: 80, drift: 'stable' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      title="Register ML model"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onAdd(form)} disabled={!form.name}>
            Register model
          </Button>
        </>
      }
    >
      <Field label="Model name">
        <TextInput
          value={form.name}
          onChange={set('name')}
          placeholder="e.g. Slippage Prediction (GBM)"
        />
      </Field>
      <Field label="Scale / used by">
        <TextInput value={form.scope} onChange={set('scope')} placeholder="e.g. Copy trading" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Confidence (%)">
          <TextInput
            type="number"
            min="0"
            max="100"
            value={form.confidence}
            onChange={set('confidence')}
          />
        </Field>
        <Field label="Drift status">
          <Select
            value={form.drift}
            onChange={set('drift')}
            options={['stable', 'watch', 'critical']}
          />
        </Field>
      </div>
      <div style={{ fontSize: 11.5, color: C.textFaint }}>
        New models start in shadow mode until confidence is validated against live traffic.
      </div>
    </Modal>
  );
}
