import { Suspense } from "react";

import { PresetsScreen } from "@/components/settings/presets-screen";

export default function PresetsPage() {
  return (
    <Suspense>
      <PresetsScreen />
    </Suspense>
  );
}
