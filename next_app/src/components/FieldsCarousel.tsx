"use client";
import Carousel from "react-bootstrap/Carousel";
import FieldCard from "@/components/FieldCard";

type Field = { id: string; name: string; location: string };

export default function FieldsCarousel({ fields }: { fields: Field[] }) {
  if (!fields || fields.length === 0) return null;
  return (
    <Carousel>
      {fields.map((f) => (
        <Carousel.Item key={f.id}>
          <div className="d-flex justify-content-center py-2">
            <FieldCard field={{ id: f.id, name: f.name, location: f.location, price: 0, rating: 0, type: "open" }} />
          </div>
        </Carousel.Item>
      ))}
    </Carousel>
  );
}


