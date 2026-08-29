import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function LocationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex flex-col">
      <SiteHeader />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
