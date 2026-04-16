import { prisma } from './prisma';

// claude-sonnet-4-6 pricing (Tier 1, per million tokens)
const INPUT_RATE  = 3.00;   // $3.00 / M input tokens
const OUTPUT_RATE = 15.00;  // $15.00 / M output tokens

export function calcCostUsd(input: number, output: number): number {
  return (input / 1_000_000) * INPUT_RATE + (output / 1_000_000) * OUTPUT_RATE;
}

export async function addTokenUsage(userId: string, input: number, output: number): Promise<void> {
  if (!input && !output) return;
  const date = new Date().toISOString().slice(0, 10); // "2026-04-15"
  await prisma.dailyTokenUsage.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, inputTokens: input, outputTokens: output, callCount: 1 },
    update: {
      inputTokens:  { increment: input },
      outputTokens: { increment: output },
      callCount:    { increment: 1 },
    },
  });
}

export async function getTodayUsage(userId: string) {
  const date = new Date().toISOString().slice(0, 10);
  return (
    (await prisma.dailyTokenUsage.findUnique({ where: { userId_date: { userId, date } } })) ??
    { userId, date, inputTokens: 0, outputTokens: 0, callCount: 0 }
  );
}
