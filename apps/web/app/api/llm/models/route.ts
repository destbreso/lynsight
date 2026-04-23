import { NextRequest, NextResponse } from 'next/server';
import { createProvider, type ProviderKind } from '@lynsight/llm';

export const runtime = 'nodejs';

interface ModelsBody {
  provider: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as ModelsBody;
    if (!body.provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }
    const provider = createProvider({
      provider: body.provider,
      model: '',
      baseUrl: body.baseUrl,
      apiKey: body.apiKey ?? process.env['LYNSIGHT_API_KEY'],
      timeoutMs: 5_000,
    });
    const models = await provider.listModels();
    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? 'Unknown error' }, { status: 500 });
  }
}
