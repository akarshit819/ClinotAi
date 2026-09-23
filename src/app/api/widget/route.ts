import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ error: "Website widget is no longer available" }, { status: 404 })
}

export async function PUT() {
  return NextResponse.json({ error: "Website widget is no longer available" }, { status: 404 })
}
