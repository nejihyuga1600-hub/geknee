// lib/safety/lostDocs.ts
// Static, offline checklist shown in the Safety card. Order matters.

export interface LostDocStep {
  title: string;
  detail: string;
}

export const LOST_DOC_STEPS: LostDocStep[] = [
  {
    title: 'Get somewhere safe, then report it to local police',
    detail: 'Ask for a written police report — insurers and embassies require it to replace documents.',
  },
  {
    title: 'Contact your embassy or consulate',
    detail: 'They issue emergency travel documents. (An in-app embassy locator is coming; until then search "<your country> embassy <city>".)',
  },
  {
    title: 'Freeze your cards',
    detail: 'Call your bank or use its app to freeze/cancel lost cards immediately.',
  },
  {
    title: 'Use your digital copies',
    detail: 'Open your ticket/confirmation wallet for digital copies of bookings and IDs.',
  },
];
