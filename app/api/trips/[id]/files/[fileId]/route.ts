// Per-file actions on a trip's vault. DELETE = the uploader (or the trip
// owner) removes a file. PATCH = the uploader flips public ↔ private.
// Members other than the uploader can't change visibility — that's a
// uploader-only decision.

import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTripAccess } from "@/lib/tripAccess";

const ALLOWED_VIS = new Set(["public", "private"]);

async function loadFile(tripId: string, fileId: string) {
  const row = await prisma.tripFile.findUnique({ where: { id: fileId } });
  if (!row || row.tripId !== tripId) return null;
  return row;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id: tripId, fileId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getTripAccess(tripId, userId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = await loadFile(tripId, fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Uploader or trip owner can delete; anyone else gets 403.
  const isUploader = file.userId === userId;
  const isOwner = access.role === "owner";
  if (!isUploader && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try { await del(file.url, { token: process.env.BLOB_READ_WRITE_TOKEN }); }
    catch (err) { console.warn("[trips/files] blob delete failed:", err); }
  }
  await prisma.tripFile.delete({ where: { id: fileId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id: tripId, fileId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await getTripAccess(tripId, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await loadFile(tripId, fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (file.userId !== userId) {
    return NextResponse.json({ error: "Only the uploader can change visibility" }, { status: 403 });
  }

  let body: { visibility?: string };
  try { body = (await req.json()) as { visibility?: string }; }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const visibility = String(body.visibility ?? "");
  if (!ALLOWED_VIS.has(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  const updated = await prisma.tripFile.update({
    where: { id: fileId },
    data: { visibility },
  });
  return NextResponse.json({ file: { id: updated.id, visibility: updated.visibility } });
}
