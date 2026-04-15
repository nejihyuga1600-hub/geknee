import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface RecommendationsBody {
  location: string;
  purpose: string;
  style: string;
  budget: string;
  interests: string;
  startDate: string;
  endDate: string;
  nights: string;
  itinerary: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  let body: RecommendationsBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const { location, purpose, style, budget, interests, startDate, endDate, nights, itinerary } = body;

  const prompt = `You are a travel expert. Based on the itinerary below and trip details, extract and expand on hotels, restaurants, and activities for ${location}.

Trip: ${nights} nights in ${location} (${startDate} to ${endDate})
Purpose: ${purpose} | Style: ${style} | Budget: ${budget}
Interests: ${interests}

Itinerary (extract any mentioned hotels, restaurants, activities and mark them fromItinerary: true):
${itinerary.slice(0, 5000)}

Return ONLY a raw JSON object (no markdown, no code fences) with exactly this structure:
{
  "hotels": [
    {
      "name": "Hotel Name",
      "neighborhood": "Area/District",
      "description": "1-2 sentence description",
      "priceRange": "$100-200/night",
      "pros": ["pro1", "pro2", "pro3"],
      "cons": ["con1", "con2"],
      "fromItinerary": true
    }
  ],
  "restaurants": [
    {
      "name": "Restaurant Name",
      "cuisine": "Cuisine Type",
      "neighborhood": "Area",
      "description": "1 sentence description",
      "priceRange": "$$",
      "reservationNote": "Tip about reservations or walk-in",
      "fromItinerary": true
    }
  ],
  "activities": [
    {
      "name": "Activity Name",
      "description": "1-2 sentence description",
      "duration": "2-3 hours",
      "priceEstimate": "$25/person",
      "tip": "Practical tip",
      "fromItinerary": true
    }
  ]
}

Rules:
- Include 3-5 hotels, 6-8 restaurants, 6-8 activities
- Items mentioned in the itinerary get fromItinerary: true and must appear FIRST in each array
- All other items get fromItinerary: false
- Match the traveler's style and budget
- Use real, specific names — no generic placeholders`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "No response from AI" }, { status: 500 });
    }

    // Strip any accidental markdown fences
    const raw = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const data = JSON.parse(raw);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Recommendations error:", msg);
    return Response.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
