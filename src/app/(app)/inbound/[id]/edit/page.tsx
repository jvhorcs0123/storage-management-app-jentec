"use client";

import { useParams } from "next/navigation";
import InboundForm from "@/components/InboundForm";

export default function EditInboundPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  if (!id) return null;
  return <InboundForm inboundId={id} />;
}
