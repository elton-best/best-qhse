import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyProfile } from "@/lib/profile.functions";

/** Espace d'administration de la plateforme : réservé au super administrateur. */
export const Route = createFileRoute("/_authenticated/superadmin")({
  head: () => ({
    meta: [
      { title: "Administration — LOGIQUALI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async () => {
    const profile = await getMyProfile();
    if (profile.user_type !== "super_admin") throw redirect({ to: "/app" });
    return profile;
  },
  component: () => <Outlet />,
});
