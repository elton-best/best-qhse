import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider, LanguageSelect, LOCALE_KEY, useI18n } from "@/lib/i18n";
import { RiskExamplePicker } from "@/components/app/iso/RiskExamplePicker";
import { ObjectiveInbox } from "@/components/app/iso/ObjectiveCommunications";
import { LeadershipReviewPage } from "@/components/app/iso/LeadershipReviewPage";
import { isoFoundationApi } from "@/integrations/backend/isoFoundation";
import { backendApi } from "@/integrations/backend/client";
import type { ReactNode } from "react";

vi.mock("@/hooks/use-workspace", () => ({ useCurrentSite: () => ["5", vi.fn()] }));

function mount(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ISO foundation user flows", () => {
  it("persists the interface language and preserves user content", async () => {
    function Labels() {
      const { t } = useI18n();
      return (
        <>
          <span>{t("Engagements de leadership")}</span>
          <p>Objectif saisi en français</p>
        </>
      );
    }
    const page = mount(
      <>
        <LanguageSelect />
        <Labels />
      </>,
    );
    fireEvent.change(screen.getByLabelText("Langue de l’interface"), { target: { value: "en" } });
    expect(screen.getByText("Leadership commitments")).toBeInTheDocument();
    expect(screen.getByText("Objectif saisi en français")).toBeInTheDocument();
    expect(localStorage.getItem(LOCALE_KEY)).toBe("en");
    page.unmount();
    mount(
      <>
        <LanguageSelect />
        <Labels />
      </>,
    );
    await screen.findByText("Leadership commitments");
    expect(screen.getByLabelText("Interface language")).toHaveValue("en");
  });

  it("only applies a risk example after an explicit selection", async () => {
    vi.spyOn(backendApi, "request").mockResolvedValue({
      data: [
        {
          id: "water",
          type: "risque",
          title: { fr: "Pénurie d’eau", en: "Water shortage" },
          description: { fr: "À adapter", en: "Adapt me" },
          cause: { fr: "Sécheresse", en: "Drought" },
          consequence: { fr: "Arrêt", en: "Interruption" },
        },
      ],
    });
    const choose = vi.fn();
    mount(<RiskExamplePicker type="risque" onChoose={choose} />);
    await screen.findByText("Pénurie d’eau");
    expect(choose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Bibliothèque d’exemples"), {
      target: { value: "water" },
    });
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: "water" }), "fr");
  });

  it("lets a recipient acknowledge the version received", async () => {
    const item = {
      id: 17,
      snapshot: {
        ref: "OBJ-1",
        title: "Économiser l’eau",
        description: "Version diffusée",
        target_value: "10",
        unit: "%",
        deadline: "2026-12-01",
        updated_at: "2026-10-01",
      },
      content_locale: "fr" as const,
      created_at: "2026-10-01",
      message: "À lire",
      acknowledged_at: null,
    };
    vi.spyOn(isoFoundationApi, "inbox")
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValue({ data: [{ ...item, acknowledged_at: "2026-10-16T10:00:00Z" }] });
    const acknowledge = vi.spyOn(isoFoundationApi, "acknowledge").mockResolvedValue({});
    mount(<ObjectiveInbox siteId="5" />);
    await screen.findByText("Économiser l’eau");
    fireEvent.click(screen.getByText("Accuser réception"));
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith(17));
    await screen.findByText(/Lecture confirmée/);
    expect(screen.queryByText("Accuser réception")).not.toBeInTheDocument();
  });

  it("requires all leadership commitments to be justified before completion", async () => {
    const commitments = Object.fromEntries(
      "abcdefghi"
        .split("")
        .map((code) => [code, { fr: `Engagement ${code}`, en: `Commitment ${code}` }]),
    );
    vi.spyOn(isoFoundationApi, "leadership").mockResolvedValue({
      data: { commitments, reviews: [], can_manage: true },
    });
    const save = vi.spyOn(isoFoundationApi, "saveLeadership").mockResolvedValue({
      data: { id: 1, year: 2026, answers: {}, status: "completed", completed_at: "2026-10-16" },
    });
    mount(<LeadershipReviewPage />);
    await screen.findByText("Engagement a");
    expect(screen.getByText("Finaliser la revue")).toBeDisabled();
    for (const select of screen.getAllByRole("combobox"))
      fireEvent.change(select, { target: { value: "yes" } });
    expect(screen.getByText("Finaliser la revue")).toBeDisabled();
    for (const textarea of screen.getAllByRole("textbox"))
      fireEvent.change(textarea, { target: { value: "Preuve de revue annuelle" } });
    fireEvent.click(screen.getByText("Finaliser la revue"));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: "5",
          status: "completed",
          answers: expect.objectContaining({
            i: { status: "yes", justification: "Preuve de revue annuelle" },
          }),
        }),
      ),
    );
  });
});
