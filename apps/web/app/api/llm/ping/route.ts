import { NextRequest, NextResponse } from 'next/server';
import { createProvider, type ProviderKind } from '@lynsight/llm';

export const runtime = 'nodejs';

interface PingBody {
  provider: ProviderKind;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as PingBody;
    if (!body.provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }
    const provider = createProvider({
      provider: body.provider,
      model: body.model ?? '',
      baseUrl: body.baseUrl,
      apiKey: body.apiKey ?? process.env['LYNSIGHT_API_KEY'],
      timeoutMs: 5_000,
    });
    const result = await provider.ping();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message ?? 'Unknown error' },
      { status: 500 },
    );
  }
}
