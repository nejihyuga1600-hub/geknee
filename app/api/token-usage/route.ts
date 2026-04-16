import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTodayUsage, calcCostUsd } from "@/lib/tokenTracking";

// Daily Anthropic spend budgets per plan (USD)
const PLAN_BUDGETS: Record<string, number> = {
  free: 0.50,   // $0.50 / day
  pro:  5.00,   // $5.00 / day
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const userId = (session.user as { id: string }).id;
  const [usage, user] = await Promise.all([
    getTodayUsage(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    }),
  ]);

  const costUsd = calcCostUsd(usage.inputTokens, usage.outputTokens);

  // Priority: explicit env override → plan-based budget → $1 default
  const dailyBudget =
    parseFloat(process.env.ANTHROPIC_DAILY_BUDGET_USD ?? "0") ||
    (PLAN_BUDGETS[user?.plan ?? "free"] ?? 1.00);

  const pct = Math.round((costUsd / dailyBudget) * 1000) / 10;

  return Response.json({
    date:           usage.date,
    inputTokens:    usage.inputTokens,
    outputTokens:   usage.outputTokens,
    callCount:      usage.callCount,
    costUsd:        Math.round(costUsd * 10000) / 10000,
    pct,
    dailyBudgetUsd: dailyBudget,
    plan:           user?.plan ?? "free",
  });
}
