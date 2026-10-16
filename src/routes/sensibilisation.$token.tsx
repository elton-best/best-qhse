import { createFileRoute } from "@tanstack/react-router";
import { PublicAwarenessPage } from "@/components/app/awareness/PublicAwarenessPage";

export const Route = createFileRoute("/sensibilisation/$token")({
  head: () => ({ meta: [{ title: "Sensibilisation — LOGIQUALI" }, { name: "robots", content: "noindex" }] }),
  component: function PublicAwareness() {
    const { token } = Route.useParams();
    return <PublicAwarenessPage token={token} />;
  },
});
