// Trip file vault — list + upload. Any TripMember can list and upload files
// for a trip; visibility (public|private) is per-file and set by the
// uploader at upload time. Public files are visible to every member;
// private files are visible only to whoever uploaded them.
//
// Storage backend: Vercel Blob (same primitive used by
// app/api/itinerary/media). Falls back to inline error if BLOB_READ_WRITE_TOKEN
// isn't configured — there's no point storing a TripFile row without an
// actual file.

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTripAccess } from "@/lib/tripAccess";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB cap per file
const ALLOWED_TAGS = new Set(["passport", "booking", "insurance", "photo", "other"]);
const ALLOWED_VIS  = new Set(["public", "private"]);

function fileShape(f: {
  id: string; name: string; url: string; size: number; tag: string;
  visibility: string; createdAt: Date; userId: string;
  user: { name: string | null; image: string | null };
}, viewerId: string) {
  return {
    id: f.id,
    name: f.name,
    url: f.url,
    size: f.size,
    tag: f.tag,
    visibility: f.visibility,
    createdAt: f.createdAt.toISOString(),
    isOwner: f.userId === viewerId,
    user: { name: f.user.name, image: f.user.image },
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await getTripAccess(tripId, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.tripFile.findMany({
    where: {
      tripId,
      OR: [
        { visibility: "public" },
        { userId },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, image: true } } },
  });

  return NextResponse.json({ files: rows.map(r => fileShape(r, userId)) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await getTripAccess(tripId, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "File storage not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  }

  const tag = String(form.get("tag") ?? "other");
  if (!ALLOWED_TAGS.has(tag)) return NextResponse.json({ error: "Invalid tag" }, { status: 400 });

  const visibility = String(form.get("visibility") ?? "public");
  if (!ALLOWED_VIS.has(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
  const storagePath = `trip-files/${tripId}/${userId}/${Date.now()}-${safeName}`;

  let url: string;
  try {
    const bytes = await file.arrayBuffer();
    const uploaded = await put(storagePath, Buffer.from(bytes), {
      access: "public",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    url = uploaded.url;
  } catch (err) {
    console.error("[trips/files] blob upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  const row = await prisma.tripFile.create({
    data: {
      tripId,
      userId,
      name: file.name.slice(0, 200),
      url,
      storagePath,
      size: file.size,
      tag,
      visibility,
    },
    include: { user: { select: { name: true, image: true } } },
  });

  return NextResponse.json({ file: fileShape(row, userId) });
}
