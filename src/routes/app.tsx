import { createFileRoute } from "@tanstack/react-router";
import { LiveDashboard } from "@/components/live/LiveDashboard";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";

export const Route = createFileRoute("/app")({
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "Painel · Pitch AI" },
      {
        name: "description",
        content:
          "Configure a automação da sua LIVE do TikTok Shop: proteção, respostas com IA, voz em tempo real.",
      },
      { property: "og:title", content: "Painel · Pitch AI" },
      {
        property: "og:description",
        content: "Automatize sua LIVE do TikTok Shop.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LiveDashboard,
});
