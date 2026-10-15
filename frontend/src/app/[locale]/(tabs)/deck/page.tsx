import { Suspense } from "react";

import { DeckOverviewScreen } from "@/components/deck/deck-overview-screen";

/** Deck overview. The deck id is a search parameter so the page stays static (offline). */
export default function DeckPage() {
  return (
    <Suspense>
      <DeckOverviewScreen />
    </Suspense>
  );
}
