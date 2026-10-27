import { getCurrentUser } from "@/lib/auth";
import { WaTabs } from "@/components/whatsapp/wa-tabs";

export default async function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      {user.role ? <WaTabs role={user.role} /> : null}
      {children}
    </>
  );
}
