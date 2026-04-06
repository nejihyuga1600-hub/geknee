import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(req: Request) {
  const form = await req.formData();
  const image = form.get('image') as File | null;
  const prompt = (form.get('prompt') as string | null)
    ?? 'What travel destinations or experiences does this inspire?';

  if (!image) return Response.json({ error: 'No image provided' }, { status: 400 });

  const bytes = await image.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const mediaType = (image.type || 'image/jpeg') as
    'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: `You are GeKnee AI Genie, a travel inspiration expert.

When given an image or video frame:
1. FIRST try to identify the exact location (landmark, city, country, region). If you can identify it, lead with: "📍 This looks like [Place]!" then explain why it's worth visiting.
2. If you CANNOT identify the specific location, describe the travel vibe it evokes (beach paradise, mountain adventure, urban culture, etc.) and suggest 2-3 real destinations with that same feel.

Always be specific, enthusiastic, and end with an actionable suggestion the user can explore on GeKnee.`,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
