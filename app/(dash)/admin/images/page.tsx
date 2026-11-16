/**
 * Admin image library: qcow2 images, sync and import.
 */
'use client';

import { ImagesCard } from './card';
import { useAdminImages } from '../use';

export default function AdminImagesPage() {
  const admin = useAdminImages();

  return (
    <>
      <h1>images</h1>
      <div className="sub">qcow2 library, sync and import</div>
      <ImagesCard imgs={admin.imgs} post={admin.post} onImport={admin.importImage} />
    </>
  );
}
