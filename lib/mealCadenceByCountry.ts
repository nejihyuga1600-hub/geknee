// Local meal cadence windows for the live-now page. Traveling in Spain
// and hungry at 8 PM? Restaurants have been closed for hours. Traveling
// in Germany and hungry at 3 PM? Kitchen shuts at 2. This card cuts the
// "wait, is it too late/too early to eat" question that eats a
// disproportionate share of first-day frustration.
//
// Times are approximations for the *majority* of restaurants in the
// country; higher-end and tourist-district spots run later. Kept short
// on purpose — over-caveating destroys the "quick nudge" feel.

export interface MealWindow {
  meal: 'breakfast' | 'lunch' | 'dinner';
  startHour: number;  // 24h local
  endHour: number;    // 24h local (exclusive-ish)
  note?: string;
}

const MEAL_WINDOWS_BY_COUNTRY: Record<string, MealWindow[]> = {
  ES: [
    { meal: 'breakfast', startHour: 8,  endHour: 11, note: 'Coffee + pastry culture; big breakfasts are rare.' },
    { meal: 'lunch',     startHour: 13, endHour: 16, note: 'Menu del día 3-course fixed price is the way.' },
    { meal: 'dinner',    startHour: 21, endHour: 23, note: 'Nothing serves before 8:30 PM outside tourist zones.' },
  ],
  FR: [
    { meal: 'breakfast', startHour: 7,  endHour: 10, note: 'Cafés serve viennoiseries; a "petit déjeuner" is coffee + croissant.' },
    { meal: 'lunch',     startHour: 12, endHour: 14, note: 'Formule/menu deals are lunch-only; kitchens close ~2:30 PM.' },
    { meal: 'dinner',    startHour: 19, endHour: 22, note: 'Reservations often required after 8 PM.' },
  ],
  IT: [
    { meal: 'breakfast', startHour: 7,  endHour: 10, note: 'Standing at the bar is cheapest — a cornetto + espresso is <€3.' },
    { meal: 'lunch',     startHour: 12, endHour: 15, note: 'Trattorias close 3 PM until dinner.' },
    { meal: 'dinner',    startHour: 19, endHour: 23, note: '"Aperitivo hour" 6-8 PM: cocktail + free snack buffet.' },
  ],
  DE: [
    { meal: 'breakfast', startHour: 7,  endHour: 11, note: 'Bakery breakfast (bread + cheese + jam) is standard.' },
    { meal: 'lunch',     startHour: 11, endHour: 14, note: 'Hot midday meal is traditional — mittagstisch specials at ~€10.' },
    { meal: 'dinner',    startHour: 18, endHour: 22, note: 'Cold cuts + bread ("Abendbrot") often replace a hot dinner.' },
  ],
  GB: [
    { meal: 'breakfast', startHour: 7,  endHour: 11, note: 'Full English served all day at "greasy spoons".' },
    { meal: 'lunch',     startHour: 12, endHour: 15 },
    { meal: 'dinner',    startHour: 18, endHour: 22, note: 'Pubs stop food service ~9 PM; kitchens close before the bar does.' },
  ],
  CZ: [
    { meal: 'breakfast', startHour: 7,  endHour: 10 },
    { meal: 'lunch',     startHour: 11, endHour: 14, note: 'Every pub has a €7 daily lunch menu ("polední menu").' },
    { meal: 'dinner',    startHour: 18, endHour: 22 },
  ],
  US: [
    { meal: 'breakfast', startHour: 6,  endHour: 11 },
    { meal: 'lunch',     startHour: 11, endHour: 15 },
    { meal: 'dinner',    startHour: 17, endHour: 22, note: 'Kitchens often close 10 PM; late-night limited outside big cities.' },
  ],
  JP: [
    { meal: 'breakfast', startHour: 7,  endHour: 10 },
    { meal: 'lunch',     startHour: 11, endHour: 14, note: 'Set lunches ("teishoku") — best value of the day.' },
    { meal: 'dinner',    startHour: 18, endHour: 22, note: 'Izakaya starts filling up around 7 PM; reserve for premium sushi.' },
  ],
  IN: [
    { meal: 'breakfast', startHour: 7,  endHour: 10 },
    { meal: 'lunch',     startHour: 12, endHour: 15, note: 'Thali (fixed set meal) is standard business lunch.' },
    { meal: 'dinner',    startHour: 20, endHour: 23, note: 'Dinner runs late — 9-10 PM peak.' },
  ],
  TH: [
    { meal: 'breakfast', startHour: 7,  endHour: 10 },
    { meal: 'lunch',     startHour: 11, endHour: 14 },
    { meal: 'dinner',    startHour: 18, endHour: 22, note: 'Street food best 6-10 PM — night markets are the play.' },
  ],
};

// Returns the active meal window for the given local hour, or the NEXT
// window if we're between meals. This makes the card copy naturally
// "Lunch closes in 40 min" / "Dinner opens in 2 hr".
export function currentMealContext(countryCode: string | null, now: Date = new Date()):
  | { state: 'active';      window: MealWindow; minsUntilCloses: number }
  | { state: 'next';        window: MealWindow; minsUntilOpens: number }
  | { state: 'closed_all' }
  | null
{
  if (!countryCode) return null;
  const windows = MEAL_WINDOWS_BY_COUNTRY[countryCode.toUpperCase()];
  if (!windows?.length) return null;

  const hour = now.getHours() + now.getMinutes() / 60;

  // Active window: current hour falls inside.
  for (const w of windows) {
    if (hour >= w.startHour && hour < w.endHour) {
      return {
        state: 'active',
        window: w,
        minsUntilCloses: Math.round((w.endHour - hour) * 60),
      };
    }
  }

  // Next window: pick the soonest upcoming today. If none, closed_all.
  const upcoming = windows.filter(w => w.startHour > hour);
  if (upcoming.length === 0) return { state: 'closed_all' };
  const next = upcoming.reduce((a, b) => (a.startHour < b.startHour ? a : b));
  return {
    state: 'next',
    window: next,
    minsUntilOpens: Math.round((next.startHour - hour) * 60),
  };
}
