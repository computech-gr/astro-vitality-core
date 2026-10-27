import { HEALTH_DOMAINS, type HealthDomainId } from "@/domain/health-domains/registry";
import { Button } from "@/components/ui/button";

/** Shared, consistent navigation across the four research health domains. */
export function HealthDomainNavigation({ current }: { current: HealthDomainId }) {
  return (
    <nav aria-label="Astronaut health domains" className="mt-6 flex flex-wrap gap-2">
      {HEALTH_DOMAINS.map((item) => (
        <Button
          key={item.id}
          asChild
          variant="ghost"
          className={`h-auto whitespace-normal rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            item.id === current
              ? "border-primary bg-primary/10 font-semibold text-foreground"
              : "border-border text-foreground hover:bg-muted"
          }`}
        >
          <a href={item.path} aria-current={item.id === current ? "page" : undefined}>
            {item.title}
          </a>
        </Button>
      ))}
    </nav>
  );
}