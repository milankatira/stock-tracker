import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";

interface RevalidateBody {
  readonly tag?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as RevalidateBody;
  const tag = body.tag;
  if (!tag) {
    return NextResponse.json({ ok: false, error: "missing tag" }, { status: 400 });
  }

  const secret = process.env.REVALIDATE_HMAC_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "server misconfigured" },
      { status: 500 },
    );
  }

  const headerHmac = req.headers.get("x-revalidate-hmac") ?? "";
  const expected = createHmac("sha256", secret).update(tag).digest("hex");

  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(headerHmac, "hex");
    b = Buffer.from(expected, "hex");
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  revalidateTag(tag);
  return NextResponse.json({ ok: true, tag });
}
