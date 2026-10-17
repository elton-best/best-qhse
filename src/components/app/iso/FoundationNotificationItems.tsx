import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  FOUNDATION_NOTIFICATIONS_KEY,
  markFoundationNotificationRead,
  type FoundationNotification,
} from "@/integrations/backend/isoFoundation";
import { useI18n } from "@/lib/i18n";

export function FoundationNotificationItems({
  notifications,
  onOpen,
}: {
  notifications: FoundationNotification[];
  onOpen: (section: string, siteId?: number) => void;
}) {
  const queryClient = useQueryClient();
  const { date } = useI18n();
  const open = async (notification: FoundationNotification) => {
    try {
      await markFoundationNotificationRead(notification.id);
      await queryClient.invalidateQueries({ queryKey: FOUNDATION_NOTIFICATIONS_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur");
    }
    onOpen(
      notification.data.type === "scope_review_due" ? "perimetre" : "objectifs",
      notification.data.data.site_id,
    );
  };
  return (
    <>
      {notifications.map((notification) => (
        <li key={notification.id}>
          <button
            className="flex w-full gap-3 px-4 py-3 text-left hover:bg-secondary"
            onClick={() => void open(notification)}
          >
            <Bell className="mt-1 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-bold">{notification.data.data.title}</span>
              <span className="block text-xs">{notification.data.data.message}</span>
              <span className="text-xs text-muted-foreground">{date(notification.created_at)}</span>
            </span>
          </button>
        </li>
      ))}
    </>
  );
}
