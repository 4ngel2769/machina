/** Reading the un-controlled inputs on the VM page by id. */

/** Value of an input/select by id, or '' when it is not on the page. */
export function fieldValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.value : '';
}

/** First file picked in a file input by id, or null. */
export function pickedFile(id: string): File | null {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el || !el.files) return null;
  return el.files[0] ?? null;
}
