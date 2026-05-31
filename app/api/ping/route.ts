import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ ok: true, version: '2026-05-31', routes: 'images+ping' })
}
