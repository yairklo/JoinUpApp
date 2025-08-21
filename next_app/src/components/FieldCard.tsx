"use client";
import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import FavoriteButton from "@/components/FavoriteButton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type Field = {
  id: string;
  name: string;
  location: string;
  price: number;
  rating: number;
  image?: string | null;
  type: "open" | "closed";
  favoritesCount?: number;
};

export default function FieldCard({ field }: { field: Field }) {
  const imgSrc = field.image && field.image.trim().length > 0 ? field.image : "/images/default-field.jpg";
  const isFree = !field.price || field.price <= 0;
  const typeText = field.type === "open" ? "Open (outdoor)" : "Closed (indoor)";

  return (
    <Card className="group transition hover:-translate-y-[1px] hover:shadow-md">
      <div className="relative overflow-hidden rounded-t-2xl">
        <div className="relative w-full pb-[56.25%]">
          <img src={imgSrc} alt={field.name} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>
      <CardHeader>
        <h3 className="text-lg font-semibold tracking-tight text-[rgb(var(--fg))]">{field.name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 opacity-70" aria-hidden />
          <span className="truncate">{field.location}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[rgb(var(--muted))] px-2.5 py-0.5 text-xs text-[rgb(var(--fg)/0.75)] border border-[rgb(var(--border))]">{typeText}</span>
          <span className="inline-flex items-center rounded-full bg-[rgb(var(--muted))] px-2.5 py-0.5 text-xs text-[rgb(var(--fg)/0.75)] border border-[rgb(var(--border))]">{isFree ? "Free" : "Paid"}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-[rgb(var(--fg)/0.75)]">
          <div className="inline-flex items-center gap-1">
            <Star className="h-4 w-4 fill-[rgb(var(--fg)/0.15)]" aria-hidden />
            <span>{field.favoritesCount ?? 0}</span>
          </div>
          <div className="inline-flex items-center gap-1" title="Rating">
            <span className="opacity-70">⭐</span>
            <span>{field.rating.toFixed(1)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button asChild>
            <Link href={`/games?fieldId=${field.id}`} aria-label={`View games at ${field.name}`}>
              View games
            </Link>
          </Button>
          <div className="inline-flex items-center">
            <FavoriteIconToggle fieldId={field.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FavoriteIconToggle({ fieldId }: { fieldId: string }) {
  // Wrap existing FavoriteButton but visually as icon-only
  return (
    <div className="[&>button]:inline-flex [&>button]:items-center [&>button]:justify-center [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-full [&>button]:border [&>button]:border-[rgb(var(--border))] [&>button]:bg-white/80 hover:[&>button]:bg-[rgb(var(--muted))]">
      <FavoriteButton fieldId={fieldId} />
    </div>
  );
}


