"use client";
import Link from "next/link";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import FavoriteButton from "@/components/FavoriteButton";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import { useState } from "react";
import NewGameInline from "@/components/NewGameInline";

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
  const [showNewGame, setShowNewGame] = useState(false);
  const imgSrc = field.image && field.image.trim().length > 0 ? field.image : "/images/default-field.jpg";
  const isFree = !field.price || field.price <= 0;
  const typeText = field.type === "open" ? "Open (outdoor)" : "Closed (indoor)";

  return (
    <Card style={{ width: "18rem" }}>
      <div style={{ position: "relative" }}>
        <Card.Img variant="top" src={imgSrc} style={{ height: 160, objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 8, left: 8 }}>
          <FavoriteButton fieldId={field.id} />
        </div>
      </div>
      <Card.Body>
        <Card.Title>{field.name}</Card.Title>
        {/* <Card.Text>Design extras hidden per request</Card.Text> */}
      </Card.Body>
      <ListGroup className="list-group-flush">
        <ListGroup.Item>{field.location}</ListGroup.Item>
        <ListGroup.Item>{isFree ? "Free" : `₪${field.price}/hour`}</ListGroup.Item>
        <ListGroup.Item>{typeText}</ListGroup.Item>
      </ListGroup>
      <Card.Body>
        <Link
          href={`/games?fieldId=${field.id}`}
          aria-label={`View games at ${field.name}`}
          className="btn btn-primary btn-sm"
        >
          View games
        </Link>
        <Button variant="secondary" size="sm" className="ms-2" onClick={() => setShowNewGame(true)}>
          New game
        </Button>
        {/* <a className="card-link" href="#">Another Link</a> */}
      </Card.Body>

      {/* Floating modal so layout size doesn't change */}
      <Modal show={showNewGame} onHide={() => setShowNewGame(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>New Game at {field.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-muted small mb-2">{field.location}</div>
          <NewGameInline
            fieldId={field.id}
            onCreated={(fid) => {
              setShowNewGame(false);
              try {
                window.location.href = `/games?fieldId=${fid}`;
              } catch {}
            }}
          />
        </Modal.Body>
      </Modal>
    </Card>
  );
}

// Favorite UI intentionally hidden per request


