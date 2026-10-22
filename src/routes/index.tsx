import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Novamart" },
      { name: "description", content: "Novamart" },
      { property: "og:title", content: "Novamart" },
      { property: "og:description", content: "Novamart" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <h1 className="text-6xl font-bold tracking-tight text-foreground md:text-8xl">Novamart</h1>
    </main>
  );
}
