/** Shapes for the account page. */

export type Req = { id: string; name: string; planId: string; status: string; createdAt: number; reviewNote: string | null };
export type DelReq = { id: string; status: string; requestedAt: number };
