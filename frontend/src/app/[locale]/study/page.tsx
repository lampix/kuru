import { Suspense } from "react";

import { StudyScreen } from "@/components/review/study-screen";

/** Full-screen review. The deck id is a search parameter so the page stays static (offline). */
export default function StudyPage() {
  return (
    <Suspense>
      <StudyScreen />
    </Suspense>
  );
}
