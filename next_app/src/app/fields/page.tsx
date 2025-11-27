import FieldCard from "@/components/FieldCard";

type Field = {
  id: string;
  name: string;
  location: string;
  price: number;
  rating: number;
  image: string;
  available: boolean;
  type: "open" | "closed";
  description?: string;
  games: Array<{ id: string; date: string; time: string }>;
  favoritesCount?: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchFields(): Promise<Field[]> {
  try {
    const res = await fetch(`${API_BASE}/api/fields`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    return [];
  }
}

export default async function FieldsPage() {
  const fields = await fetchFields();

  return (
    <main className="container">
      <h1 className="text-2xl font-bold mb-4">Football Fields</h1>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {fields.map((f) => (
          <FieldCard key={f.id} field={f as any} />
        ))}
      </section>
    </main>
  );
}
