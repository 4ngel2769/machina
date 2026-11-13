/**
 * Instance list: create, request, start, stop and delete the user's VMs.
 */
'use client';

import { useState } from 'react';
import { CreateForm, RequestForm } from './forms';
import { InstancesGrid } from './grid';
import { useInstancesPage } from './use';

export default function InstancesPage() {
  const page = useInstancesPage();
  const isAdmin = page.role === 'admin';
  const [reqOpen, setReqOpen] = useState(false);
  const [reqImage, setReqImage] = useState('');

  return (
    <>
      <h1>instances</h1>
      <div className="sub">{isAdmin ? 'provision and manage VMs' : 'your VMs · request new ones from the admin'}</div>

      {isAdmin && <CreateForm page={page} />}

      {!isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <button className="primary" onClick={() => setReqOpen((prev) => !prev)}>{reqOpen ? 'cancel' : 'request instance'}</button>
          {reqOpen && <RequestForm page={page} selectedImage={reqImage} onImage={setReqImage} />}
        </div>
      )}

      <InstancesGrid page={page} isAdmin={isAdmin} onRequest={() => setReqOpen(true)} />
    </>
  );
}
