/** Create form (admin) and request form (user) for the instances page. */

'use client';

import { useEffect, useState } from 'react';
import type { useInstancesPage } from './use';

type Page = ReturnType<typeof useInstancesPage>;

/** Admin: direct provisioning form. */
export function CreateForm({ page }: { page: Page }) {
  const [name, setName] = useState('');
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3>new instance</h3>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const err = await page.create(name, page.planId, page.imageId);
        if (err === null) setName('');
      }}>
        <div className="row">
          <input placeholder="name (a-z0-9-)" value={name} onChange={(event) => setName(event.target.value)} style={{ minWidth: 160 }} />
          <select value={page.planId} onChange={(event) => page.setPlanId(event.target.value)}>
            {page.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.vcpu}v / {plan.ramMb}MB / ${((plan.hourlyRateCents ?? 0) / 100).toFixed(2)}/h</option>)}
          </select>
          {page.imgPickable ? (
            <select value={page.imageId} onChange={(event) => page.setImageId(event.target.value)}>
              {page.imgs.filter((image) => image.status === 'ready').map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
            </select>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>image: {page.assignedImage ?? 'admin-assigned'}</span>
          )}
          <button className="primary" type="submit" disabled={page.busy || !name}>create</button>
        </div>
      </form>
    </div>
  );
}

/** OS picker row: dropdown for pickable accounts, fixed text otherwise. */
function OsPicker({ page, value, onChange }: {
  page: Page; value: string; onChange: (v: string) => void;
}) {
  if (!page.imgPickable) {
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        OS: {page.assignedImage ?? 'assigned by your admin'}{' '}
        {page.readyImgs.length === 0 && '(no OS images ready on the host yet)'}
      </span>
    );
  }
  return (
    <>
      <span className="muted" style={{ fontSize: 12, minWidth: 28 }}>OS</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={page.readyImgs.length === 0}>
        {page.readyImgs.length === 0 && <option value="">no OS images ready yet</option>}
        {page.readyImgs.map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
      </select>
    </>
  );
}

/** User: request-a-VM form, opens under a toggle in the page. */
export function RequestForm({ page, selectedImage, onImage }: {
  page: Page; selectedImage: string; onImage: (v: string) => void;
}) {
  const [reqName, setReqName] = useState('');
  const [reqPlan, setReqPlan] = useState('');
  const [reqNote, setReqNote] = useState('');

  // Default the plan picker to the first catalog entry, once plans arrive.
  useEffect(() => {
    if (reqPlan || page.plans.length === 0) return;
    setReqPlan(page.plans[0].id);
  }, [page.plans, reqPlan]);

  // Preselect the OS so submitting a request is one click. An assigned image
  // wins over the first alphabetical one, because that is what the account is
  // configured for.
  useEffect(() => {
    if (selectedImage || page.readyImgs.length === 0) return;
    const preferred = page.assignedImage && page.readyImgs.some((image) => image.id === page.assignedImage)
      ? page.assignedImage
      : page.readyImgs[0].id;
    onImage(preferred);
  }, [page.readyImgs, page.assignedImage, selectedImage, onImage]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>request a VM</h3>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const ok = await page.requestInstance(reqName, reqPlan, selectedImage, reqNote);
        if (ok) { setReqName(''); setReqNote(''); onImage(''); }
      }}>
        <div className="row">
          <input placeholder="name" value={reqName} onChange={(event) => setReqName(event.target.value)} style={{ minWidth: 160 }} />
          <select value={reqPlan} onChange={(event) => setReqPlan(event.target.value)}>
            {page.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.vcpu}v / {plan.ramMb}MB</option>)}
          </select>
        </div>
        {/* OS picker. Only rendered for accounts allowed to choose; the
            others are told what they got instead of being offered a
            choice the server would silently override anyway. Only
            'ready' images are offered — 'broken' means the bootability
            audit quarantined it (UEFI-only build, can never boot). */}
        <div className="row" style={{ marginTop: 10 }}>
          <OsPicker page={page} value={selectedImage} onChange={onImage} />
        </div>
        <div style={{ marginTop: 10 }}>
          <textarea placeholder="why you need it (optional)" value={reqNote} onChange={(event) => setReqNote(event.target.value)}
            rows={2} style={{ width: '100%', resize: 'vertical' }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="primary" type="submit" disabled={page.busy || !reqName}>submit request</button>
        </div>
      </form>
    </div>
  );
}
