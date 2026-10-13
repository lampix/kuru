import { TabBar } from "@/components/ios";

/** Screens reachable from the tab bar. */
export default function TabsLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <>
      <div className="pb-[calc(49px+env(safe-area-inset-bottom))]">{children}</div>
      <TabBar />
    </>
  );
}
